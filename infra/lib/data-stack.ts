import { Stack, StackProps, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  AttributeType,
  BillingMode,
  Table,
  ProjectionType,
} from 'aws-cdk-lib/aws-dynamodb';

export class DataStack extends Stack {
  readonly orgsTable: Table;
  readonly membershipsTable: Table;
  readonly domainsTable: Table;
  readonly reportsTable: Table;
  readonly repliesTable: Table;
  readonly rateLimitTable: Table;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const baseProps = {
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.RETAIN,
    };

    this.orgsTable = new Table(this, 'Organizations', {
      ...baseProps,
      tableName: 'fyd-organizations',
      partitionKey: { name: 'orgId', type: AttributeType.STRING },
    });
    this.orgsTable.addGlobalSecondaryIndex({
      indexName: 'slug-index',
      partitionKey: { name: 'slug', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    this.membershipsTable = new Table(this, 'Memberships', {
      ...baseProps,
      tableName: 'fyd-memberships',
      partitionKey: { name: 'userId', type: AttributeType.STRING },
      sortKey: { name: 'orgId', type: AttributeType.STRING },
    });
    this.membershipsTable.addGlobalSecondaryIndex({
      indexName: 'org-index',
      partitionKey: { name: 'orgId', type: AttributeType.STRING },
      sortKey: { name: 'userId', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    this.domainsTable = new Table(this, 'Domains', {
      ...baseProps,
      tableName: 'fyd-domains',
      partitionKey: { name: 'domain', type: AttributeType.STRING },
    });
    this.domainsTable.addGlobalSecondaryIndex({
      indexName: 'org-index',
      partitionKey: { name: 'orgId', type: AttributeType.STRING },
      sortKey: { name: 'domain', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
    this.domainsTable.addGlobalSecondaryIndex({
      indexName: 'status-index',
      partitionKey: { name: 'status', type: AttributeType.STRING },
      sortKey: { name: 'verifiedAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    this.reportsTable = new Table(this, 'Reports', {
      ...baseProps,
      tableName: 'fyd-reports',
      partitionKey: { name: 'domain', type: AttributeType.STRING },
      sortKey: { name: 'reportId', type: AttributeType.STRING },
    });
    this.reportsTable.addGlobalSecondaryIndex({
      indexName: 'status-index',
      partitionKey: { name: 'domain', type: AttributeType.STRING },
      sortKey: { name: 'statusCreatedAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });
    this.reportsTable.addGlobalSecondaryIndex({
      indexName: 'org-status-index',
      partitionKey: { name: 'orgId', type: AttributeType.STRING },
      sortKey: { name: 'statusCreatedAt', type: AttributeType.STRING },
      projectionType: ProjectionType.ALL,
    });

    this.repliesTable = new Table(this, 'Replies', {
      ...baseProps,
      tableName: 'fyd-replies',
      partitionKey: { name: 'reportId', type: AttributeType.STRING },
      sortKey: { name: 'createdAt', type: AttributeType.STRING },
    });

    this.rateLimitTable = new Table(this, 'RateLimit', {
      ...baseProps,
      tableName: 'fyd-rate-limit',
      partitionKey: { name: 'bucketKey', type: AttributeType.STRING },
      timeToLiveAttribute: 'expiresAt',
    });

    new CfnOutput(this, 'OrgsTableName', { value: this.orgsTable.tableName });
    new CfnOutput(this, 'ReportsTableName', { value: this.reportsTable.tableName });
  }
}
