#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { TasklisterBackendStack } from '../lib/backend-stack';
import { TasklisterCertStack, TasklisterWebStack } from '../lib/web-stack';
import { GithubOidcStack } from '../lib/github-oidc-stack';

const app = new cdk.App();

// No account IDs in source. The account comes from whichever credentials
// deploy (CDK_DEFAULT_ACCOUNT); the region defaults to eu-west-1. The web
// stacks need a concrete env only because the CloudFront certificate has
// to live in us-east-1 and be passed across regions.
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION ?? 'eu-west-1';

// The Route 53 zone for mboapps.click lives in this account; its ID is
// account-specific so it comes from the environment (GitHub Actions
// variable HOSTED_ZONE_ID in CI), never from source.
const hostedZoneId = process.env.HOSTED_ZONE_ID ?? app.node.tryGetContext('hostedZoneId');

new TasklisterBackendStack(app, 'TasklisterBackendStack', { env: { account, region } });

if (hostedZoneId) {
  const cert = new TasklisterCertStack(app, 'TasklisterCertStack', {
    env: { account, region: 'us-east-1' },
    crossRegionReferences: true,
    hostedZoneId,
  });
  new TasklisterWebStack(app, 'TasklisterWebStack', {
    env: { account, region },
    crossRegionReferences: true,
    hostedZoneId,
    certificate: cert.certificate,
  });
}

function optionalString(v: unknown): string | undefined {
  return v === undefined || v === null ? undefined : String(v);
}

// One-time manual bootstrap only; see lib/github-oidc-stack.ts.
const githubRepo = app.node.tryGetContext('githubRepo');
if (githubRepo) {
  new GithubOidcStack(app, 'TasklisterGithubOidcStack', {
    env: { account, region },
    githubRepo,
    githubOwnerId: optionalString(app.node.tryGetContext('githubOwnerId')),
    githubRepoId: optionalString(app.node.tryGetContext('githubRepoId')),
  });
}
