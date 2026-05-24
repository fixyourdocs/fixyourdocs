import * as path from 'node:path';
import { Stack, StackProps, RemovalPolicy, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { BlockPublicAccess, Bucket, BucketEncryption } from 'aws-cdk-lib/aws-s3';
import {
  Distribution,
  ViewerProtocolPolicy,
  CachePolicy,
  ResponseHeadersPolicy,
  HeadersFrameOption,
  HeadersReferrerPolicy,
  PriceClass,
  AllowedMethods,
  CachedMethods,
  Function as CloudFrontFunction,
  FunctionCode,
  FunctionEventType,
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { ARecord, HostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { Certificate, CertificateValidation } from 'aws-cdk-lib/aws-certificatemanager';

const REPO_ROOT = path.join(__dirname, '..', '..');

export interface DocsfeedbackStackProps extends StackProps {
  hostedZoneId: string;
}

const ROOT_DOMAIN = 'docsfeedback.org';
const WWW_DOMAIN = `www.${ROOT_DOMAIN}`;

export class DocsfeedbackStack extends Stack {
  readonly bucket: Bucket;
  readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: DocsfeedbackStackProps) {
    super(scope, id, props);

    const hostedZone = HostedZone.fromHostedZoneAttributes(this, 'Zone', {
      hostedZoneId: props.hostedZoneId,
      zoneName: ROOT_DOMAIN,
    });

    const cert = new Certificate(this, 'Cert', {
      domainName: ROOT_DOMAIN,
      subjectAlternativeNames: [WWW_DOMAIN],
      validation: CertificateValidation.fromDns(hostedZone),
    });

    this.bucket = new Bucket(this, 'SiteBucket', {
      bucketName: `fyd-docsfeedback-${this.account}-${this.region}`,
      blockPublicAccess: BlockPublicAccess.BLOCK_ALL,
      encryption: BucketEncryption.S3_MANAGED,
      enforceSSL: true,
      removalPolicy: RemovalPolicy.RETAIN,
      autoDeleteObjects: false,
    });

    const securityHeaders = new ResponseHeadersPolicy(this, 'SecurityHeaders', {
      securityHeadersBehavior: {
        strictTransportSecurity: {
          accessControlMaxAge: Duration.days(365),
          includeSubdomains: true,
          preload: false,
          override: true,
        },
        contentTypeOptions: { override: true },
        frameOptions: { frameOption: HeadersFrameOption.DENY, override: true },
        referrerPolicy: {
          referrerPolicy: HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: true,
        },
      },
    });

    // CloudFront's `defaultRootObject` only rewrites the apex. For
    // subdirectory routes like `/spec/v0/` to resolve, we need a viewer-
    // request function that appends `index.html` to directory-style URIs.
    const indexRewrite = new CloudFrontFunction(this, 'IndexRewrite', {
      code: FunctionCode.fromInline(`
function handler(event) {
  var request = event.request;
  var uri = request.uri;
  if (uri.endsWith('/')) {
    request.uri = uri + 'index.html';
  } else if (uri.lastIndexOf('.') < uri.lastIndexOf('/')) {
    // No file extension after the last slash → treat as directory route.
    request.uri = uri + '/index.html';
  }
  return request;
}
      `.trim()),
    });

    this.distribution = new Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      domainNames: [ROOT_DOMAIN, WWW_DOMAIN],
      certificate: cert,
      priceClass: PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeaders,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: CachedMethods.CACHE_GET_HEAD,
        compress: true,
        functionAssociations: [
          {
            function: indexRewrite,
            eventType: FunctionEventType.VIEWER_REQUEST,
          },
        ],
      },
    });

    new ARecord(this, 'ApexAlias', {
      zone: hostedZone,
      recordName: ROOT_DOMAIN,
      target: RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
    });
    new ARecord(this, 'WwwAlias', {
      zone: hostedZone,
      recordName: WWW_DOMAIN,
      target: RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
    });

    const distDir = path.join(REPO_ROOT, 'docsfeedback-site', 'dist');

    new BucketDeployment(this, 'DeploySite', {
      sources: [Source.asset(distDir)],
      destinationBucket: this.bucket,
      distribution: this.distribution,
      distributionPaths: ['/*'],
      prune: true,
    });

    new CfnOutput(this, 'DistributionDomain', { value: this.distribution.distributionDomainName });
    new CfnOutput(this, 'SiteUrl', { value: `https://${ROOT_DOMAIN}` });
  }
}
