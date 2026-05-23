import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import { Construct } from 'constructs';
import { Topic } from 'aws-cdk-lib/aws-sns';
import { EmailSubscription } from 'aws-cdk-lib/aws-sns-subscriptions';
import { Alarm, ComparisonOperator, Metric, TreatMissingData } from 'aws-cdk-lib/aws-cloudwatch';
import { SnsAction } from 'aws-cdk-lib/aws-cloudwatch-actions';
import { CfnBudget } from 'aws-cdk-lib/aws-budgets';
import { HttpApi } from 'aws-cdk-lib/aws-apigatewayv2';
import { Config } from './config';

export interface MonitoringStackProps extends StackProps {
  config: Config;
  httpApi: HttpApi;
}

export class MonitoringStack extends Stack {
  constructor(scope: Construct, id: string, props: MonitoringStackProps) {
    super(scope, id, props);
    const { config, httpApi } = props;

    const topic = new Topic(this, 'OpsAlerts', { topicName: 'fyd-ops-alerts' });
    if (config.opsAlertEmail) {
      topic.addSubscription(new EmailSubscription(config.opsAlertEmail));
    }

    const apiId = httpApi.apiId;

    const fivexx = new Metric({
      namespace: 'AWS/ApiGateway',
      metricName: '5xx',
      dimensionsMap: { ApiId: apiId },
      statistic: 'Sum',
      period: Duration.minutes(5),
    });

    new Alarm(this, 'Api5xxAlarm', {
      metric: fivexx,
      threshold: 5,
      evaluationPeriods: 1,
      comparisonOperator: ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
      treatMissingData: TreatMissingData.NOT_BREACHING,
    }).addAlarmAction(new SnsAction(topic));

    if (config.opsAlertEmail) {
      new CfnBudget(this, 'MonthlyBudget', {
        budget: {
          budgetType: 'COST',
          timeUnit: 'MONTHLY',
          budgetLimit: { amount: 30, unit: 'USD' },
          budgetName: 'fyd-monthly',
        },
        notificationsWithSubscribers: [
          {
            notification: {
              notificationType: 'ACTUAL',
              comparisonOperator: 'GREATER_THAN',
              threshold: 80,
              thresholdType: 'PERCENTAGE',
            },
            subscribers: [{ subscriptionType: 'EMAIL', address: config.opsAlertEmail }],
          },
        ],
      });
    }
  }
}
