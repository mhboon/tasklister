import { Stack, StackProps, CfnOutput, Aws, DefaultStackSynthesizer } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as iam from 'aws-cdk-lib/aws-iam';

export interface GithubOidcStackProps extends StackProps {
  /** "owner/repo" */
  githubRepo: string;
  githubOwnerId?: string;
  githubRepoId?: string;
}

const GITHUB_REPO_REGEX = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?\/[A-Za-z0-9._-]+$/;
const GITHUB_ID_REGEX = /^[0-9]+$/;

/**
 * One-time bootstrap (run locally, never from CI): a deploy role GitHub
 * Actions can assume via OIDC, so no AWS keys are stored in GitHub.
 *
 * An AWS account can hold only one OIDC provider per issuer URL, and this
 * account already has GitHub's (created for the popla repo). It is
 * therefore *referenced* here, not created; the role is this repo's own.
 *
 *   npx cdk deploy TasklisterGithubOidcStack -c githubRepo=<owner>/tasklister \
 *     -c githubOwnerId=<id> -c githubRepoId=<id>
 *
 * Trust is an exact match on the token subject (main branch of this repo
 * only). The role may only assume the CDK bootstrap roles; the broad
 * permissions stay with CloudFormation's own execution role.
 */
export class GithubOidcStack extends Stack {
  constructor(scope: Construct, id: string, props: GithubOidcStackProps) {
    super(scope, id, props);

    if (!GITHUB_REPO_REGEX.test(props.githubRepo)) {
      throw new Error(`githubRepo must be "<owner>/<repo>", got "${props.githubRepo}"`);
    }
    const { githubOwnerId, githubRepoId } = props;
    if ((githubOwnerId === undefined) !== (githubRepoId === undefined)) {
      throw new Error('githubOwnerId and githubRepoId must be given together');
    }
    for (const v of [githubOwnerId, githubRepoId]) {
      if (v !== undefined && !GITHUB_ID_REGEX.test(v)) throw new Error(`GitHub IDs must be numeric, got "${v}"`);
    }

    const providerArn = `arn:${Aws.PARTITION}:iam::${Aws.ACCOUNT_ID}:oidc-provider/token.actions.githubusercontent.com`;

    const [owner, repo] = props.githubRepo.split('/');
    const ref = 'ref:refs/heads/main';
    const subjects = [`repo:${owner}/${repo}:${ref}`];
    if (githubOwnerId !== undefined && githubRepoId !== undefined) {
      subjects.push(`repo:${owner}@${githubOwnerId}/${repo}@${githubRepoId}:${ref}`);
    }

    const deployRole = new iam.Role(this, 'GithubDeployRole', {
      assumedBy: new iam.WebIdentityPrincipal(providerArn, {
        StringEquals: {
          'token.actions.githubusercontent.com:aud': 'sts.amazonaws.com',
          'token.actions.githubusercontent.com:sub': subjects,
        },
      }),
      description: 'Assumed by GitHub Actions to deploy the Tasklister CDK stacks',
    });

    const q = DefaultStackSynthesizer.DEFAULT_QUALIFIER;
    const bootstrapRole = (name: string, region: string) =>
      `arn:${Aws.PARTITION}:iam::${Aws.ACCOUNT_ID}:role/cdk-${q}-${name}-${Aws.ACCOUNT_ID}-${region}`;
    // Deploys touch eu-west-1 and (for the CloudFront certificate) us-east-1.
    deployRole.addToPolicy(
      new iam.PolicyStatement({
        sid: 'AssumeCdkBootstrapRoles',
        actions: ['sts:AssumeRole'],
        resources: ['eu-west-1', 'us-east-1'].flatMap((r) => [
          bootstrapRole('deploy-role', r),
          bootstrapRole('file-publishing-role', r),
        ]),
      })
    );
    // Cross-region references are resolved by custom resources that read
    // SSM parameters in the other region.
    new CfnOutput(this, 'DeployRoleArn', { value: deployRole.roleArn });
  }
}
