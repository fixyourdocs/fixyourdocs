import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const raw = new DynamoDBClient({});
export const ddb = DynamoDBDocumentClient.from(raw, {
  marshallOptions: { removeUndefinedValues: true, convertEmptyValues: false },
});

export const tables = {
  reports: process.env.REPORTS_TABLE!,
  integrations: process.env.INTEGRATIONS_TABLE!,
  rateLimit: process.env.RATE_LIMIT_TABLE!,
} as const;
