import * as path from 'path';
import { Stack, StackProps, RemovalPolicy, CfnOutput, Duration, Aws } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';
import * as s3deploy from 'aws-cdk-lib/aws-s3-deployment';
import * as route53 from 'aws-cdk-lib/aws-route53';
import * as route53targets from 'aws-cdk-lib/aws-route53-targets';
import * as acm from 'aws-cdk-lib/aws-certificatemanager';

/**
 * CloudFront only accepts certificates from us-east-1, so the certificate
 * lives in its own stack there and is handed to the web stack through
 * CDK's cross-region references.
 */
export class TasklisterCertStack extends Stack {
  public readonly certificate: acm.ICertificate;

  constructor(scope: Construct, id: string, props: StackProps & { hostedZoneId: string; zoneName: string; siteDomain: string }) {
    super(scope, id, props);
    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.zoneName,
    });
    this.certificate = new acm.Certificate(this, 'SiteCertificate', {
      domainName: props.siteDomain,
      validation: acm.CertificateValidation.fromDns(zone),
    });
  }
}

export class TasklisterWebStack extends Stack {
  constructor(
    scope: Construct,
    id: string,
    props: StackProps & { hostedZoneId: string; zoneName: string; siteDomain: string; certificate: acm.ICertificate }
  ) {
    super(scope, id, props);

    const siteBucket = new s3.Bucket(this, 'SiteBucket', {
      removalPolicy: RemovalPolicy.RETAIN,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      enforceSSL: true,
    });

    // What the page may load and talk to; everything else is refused by
    // the browser. Sign-in tokens live in localStorage, so this limits
    // where a rogue script could send them. Keep in step with what the
    // app really uses.
    const contentSecurityPolicy = [
      "default-src 'self'",
      "script-src 'self'",
      "style-src 'self'",
      "img-src 'self' data:",
      `connect-src https://*.appsync-api.${Aws.REGION}.amazonaws.com https://cognito-idp.${Aws.REGION}.amazonaws.com`,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join('; ');

    const securityHeaders = new cloudfront.ResponseHeadersPolicy(this, 'SecurityHeaders', {
      comment: 'Security headers for the Tasklister web app',
      securityHeadersBehavior: {
        contentSecurityPolicy: { contentSecurityPolicy, override: true },
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: false,
          override: true,
        },
        frameOptions: { frameOption: cloudfront.HeadersFrameOption.DENY, override: true },
        contentTypeOptions: { override: true },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
      },
    });

    const distribution = new cloudfront.Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      domainNames: [props.siteDomain],
      certificate: props.certificate,
      defaultBehavior: {
        origin: origins.S3BucketOrigin.withOriginAccessControl(siteBucket),
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy: securityHeaders,
      },
      // SPA routing: unknown paths fall back to the client-side router.
      errorResponses: [
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html' },
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html' },
      ],
    });

    const zone = route53.HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: props.zoneName,
    });
    const target = route53.RecordTarget.fromAlias(new route53targets.CloudFrontTarget(distribution));
    new route53.ARecord(this, 'SiteA', { zone, recordName: props.siteDomain, target });
    new route53.AaaaRecord(this, 'SiteAAAA', { zone, recordName: props.siteDomain, target });

    new s3deploy.BucketDeployment(this, 'DeploySite', {
      sources: [s3deploy.Source.asset(path.join(__dirname, '../../web/dist'))],
      destinationBucket: siteBucket,
      distribution,
      distributionPaths: ['/*'],
    });

    new CfnOutput(this, 'SiteUrl', { value: `https://${props.siteDomain}` });
  }
}
