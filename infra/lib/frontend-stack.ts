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
} from 'aws-cdk-lib/aws-cloudfront';
import { S3BucketOrigin } from 'aws-cdk-lib/aws-cloudfront-origins';
import { BucketDeployment, Source } from 'aws-cdk-lib/aws-s3-deployment';
import { ARecord, IHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { CloudFrontTarget } from 'aws-cdk-lib/aws-route53-targets';
import { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { Config } from './config';

const REPO_ROOT = path.join(__dirname, '..', '..');

export interface FrontendStackProps extends StackProps {
  config: Config;
  hostedZone: IHostedZone;
  certApi: ICertificate;
  userPoolId: string;
  userPoolClientId: string;
}

export class FrontendStack extends Stack {
  readonly bucket: Bucket;
  readonly distribution: Distribution;

  constructor(scope: Construct, id: string, props: FrontendStackProps) {
    super(scope, id, props);
    const { config } = props;

    this.bucket = new Bucket(this, 'SpaBucket', {
      bucketName: `fyd-spa-${this.account}-${this.region}`,
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

    this.distribution = new Distribution(this, 'Distribution', {
      defaultRootObject: 'index.html',
      domainNames: [config.subdomains.app, `www.${config.subdomains.app}`],
      certificate: props.certApi,
      priceClass: PriceClass.PRICE_CLASS_100,
      defaultBehavior: {
        origin: S3BucketOrigin.withOriginAccessControl(this.bucket),
        viewerProtocolPolicy: ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        cachePolicy: CachePolicy.CACHING_OPTIMIZED,
        responseHeadersPolicy: securityHeaders,
        allowedMethods: AllowedMethods.ALLOW_GET_HEAD,
        cachedMethods: CachedMethods.CACHE_GET_HEAD,
        compress: true,
      },
      errorResponses: [
        { httpStatus: 403, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: Duration.minutes(1) },
        { httpStatus: 404, responseHttpStatus: 200, responsePagePath: '/index.html', ttl: Duration.minutes(1) },
      ],
    });

    new ARecord(this, 'ApexAlias', {
      zone: props.hostedZone,
      recordName: config.subdomains.app,
      target: RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
    });
    new ARecord(this, 'WwwAlias', {
      zone: props.hostedZone,
      recordName: `www.${config.subdomains.app}`,
      target: RecordTarget.fromAlias(new CloudFrontTarget(this.distribution)),
    });

    const distDir = path.join(REPO_ROOT, 'frontend', 'dist');

    const envJs = [
      'window.__ENV__ = {',
      `  HUB_BASE_URL: 'https://${config.subdomains.hub}',`,
      `  COGNITO_REGION: '${config.region}',`,
      `  COGNITO_USER_POOL_ID: '${props.userPoolId}',`,
      `  COGNITO_CLIENT_ID: '${props.userPoolClientId}',`,
      `  APP_BASE_URL: 'https://${config.subdomains.app}',`,
      '};',
    ].join('\n');

    new BucketDeployment(this, 'DeploySpa', {
      sources: [Source.asset(distDir), Source.data('env.js', envJs)],
      destinationBucket: this.bucket,
      distribution: this.distribution,
      distributionPaths: ['/*'],
      prune: true,
    });

    new CfnOutput(this, 'DistributionDomain', { value: this.distribution.distributionDomainName });
    new CfnOutput(this, 'AppUrl', { value: `https://${config.subdomains.app}` });
  }
}
