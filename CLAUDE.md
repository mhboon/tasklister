# Working conventions for this repo

`SPEC.md` is the *what* (product rules), `ARCHITECTURE.md` the system design.
This file is *how* to work here. Same conventions as the sibling popla repo.

## Stack

- Infra is AWS CDK (TypeScript) in `infra/`. No hand-written CloudFormation,
  SAM or Terraform.
- AppSync (GraphQL) + Cognito + DynamoDB + Lambda; frontend is React + Vite +
  TypeScript on S3 + CloudFront at `lists.mboapps.click`.
- Every query/mutation is a *direct Lambda resolver* into one API Lambda
  (`infra/lambda/api`) because each operation needs a cross-table access
  check. Add a field: schema → handler in `lambda/api/handlers/` → entry in
  `lambda/api/index.ts` → name in the `fields` map in `backend-stack.ts`.
- One DynamoDB table per entity, not single-table design.
- No account IDs, ARNs or hosted-zone IDs in committed code. Stacks take the
  account from deploy credentials; the hosted zone ID comes from the
  `HOSTED_ZONE_ID` env var / GitHub Actions variable.
- There is no separate QA environment: everything deploys straight to the one
  account. Be careful with changes to tables (all `RETAIN` + PITR).
- The CSP (`infra/lib/web-stack.ts`) forbids inline styles and third-party
  origins. Don't use React `style={}` props; use CSS classes.

- **Every CloudFormation stack name here must start with `Tasklister`.** This
  account also holds popla's stacks (`PoplaBackendStack`, `GithubOidcStack`, …);
  deploying a stack with a name that already exists *updates popla's stack*.
  Before any `cdk deploy`, check the stack name isn't already in the account.

## Checks

`npm test` (unit tests for the recurrence maths), `npm run lint` and
`npm run build` in `infra/` and `web/`. CI runs all of them on PRs.

## Git workflow

- Never push directly to `main`; branch + PR for every change, one concern each.
- Branch `<type>/<kebab-description>`, PR title `<type>[!]: <description>`
  (Conventional Commits: feat, fix, perf, refactor, docs, chore, test).
