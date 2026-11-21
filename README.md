# Tasklister

Lists, sharing, agenda, priorities and recurring items, at
`https://lists.mboapps.click`. See [`SPEC.md`](SPEC.md) (what) and
[`ARCHITECTURE.md`](ARCHITECTURE.md) (how); working conventions are in
[`CLAUDE.md`](CLAUDE.md).

- `infra/` — AWS CDK app, Lambda code (`lambda/`), GraphQL schema, tests
- `web/` — React + Vite frontend

## Local checks

```bash
nvm use && npm install
npm test                          # recurrence unit tests
npm run lint --workspace infra && npm run build --workspace infra
npm run lint --workspace web   && npm run build --workspace web
```

## First deploy (one-time)

Uses whatever AWS credentials are active (`aws login`). Region `eu-west-1`.

1. **Bootstrap both regions** (the certificate must be in us-east-1; popla
   probably already bootstrapped eu-west-1):
   ```bash
   cd infra
   npx cdk bootstrap aws://<account>/eu-west-1 aws://<account>/us-east-1
   ```
2. **Find the Route 53 zone ID** of `mboapps.click`:
   `aws route53 list-hosted-zones-by-name --dns-name mboapps.click`
3. **Deploy the backend**, then build the web app with its outputs, then the rest:
   ```bash
   export HOSTED_ZONE_ID=<zone id>
   npx cdk deploy TasklisterBackendStack --outputs-file cdk-outputs.json
   cp ../web/.env.example ../web/.env.local   # fill in ApiUrl / UserPoolId / UserPoolClientId
   (cd ../web && npm run build)
   npx cdk deploy TasklisterCertStack TasklisterWebStack
   ```
   The certificate validates through DNS in that zone; allow a few minutes.
4. **Create the first admin** (nothing exists to sign in with yet):
   ```bash
   POOL=<UserPoolId>; EMAIL=you@example.com
   aws cognito-idp admin-create-user --user-pool-id $POOL --username $EMAIL \
     --user-attributes Name=email,Value=$EMAIL Name=email_verified,Value=true \
     --message-action SUPPRESS
   aws cognito-idp admin-set-user-password --user-pool-id $POOL --username $EMAIL \
     --password '<temporary>'                       # no --permanent
   aws cognito-idp admin-add-user-to-group --user-pool-id $POOL --username $EMAIL \
     --group-name Admins
   ```
   Sign in, choose a real password, then add everyone else on the **Users** page.

## CI/CD setup (one-time)

```bash
cd infra
npx cdk deploy TasklisterGithubOidcStack -c githubRepo=<owner>/tasklister \
  -c githubOwnerId=<id> -c githubRepoId=<id>
```
Then in GitHub → Settings → Secrets and variables → Actions: secret
`AWS_DEPLOY_ROLE_ARN` (the printed `DeployRoleArn`), variables `AWS_REGION`
(`eu-west-1`) and `HOSTED_ZONE_ID`. Until set, the deploy workflow skips itself.
Protect `main` (PR required) like popla.

## Local frontend dev

`web/.env.local` with the backend's outputs, then `npm run dev --workspace web`.
This talks to the real (only) environment.
