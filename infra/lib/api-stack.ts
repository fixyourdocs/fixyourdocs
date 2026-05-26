import * as path from 'node:path';
import { Stack, StackProps, Duration, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  HttpApi,
  HttpMethod,
  CorsHttpMethod,
  DomainName,
  ApiMapping,
} from 'aws-cdk-lib/aws-apigatewayv2';
import { HttpJwtAuthorizer } from 'aws-cdk-lib/aws-apigatewayv2-authorizers';
import { HttpLambdaIntegration } from 'aws-cdk-lib/aws-apigatewayv2-integrations';
import { NodejsFunction, OutputFormat } from 'aws-cdk-lib/aws-lambda-nodejs';
import { Architecture, Runtime } from 'aws-cdk-lib/aws-lambda';
import { RetentionDays } from 'aws-cdk-lib/aws-logs';
import { Table } from 'aws-cdk-lib/aws-dynamodb';
import { UserPool, UserPoolClient } from 'aws-cdk-lib/aws-cognito';
import { ICertificate } from 'aws-cdk-lib/aws-certificatemanager';
import { ARecord, IHostedZone, RecordTarget } from 'aws-cdk-lib/aws-route53';
import { ApiGatewayv2DomainProperties } from 'aws-cdk-lib/aws-route53-targets';
import { Config } from './config';

export interface ApiStackProps extends StackProps {
  config: Config;
  hostedZone: IHostedZone;
  certHub: ICertificate;
  userPool: UserPool;
  userPoolClient: UserPoolClient;
  reportsTable: Table;
  integrationsTable: Table;
  rateLimitTable: Table;
}

const REPO_ROOT = path.join(__dirname, '..', '..');

export class ApiStack extends Stack {
  readonly httpApi: HttpApi;
  readonly hubDomain: DomainName;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);
    const { config } = props;

    const sharedEnv = {
      REPORTS_TABLE: props.reportsTable.tableName,
      INTEGRATIONS_TABLE: props.integrationsTable.tableName,
      RATE_LIMIT_TABLE: props.rateLimitTable.tableName,
      ALLOWED_ORIGINS: config.allowedOrigins.join(','),
      ROOT_DOMAIN: config.rootDomain,
      APP_BASE_URL: `https://${config.subdomains.app}`,
      HUB_BASE_URL: `https://${config.subdomains.hub}`,
    };

    const lambdaDefaults = {
      runtime: Runtime.NODEJS_20_X,
      architecture: Architecture.ARM_64,
      memorySize: 256,
      timeout: Duration.seconds(10),
      logRetention: RetentionDays.ONE_WEEK,
      reservedConcurrentExecutions: 20,
      bundling: {
        format: OutputFormat.ESM,
        target: 'node20',
        minify: true,
        sourceMap: false,
        externalModules: ['@aws-sdk/*'],
        mainFields: ['module', 'main'],
        banner: "import {createRequire} from 'module';const require=createRequire(import.meta.url);",
      },
    };

    const backendDir = path.join(REPO_ROOT, 'backend', 'src', 'handlers');

    const makeFn = (id: string, entry: string, extraEnv: Record<string, string> = {}) =>
      new NodejsFunction(this, id, {
        ...lambdaDefaults,
        entry,
        handler: 'handler',
        environment: { ...sharedEnv, ...extraEnv },
      });

    // Forwarder Lambda — async-invoked from POST /v1/reports.
    const forwarder = makeFn(
      'ForwarderFn',
      path.join(backendDir, 'forwarder', 'forwarder.ts'),
    );
    props.reportsTable.grantReadData(forwarder);
    props.integrationsTable.grantReadData(forwarder);

    const fns = {
      fileReport: makeFn(
        'FileReportFn',
        path.join(backendDir, 'reports', 'file-report.ts'),
        { FORWARDER_FN_NAME: forwarder.functionName },
      ),
      getReport: makeFn(
        'GetReportFn',
        path.join(backendDir, 'reports', 'get-report.ts'),
      ),
      integrationInstall: makeFn(
        'IntegrationInstallFn',
        path.join(backendDir, 'integrations', 'install.ts'),
      ),
      integrationCallback: makeFn(
        'IntegrationCallbackFn',
        path.join(backendDir, 'integrations', 'callback.ts'),
      ),
      setIntegration: makeFn(
        'SetIntegrationFn',
        path.join(backendDir, 'orgs', 'set-integration.ts'),
      ),
    };

    props.reportsTable.grantReadWriteData(fns.fileReport);
    props.rateLimitTable.grantReadWriteData(fns.fileReport);
    forwarder.grantInvoke(fns.fileReport);

    props.reportsTable.grantReadData(fns.getReport);

    props.integrationsTable.grantReadWriteData(fns.integrationCallback);
    props.integrationsTable.grantReadWriteData(fns.setIntegration);

    this.httpApi = new HttpApi(this, 'HttpApi', {
      apiName: 'fyd-hub',
      corsPreflight: {
        allowOrigins: config.allowedOrigins,
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.POST,
          CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['authorization', 'content-type'],
        maxAge: Duration.hours(1),
      },
      disableExecuteApiEndpoint: false,
    });

    this.hubDomain = new DomainName(this, 'HubDomain', {
      domainName: config.subdomains.hub,
      certificate: props.certHub,
    });

    new ApiMapping(this, 'HubMapping', {
      api: this.httpApi,
      domainName: this.hubDomain,
      stage: this.httpApi.defaultStage!,
    });

    new ARecord(this, 'HubAliasRecord', {
      zone: props.hostedZone,
      recordName: config.subdomains.hub,
      target: RecordTarget.fromAlias(
        new ApiGatewayv2DomainProperties(
          this.hubDomain.regionalDomainName,
          this.hubDomain.regionalHostedZoneId,
        ),
      ),
    });

    const jwt = new HttpJwtAuthorizer(
      'JwtAuth',
      `https://cognito-idp.${config.region}.amazonaws.com/${props.userPool.userPoolId}`,
      {
        jwtAudience: [props.userPoolClient.userPoolClientId],
        identitySource: ['$request.header.Authorization'],
      },
    );
    const auth = { authorizer: jwt };

    // /v1/reports* — unauthenticated, rate-limited only.
    this.httpApi.addRoutes({
      path: '/v1/reports',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('I-FileReport', fns.fileReport),
    });
    this.httpApi.addRoutes({
      path: '/v1/reports/{reportId}',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('I-GetReport', fns.getReport),
    });

    // /v1/integrations/* — authenticated except for the GitHub callback,
    // which receives a browser redirect from GitHub and identifies the
    // maintainer via a signed `state` parameter (validated in Step 5).
    this.httpApi.addRoutes({
      path: '/v1/integrations/github/install',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('I-IntegrationInstall', fns.integrationInstall),
      ...auth,
    });
    this.httpApi.addRoutes({
      path: '/v1/integrations/github/callback',
      methods: [HttpMethod.GET],
      integration: new HttpLambdaIntegration('I-IntegrationCallback', fns.integrationCallback),
    });

    // /v1/orgs/* — authenticated.
    this.httpApi.addRoutes({
      path: '/v1/orgs/me/integrations/github',
      methods: [HttpMethod.POST],
      integration: new HttpLambdaIntegration('I-SetIntegration', fns.setIntegration),
      ...auth,
    });

    // WAF: API Gateway v2 (HTTP APIs) is not supported by WAFv2.
    // Per-IP rate limiting for /v1/reports* is enforced inside the FileReport
    // Lambda via the RateLimit DynamoDB table. Lambda reserved concurrency
    // caps each handler.

    new CfnOutput(this, 'HubBaseUrl', { value: `https://${config.subdomains.hub}` });
    new CfnOutput(this, 'HttpApiEndpoint', { value: this.httpApi.apiEndpoint });
    new CfnOutput(this, 'ForwarderFnName', { value: forwarder.functionName });
  }
}
