import * as path from 'path';
import { Stack, StackProps, RemovalPolicy, Duration, Aws } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as ses from 'aws-cdk-lib/aws-ses';
import * as sesActions from 'aws-cdk-lib/aws-ses-actions';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as cr from 'aws-cdk-lib/custom-resources';
import { NodejsFunction } from 'aws-cdk-lib/aws-lambda-nodejs';
import type { TasklisterBackendStack } from './backend-stack';

export interface MailStackProps extends StackProps {
  backend: TasklisterBackendStack;
  hostedZoneId: string;
  zoneName: string;
  /** Mail is received at this domain (the same name as the site). */
  mailDomain: string;
}

/**
 * Items by email. SES accepts every mail for the domain; a gate function
 * drops anything unwanted before it is stored (silently: no bounce), and a
 * second function turns what is kept into items.
 */
export class TasklisterMailStack extends Stack {
  constructor(scope: Construct, id: string, props: MailStackProps) {
    super(scope, id, props);
    const { backend, mailDomain } = props;
    const t = backend.tables;

    const bucket = new s3.Bucket(this, 'MailBucket', {
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
      encryption: s3.BucketEncryption.S3_MANAGED,
      removalPolicy: RemovalPolicy.DESTROY,
      autoDeleteObjects: true,
      // Raw mail is only needed for the seconds it takes to process.
      lifecycleRules: [{ expiration: Duration.days(1) }],
    });

    const env = {
      USERS_TABLE: t.users.tableName,
      LISTS_TABLE: t.lists.tableName,
      MEMBERS_TABLE: t.members.tableName,
      ITEMS_TABLE: t.items.tableName,
      MAILBOXES_TABLE: t.mailboxes.tableName,
      USER_POOL_ID: backend.userPool.userPoolId,
      MAIL_DOMAIN: mailDomain,
      MAIL_BUCKET: bucket.bucketName,
    };
    const fn = (name: string, entry: string, timeout: number) =>
      new NodejsFunction(this, name, {
        entry: path.join(__dirname, entry),
        runtime: lambda.Runtime.NODEJS_22_X,
        timeout: Duration.seconds(timeout),
        memorySize: 512,
        environment: env,
        // Each mail is handled once; a retry would add the item twice.
        retryAttempts: 0,
      });
    const gateFn = fn('GateFn', '../lambda/mail/gate.ts', 10);
    const processFn = fn('ProcessFn', '../lambda/mail/process.ts', 30);

    for (const f of [gateFn, processFn]) {
      t.users.grantReadData(f);
      t.members.grantReadData(f);
      f.addToRolePolicy(
        new iam.PolicyStatement({
          actions: ['cognito-idp:AdminGetUser'],
          resources: [backend.userPool.userPoolArn],
        })
      );
    }
    t.mailboxes.grantReadWriteData(gateFn); // reads list addresses, counts mails per sender
    t.mailboxes.grantReadData(processFn);
    t.items.grantWriteData(processFn);
    bucket.grantRead(processFn);
    bucket.grantDelete(processFn);

    const ruleSet = new ses.ReceiptRuleSet(this, 'RuleSet', { receiptRuleSetName: 'tasklister-inbound' });
    ruleSet.addRule('Inbound', {
      // The whole domain, so SES never bounces an unknown address: the gate drops it quietly.
      recipients: [mailDomain],
      scanEnabled: true,
      tlsPolicy: ses.TlsPolicy.OPTIONAL,
      actions: [
        new sesActions.Lambda({ function: gateFn, invocationType: sesActions.LambdaInvocationType.REQUEST_RESPONSE }),
        new sesActions.S3({ bucket, objectKeyPrefix: 'mail/' }),
        new sesActions.Lambda({ function: processFn, invocationType: sesActions.LambdaInvocationType.EVENT }),
      ],
    });

    // Only one receiving rule set is active per region; make this one it.
    // (CloudFormation can create a rule set but not activate it.)
    const activate = (name: string | null) => ({
      service: 'SES',
      action: 'setActiveReceiptRuleSet',
      parameters: name ? { RuleSetName: name } : {},
      physicalResourceId: cr.PhysicalResourceId.of('tasklister-active-rule-set'),
    });
    const activation = new cr.AwsCustomResource(this, 'ActivateRuleSet', {
      onCreate: activate(ruleSet.receiptRuleSetName),
      onUpdate: activate(ruleSet.receiptRuleSetName),
      onDelete: activate(null),
      installLatestAwsSdk: false,
      policy: cr.AwsCustomResourcePolicy.fromStatements([
        new iam.PolicyStatement({ actions: ['ses:SetActiveReceiptRuleSet'], resources: ['*'] }),
      ]),
    });
    activation.node.addDependency(ruleSet);

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.zoneName,
    });

    // SES only accepts mail for a domain that is a verified identity here;
    // without one it answers every sender "550 5.1.1 mailbox unavailable"
    // before any rule runs. The verification and DKIM records go into the zone.
    new ses.EmailIdentity(this, 'DomainIdentity', {
      identity: ses.Identity.publicHostedZone(zone),
    });

    // Mail for the domain is delivered to SES in this region.
    new route53.MxRecord(this, 'Mx', {
      zone,
      recordName: mailDomain,
      values: [{ priority: 10, hostName: `inbound-smtp.${Aws.REGION}.amazonaws.com` }],
    });
  }
}
