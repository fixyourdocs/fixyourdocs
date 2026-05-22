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
import { StringParameter } from 'aws-cdk-lib/aws-ssm';
import { Config } from './config';

export interface ApiStackProps extends StackProps {
  config: Config;
  hostedZone: IHostedZone;
  certApi: ICertificate;
  userPool: UserPool;
  userPoolClient: UserPoolClient;
  orgsTable: Table;
  membershipsTable: Table;
  domainsTable: Table;
  reportsTable: Table;
  repliesTable: Table;
  rateLimitTable: Table;
}

const REPO_ROOT = path.join(__dirname, '..', '..');

export class ApiStack extends Stack {
  readonly httpApi: HttpApi;
  readonly apiDomain: DomainName;
  readonly mcpDomain: DomainName;

  constructor(scope: Construct, id: string, props: ApiStackProps) {
    super(scope, id, props);
    const { config } = props;

    const ipHashSaltParam = StringParameter.fromSecureStringParameterAttributes(
      this,
      'IpHashSaltParam',
      { parameterName: '/fixyourdocs/security/ip_hash_salt' },
    );

    const sharedEnv = {
      ORGS_TABLE: props.orgsTable.tableName,
      MEMBERSHIPS_TABLE: props.membershipsTable.tableName,
      DOMAINS_TABLE: props.domainsTable.tableName,
      REPORTS_TABLE: props.reportsTable.tableName,
      REPLIES_TABLE: props.repliesTable.tableName,
      RATE_LIMIT_TABLE: props.rateLimitTable.tableName,
      ALLOWED_ORIGINS: config.allowedOrigins.join(','),
      ROOT_DOMAIN: config.rootDomain,
      APP_BASE_URL: `https://${config.subdomains.app}`,
      IP_HASH_SALT_PARAM: '/fixyourdocs/security/ip_hash_salt',
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
    const mcpEntry = path.join(REPO_ROOT, 'mcp-server', 'src', 'handler.ts');

    const makeFn = (id: string, entry: string, extraEnv: Record<string, string> = {}) =>
      new NodejsFunction(this, id, {
        ...lambdaDefaults,
        entry,
        handler: 'handler',
        environment: { ...sharedEnv, ...extraEnv },
      });

    const fns = {
      createOrg: makeFn('CreateOrgFn', path.join(backendDir, 'orgs', 'create-org.ts')),
      listOrgs: makeFn('ListOrgsFn', path.join(backendDir, 'orgs', 'list-orgs.ts')),
      getOrg: makeFn('GetOrgFn', path.join(backendDir, 'orgs', 'get-org.ts')),
      registerDomain: makeFn('RegisterDomainFn', path.join(backendDir, 'domains', 'register-domain.ts')),
      verifyDomain: makeFn('VerifyDomainFn', path.join(backendDir, 'domains', 'verify-domain.ts')),
      listDomains: makeFn('ListDomainsFn', path.join(backendDir, 'domains', 'list-domains.ts')),
      deleteDomain: makeFn('DeleteDomainFn', path.join(backendDir, 'domains', 'delete-domain.ts')),
      listOrgReports: makeFn('ListOrgReportsFn', path.join(backendDir, 'reports', 'list-org-reports.ts')),
      patchReport: makeFn('PatchReportFn', path.join(backendDir, 'reports', 'patch-report.ts')),
      createReply: makeFn('CreateReplyFn', path.join(backendDir, 'reports', 'create-reply.ts')),
      publicGetDomainReports: makeFn('PublicGetDomainReportsFn', path.join(backendDir, 'public', 'get-domain-reports.ts')),
      publicGetReport: makeFn('PublicGetReportFn', path.join(backendDir, 'public', 'get-report.ts')),
      publicListVendors: makeFn('PublicListVendorsFn', path.join(backendDir, 'public', 'list-vendors.ts')),
      mcp: makeFn('McpFn', mcpEntry),
    };

    // Permissions
    props.orgsTable.grantReadWriteData(fns.createOrg);
    props.membershipsTable.grantReadWriteData(fns.createOrg);
    props.membershipsTable.grantReadData(fns.listOrgs);
    props.orgsTable.grantReadData(fns.listOrgs);
    props.orgsTable.grantReadData(fns.getOrg);
    props.membershipsTable.grantReadData(fns.getOrg);

    for (const fn of [fns.registerDomain, fns.verifyDomain, fns.listDomains, fns.deleteDomain]) {
      props.domainsTable.grantReadWriteData(fn);
      props.membershipsTable.grantReadData(fn);
    }

    props.reportsTable.grantReadWriteData(fns.listOrgReports);
    props.reportsTable.grantReadWriteData(fns.patchReport);
    props.repliesTable.grantReadWriteData(fns.patchReport);
    props.repliesTable.grantReadWriteData(fns.createReply);
    props.reportsTable.grantReadData(fns.createReply);
    props.membershipsTable.grantReadData(fns.listOrgReports);
    props.membershipsTable.grantReadData(fns.patchReport);
    props.membershipsTable.grantReadData(fns.createReply);
    props.domainsTable.grantReadData(fns.listOrgReports);
    props.domainsTable.grantReadData(fns.patchReport);
    props.domainsTable.grantReadData(fns.createReply);

    props.reportsTable.grantReadData(fns.publicGetDomainReports);
    props.reportsTable.grantReadData(fns.publicGetReport);
    props.repliesTable.grantReadData(fns.publicGetReport);
    props.domainsTable.grantReadData(fns.publicGetDomainReports);
    props.domainsTable.grantReadData(fns.publicGetReport);
    props.domainsTable.grantReadData(fns.publicListVendors);
    props.orgsTable.grantReadData(fns.publicListVendors);

    props.domainsTable.grantReadData(fns.mcp);
    props.reportsTable.grantReadWriteData(fns.mcp);
    props.rateLimitTable.grantReadWriteData(fns.mcp);
    ipHashSaltParam.grantRead(fns.mcp);

    // HTTP API
    this.httpApi = new HttpApi(this, 'HttpApi', {
      apiName: 'fyd-http-api',
      corsPreflight: {
        allowOrigins: config.allowedOrigins,
        allowMethods: [
          CorsHttpMethod.GET,
          CorsHttpMethod.POST,
          CorsHttpMethod.PATCH,
          CorsHttpMethod.DELETE,
          CorsHttpMethod.OPTIONS,
        ],
        allowHeaders: ['authorization', 'content-type'],
        maxAge: Duration.hours(1),
      },
      disableExecuteApiEndpoint: false,
    });

    // Custom domains
    this.apiDomain = new DomainName(this, 'ApiDomain', {
      domainName: config.subdomains.api,
      certificate: props.certApi,
    });
    this.mcpDomain = new DomainName(this, 'McpDomain', {
      domainName: config.subdomains.mcp,
      certificate: props.certApi,
    });

    new ApiMapping(this, 'ApiMapping', {
      api: this.httpApi,
      domainName: this.apiDomain,
      stage: this.httpApi.defaultStage!,
    });

    new ApiMapping(this, 'McpMapping', {
      api: this.httpApi,
      domainName: this.mcpDomain,
      stage: this.httpApi.defaultStage!,
    });

    new ARecord(this, 'ApiAliasRecord', {
      zone: props.hostedZone,
      recordName: config.subdomains.api,
      target: RecordTarget.fromAlias(
        new ApiGatewayv2DomainProperties(
          this.apiDomain.regionalDomainName,
          this.apiDomain.regionalHostedZoneId,
        ),
      ),
    });
    new ARecord(this, 'McpAliasRecord', {
      zone: props.hostedZone,
      recordName: config.subdomains.mcp,
      target: RecordTarget.fromAlias(
        new ApiGatewayv2DomainProperties(
          this.mcpDomain.regionalDomainName,
          this.mcpDomain.regionalHostedZoneId,
        ),
      ),
    });

    // JWT Authorizer
    const jwt = new HttpJwtAuthorizer('JwtAuth', `https://cognito-idp.${config.region}.amazonaws.com/${props.userPool.userPoolId}`, {
      jwtAudience: [props.userPoolClient.userPoolClientId],
      identitySource: ['$request.header.Authorization'],
    });

    // Routes — authenticated
    const auth = { authorizer: jwt };
    this.httpApi.addRoutes({ path: '/api/orgs', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('I-CreateOrg', fns.createOrg), ...auth });
    this.httpApi.addRoutes({ path: '/api/orgs', methods: [HttpMethod.GET], integration: new HttpLambdaIntegration('I-ListOrgs', fns.listOrgs), ...auth });
    this.httpApi.addRoutes({ path: '/api/orgs/{orgId}', methods: [HttpMethod.GET], integration: new HttpLambdaIntegration('I-GetOrg', fns.getOrg), ...auth });
    this.httpApi.addRoutes({ path: '/api/orgs/{orgId}/domains', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('I-RegisterDomain', fns.registerDomain), ...auth });
    this.httpApi.addRoutes({ path: '/api/orgs/{orgId}/domains', methods: [HttpMethod.GET], integration: new HttpLambdaIntegration('I-ListDomains', fns.listDomains), ...auth });
    this.httpApi.addRoutes({ path: '/api/orgs/{orgId}/domains/{domain}', methods: [HttpMethod.DELETE], integration: new HttpLambdaIntegration('I-DeleteDomain', fns.deleteDomain), ...auth });
    this.httpApi.addRoutes({ path: '/api/orgs/{orgId}/domains/{domain}/verify', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('I-VerifyDomain', fns.verifyDomain), ...auth });
    this.httpApi.addRoutes({ path: '/api/orgs/{orgId}/reports', methods: [HttpMethod.GET], integration: new HttpLambdaIntegration('I-ListOrgReports', fns.listOrgReports), ...auth });
    this.httpApi.addRoutes({ path: '/api/reports/{domain}/{reportId}', methods: [HttpMethod.PATCH], integration: new HttpLambdaIntegration('I-PatchReport', fns.patchReport), ...auth });
    this.httpApi.addRoutes({ path: '/api/reports/{domain}/{reportId}/replies', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('I-CreateReply', fns.createReply), ...auth });

    // Routes — public
    this.httpApi.addRoutes({ path: '/public/domains', methods: [HttpMethod.GET], integration: new HttpLambdaIntegration('I-PublicListVendors', fns.publicListVendors) });
    this.httpApi.addRoutes({ path: '/public/domains/{domain}/reports', methods: [HttpMethod.GET], integration: new HttpLambdaIntegration('I-PublicGetDomainReports', fns.publicGetDomainReports) });
    this.httpApi.addRoutes({ path: '/public/reports/{domain}/{reportId}', methods: [HttpMethod.GET], integration: new HttpLambdaIntegration('I-PublicGetReport', fns.publicGetReport) });

    // Route — MCP (no auth)
    this.httpApi.addRoutes({ path: '/mcp', methods: [HttpMethod.POST], integration: new HttpLambdaIntegration('I-Mcp', fns.mcp) });

    // WAF: API Gateway v2 (HTTP APIs) is not supported by WAFv2.
    // Rate limiting for /mcp is enforced inside the MCP Lambda via the
    // RateLimit DynamoDB table. Lambda reserved concurrency caps each handler.

    new CfnOutput(this, 'ApiBaseUrl', { value: `https://${config.subdomains.api}` });
    new CfnOutput(this, 'McpBaseUrl', { value: `https://${config.subdomains.mcp}` });
    new CfnOutput(this, 'HttpApiEndpoint', { value: this.httpApi.apiEndpoint });
  }
}
