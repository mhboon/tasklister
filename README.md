# Tasklister

Lists, sharing, agenda, priorities and recurring items, at
`https://<your-domain>`. See [`SPEC.md`](SPEC.md) (what) and
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
2. **Find the Route 53 zone ID** of your zone:
   `aws route53 list-hosted-zones-by-name --dns-name <your-zone>`
3. **Deploy the backend**, then build the web app with its outputs, then the rest:
   ```bash
   export HOSTED_ZONE_ID=<zone id>
   export HOSTED_ZONE_NAME=<your-zone>        # e.g. example.com
   export SITE_DOMAIN=<your-domain>           # inside the zone, e.g. lists.example.com
   npx cdk deploy TasklisterBackendStack --outputs-file cdk-outputs.json
   cp ../web/.env.example ../web/.env.local   # fill in ApiUrl / UserPoolId / UserPoolClientId
   (cd ../web && npm run build)
   npx cdk deploy TasklisterCertStack TasklisterWebStack
   npx cdk deploy TasklisterMailStack      # optional: items by email (needs the three variables above)
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
(`eu-west-1`), `HOSTED_ZONE_ID`, `HOSTED_ZONE_NAME` and `SITE_DOMAIN`. Until set, the deploy workflow skips itself.
Protect `main` (PR required) like popla.

## Local frontend dev

`web/.env.local` with the backend's outputs, then `npm run dev --workspace web`.
This talks to the real (only) environment.
