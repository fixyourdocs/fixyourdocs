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
  // P0-08 Step 6 — verified-domain routing.
  domains: process.env.DOMAINS_TABLE!,
  // Repo claims — the routing anchor.
  repos: process.env.REPOS_TABLE!,
  // P3-08 — "Sign in with GitHub" (CUSTOM_AUTH).
  oauthState: process.env.OAUTH_STATE_TABLE!,
  githubLinks: process.env.GITHUB_LINKS_TABLE!,
} as const;
