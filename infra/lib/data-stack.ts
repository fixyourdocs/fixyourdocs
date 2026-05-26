import { Stack, StackProps, RemovalPolicy, CfnOutput } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import {
  AttributeType,
  BillingMode,
  Table,
  ProjectionType,
} from 'aws-cdk-lib/aws-dynamodb';

export class DataStack extends Stack {
  readonly reportsTable: Table;
  readonly integrationsTable: Table;
  readonly rateLimitTable: Table;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const baseProps = {
      billingMode: BillingMode.PAY_PER_REQUEST,
      pointInTimeRecoverySpecification: { pointInTimeRecoveryEnabled: true },
      removalPolicy: RemovalPolicy.RETAIN,
    };

    this.reportsTable = new Table(this, 'Reports', {
      ...baseProps,
      tableName: 'fyd-reports',
      partitionKey: { name: 'reportId', type: AttributeType.STRING },
    });
    this.reportsTable.addGlobalSecondaryIndex({
      indexName: 'dedup-index',
      partitionKey: { name: 'dedupKey', type: AttributeType.STRING },
      sortKey: { name: 'createdAt', type: AttributeType.STRING },
      projectionType: ProjectionType.KEYS_ONLY,
    });

    this.integrationsTable = new Table(this, 'Integrations', {
      ...baseProps,
      tableName: 'fyd-integrations',
      partitionKey: { name: 'userId', type: AttributeType.STRING },
    });

    this.rateLimitTable = new Table(this, 'RateLimit', {
      ...baseProps,
      tableName: 'fyd-rate-limit',
      partitionKey: { name: 'bucketKey', type: AttributeType.STRING },
      timeToLiveAttribute: 'expiresAt',
    });

    new CfnOutput(this, 'ReportsTableName', { value: this.reportsTable.tableName });
    new CfnOutput(this, 'IntegrationsTableName', { value: this.integrationsTable.tableName });
  }
}
