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
| `TasklisterGithubOidcStack` | eu-west-1 | one-time: deploy role for GitHub Actions. Reuses the account's existing GitHub OIDC provider (an account can have only one) |

The web stacks need a concrete `env` for cross-region references, taken from
`CDK_DEFAULT_ACCOUNT` (deploy credentials), so no account ID is committed. The
hosted zone ID, zone name and site domain come from `HOSTED_ZONE_ID`,
`HOSTED_ZONE_NAME` and `SITE_DOMAIN`.

## Data (one table per entity)

| Table | Key | Notes |
|---|---|---|
| `TasklisterUsers` | `userId` (Cognito sub) | `email`, `displayName`. GSI `byEmail` for sharing by email |
| `TasklisterFolders` | `ownerId` / `folderId` | personal folders |
| `TasklisterLists` | `listId` | `ownerId`, `name`, `isInbox`. Inbox id = `inbox-<userId>` |
| `TasklisterListMembers` | `userId` / `listId` | `role` OWNER\|MEMBER, **`folderId`** (this user's folder for the list). GSI `byList` for members of a list. This row is the access check for everything |
| `TasklisterItems` | `listId` / `itemId` | an item, or a subitem as `itemId#subitemId` with `parentId`. One Query returns a list's items with their subitems |
| `TasklisterRecurring` | `ownerId` / `recurringId` | schedule, target list, `nextDue`, `active` |

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
