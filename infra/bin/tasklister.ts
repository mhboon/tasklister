#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { TasklisterBackendStack } from '../lib/backend-stack';
import { TasklisterMailStack } from '../lib/mail-stack';
import { TasklisterCertStack, TasklisterWebStack } from '../lib/web-stack';
import { GithubOidcStack } from '../lib/github-oidc-stack';

const app = new cdk.App();

// No account IDs in source. The account comes from whichever credentials
// deploy (CDK_DEFAULT_ACCOUNT); the region defaults to eu-west-1. The web
// stacks need a concrete env only because the CloudFront certificate has
// to live in us-east-1 and be passed across regions.
const account = process.env.CDK_DEFAULT_ACCOUNT;
const region = process.env.CDK_DEFAULT_REGION ?? 'eu-west-1';

// The Route 53 zone lives in this account. Its ID, its name and the site's
// domain are environment-specific, so they come from the environment (GitHub
// Actions variables HOSTED_ZONE_ID, HOSTED_ZONE_NAME and SITE_DOMAIN in CI),
// never from source.
const hostedZoneId = process.env.HOSTED_ZONE_ID ?? app.node.tryGetContext('hostedZoneId');
const zoneName = process.env.HOSTED_ZONE_NAME ?? app.node.tryGetContext('hostedZoneName');
const siteDomain = process.env.SITE_DOMAIN ?? app.node.tryGetContext('siteDomain');

const backend = new TasklisterBackendStack(app, 'TasklisterBackendStack', {
  env: { account, region },
  mailDomain: hostedZoneId ? siteDomain : undefined,
});

if (hostedZoneId) {
  // A wrong domain would replace the CloudFront alias and certificate, so
  // refuse to guess: all three values must be given together.
  if (!zoneName || !siteDomain) {
    throw new Error('HOSTED_ZONE_ID is set, so HOSTED_ZONE_NAME and SITE_DOMAIN must be set too.');
  }
  if (siteDomain !== zoneName && !siteDomain.endsWith(`.${zoneName}`)) {
    throw new Error(`SITE_DOMAIN (${siteDomain}) must be inside HOSTED_ZONE_NAME (${zoneName}).`);
  }
  const cert = new TasklisterCertStack(app, 'TasklisterCertStack', {
    env: { account, region: 'us-east-1' },
    crossRegionReferences: true,
    hostedZoneId,
    zoneName,
    siteDomain,
  });
  new TasklisterMailStack(app, 'TasklisterMailStack', { env: { account, region }, backend, hostedZoneId, zoneName, mailDomain: siteDomain });
  new TasklisterWebStack(app, 'TasklisterWebStack', {
    env: { account, region },
    crossRegionReferences: true,
    hostedZoneId,
    zoneName,
    siteDomain,
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
