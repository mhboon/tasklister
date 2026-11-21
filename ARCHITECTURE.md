# Tasklister — Architecture

Same shape as the popla app, in the same AWS account (no separate QA).

```
browser ──► CloudFront (<your-domain>) ──► S3 (private, OAC)   static React app
   │
   ├──► Cognito (SRP sign-in, email + password)
   └──► AppSync (GraphQL, Cognito auth) ──► ApiFn (Lambda) ──► DynamoDB ×6, Cognito admin API
EventBridge (daily 03:00 UTC) ──► RecurringFn (Lambda) ──► DynamoDB
```

## Stacks (`infra/lib`)

| Stack | Region | Contents |
|---|---|---|
| `TasklisterBackendStack` | eu-west-1 | tables, Cognito, AppSync, ApiFn, RecurringFn + schedule |
| `TasklisterCertStack` | us-east-1 | ACM certificate for `<your-domain>` (CloudFront requires us-east-1), DNS-validated in the existing `<your-zone>` zone |
| `TasklisterWebStack` | eu-west-1 | S3, CloudFront + security headers/CSP, Route 53 A/AAAA, deploy of `web/dist` |
| `TasklisterMailStack` | eu-west-1 | items by email: S3 bucket (mail kept ≤1 day), SES receipt rule set (made the active one), `GateFn` + `ProcessFn`, MX record for the site domain |
| `TasklisterGithubOidcStack` | eu-west-1 | one-time: deploy role for GitHub Actions. Reuses the account's existing GitHub OIDC provider (an account can have only one) |

The web stacks need a concrete `env` for cross-region references, taken from
`CDK_DEFAULT_ACCOUNT` (deploy credentials), so no account ID is committed. The
hosted zone ID, zone name and site domain come from `HOSTED_ZONE_ID`,
`HOSTED_ZONE_NAME` and `SITE_DOMAIN`.

## Items by email

SES receives all mail for the site domain (MX record) in one receipt rule with
three actions, in order:

1. **`GateFn`** (synchronous). Decides before anything is stored. First, if the subject quotes a
   claim code (`TL-XXXXXX`) and the From address matches the pending claim, that address becomes a
   verified extra sender (alias) of the person who asked, and the mail is used up. Otherwise it reads the visible From
   address, requires DMARC pass and clean spam/virus verdicts, finds the sender (a registered,
   enabled user, or the owner of a verified extra sender address), resolves each recipient (`me@` → the sender's Inbox, `<name>@` → the list in
   `TasklisterMailboxes`, only if the sender is a member) and counts the sender's mails per hour.
   Anything that fails returns `STOP_RULE_SET`: the mail is dropped, never bounced, so nobody can
   tell which check failed. SES accepts the whole domain for exactly this reason.
2. **S3**: the raw mail, expiring after a day.
3. **`ProcessFn`** (asynchronous, no retries so an item is never added twice). Repeats the
   checks, parses the mail (subject → title, plain text → notes), looks the link up when the title is a link
   and there are no notes (the code behind `linkPreview`), creates the item and deletes the object.

SES allows one active receipt rule set per region and account, so the stack activates its own
(a custom resource, because CloudFormation can't) and deactivates it on delete.

## Data (one table per entity)

| Table | Key | Notes |
|---|---|---|
| `TasklisterUsers` | `userId` (Cognito sub) | `email`, `displayName`. GSI `byEmail` for sharing by email |
| `TasklisterFolders` | `ownerId` / `folderId` | personal folders |
| `TasklisterLists` | `listId` | `ownerId`, `name`, `isInbox`. Inbox id = `inbox-<userId>` |
| `TasklisterListMembers` | `userId` / `listId` | `role` OWNER\|MEMBER, **`folderId`** (this user's folder for the list). GSI `byList` for members of a list. This row is the access check for everything |
| `TasklisterItems` | `listId` / `itemId` | an item, or a subitem as `itemId#subitemId` with `parentId`. One Query returns a list's items with their subitems |
| `TasklisterRecurring` | `ownerId` / `recurringId` | schedule, target list, `nextDue`, `active` |
| `TasklisterMailboxes` | `name` | list address name → `listId` (the claim is a conditional write, so names are unique). Also `rate#<userId>#<hour>` counters, `alias#<email>` verified extra sender addresses and `claim#<code>` pending claims (expired by TTL `expiresAt`). GSI `byUser` lists a person's addresses and claims; list address rows have no `userId`, so the index is sparse |

Ids are time-sortable (`base36 time + random`), so key order is creation order.
All tables: pay-per-request, `RETAIN`, point-in-time recovery.

## Why one API Lambda, not native AppSync resolvers

popla's rule is "native JS resolver unless there is real logic". Here almost
every operation first has to check list membership (a second table) and many
touch several rows, so they share one Lambda (`lambda/api`) behind *direct
Lambda resolvers* (no mapping templates; `info.fieldName` selects the
handler). Authorization lives in one place: `shared/access.ts`
(`requireMember` / `requireOwner`). A non-member gets "List not found", the
same as a missing list.

## Cross-list views

Agenda and Priority read the caller's memberships, query each list's items
and filter in the Lambda. At family scale this is a handful of small queries;
add a GSI only if lists grow large. "Overdue" is decided in the browser from
its own "today", so no timezone is baked into the API.

## Recurring items

`shared/schedule.ts` is pure date arithmetic (UTC dates, `nextOccurrence`),
unit-tested in `infra/test`. `shared/recurring-run.ts#materialize`: if
`nextDue <= today`, create the item unless an open item with the same
`recurringId` exists in the target list, then advance `nextDue` with a
conditional write (so a retry can't double-advance). The daily `RecurringFn`
scans due rows; creating or editing a recurring item also materializes it
immediately if it is due today. "Today" is computed in `Europe/Amsterdam`.

## Auth

- Cognito user pool, sign-in alias = email, `selfSignUpEnabled: false`,
  recovery disabled, only `USER_SRP_AUTH`. `Admins` group = admin.
- Users are created with `AdminCreateUser` (`MessageAction: SUPPRESS`) and a
  generated temporary password (`FORCE_CHANGE_PASSWORD`).
- The API Lambda trusts only the AppSync-supplied identity (`sub`, email
  claim, groups); `ensureUser` creates the Users row and Inbox on first contact.
- **Google later:** add the Google IdP to the pool plus a pre-sign-up Lambda
  trigger that rejects emails with no existing user, otherwise anyone with a
  Google account could sign in.

## Frontend (`web/`)

React 19 + Vite + TypeScript, `fetch` GraphQL client (no Apollo),
`amazon-cognito-identity-js`. Responsive: sidebar on laptop, drawer on phone;
installable (manifest + icons). The CSP allows only same-origin scripts/styles
and AppSync/Cognito in the deploy region, so no inline styles.

## CI/CD

`ci.yml` (lint, typecheck, tests, web build) on PRs; `deploy.yml` on `main`:
backend → build web with its outputs → cert + web stacks → smoke check.
Auth is GitHub OIDC, no stored keys.
