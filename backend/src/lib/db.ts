import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const raw = new DynamoDBClient({});
export const ddb = DynamoDBDocumentClient.from(raw, {
  marshallOptions: { removeUndefinedValues: true, convertEmptyValues: false },
});

export const tables = {
  orgs: process.env.ORGS_TABLE!,
  memberships: process.env.MEMBERSHIPS_TABLE!,
  domains: process.env.DOMAINS_TABLE!,
  reports: process.env.REPORTS_TABLE!,
  replies: process.env.REPLIES_TABLE!,
  rateLimit: process.env.RATE_LIMIT_TABLE!,
} as const;
