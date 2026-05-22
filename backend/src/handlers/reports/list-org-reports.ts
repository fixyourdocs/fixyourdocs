import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables } from '../../lib/db.js';
import { requireUser, HttpError, getOrigin } from '../../lib/auth.js';
import { ok } from '../../lib/response.js';
import { requireMembership } from '../../lib/membership.js';
import { domainSchema, statusSchema } from '../../lib/validation.js';
import { wrapAuth } from '../../lib/wrap.js';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = wrapAuth(async (event) => {
  const origin = getOrigin(event);
  const user = requireUser(event as any);
  const orgId = event.pathParameters?.orgId;
  if (!orgId) throw new HttpError(404, 'not_found', 'missing orgId');
  await requireMembership(user.sub, orgId);

  const qs = event.queryStringParameters ?? {};
  const limit = Math.min(Math.max(parseInt(qs.limit ?? '50', 10) || 50, 1), 100);
  const cursor = qs.cursor;

  if (qs.domain) {
    const domainParsed = domainSchema.safeParse(qs.domain);
    if (!domainParsed.success) throw new HttpError(422, 'validation_failed', 'invalid domain');
    const domain = domainParsed.data;

    if (qs.status) {
      const s = statusSchema.parse(qs.status);
      const res = await ddb.send(
        new QueryCommand({
          TableName: tables.reports,
          IndexName: 'status-index',
          KeyConditionExpression: '#d = :d AND begins_with(statusCreatedAt, :s)',
          ExpressionAttributeNames: { '#d': 'domain' },
          ExpressionAttributeValues: { ':d': domain, ':s': `${s}#` },
          ScanIndexForward: false,
          Limit: limit,
          ExclusiveStartKey: cursor ? JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) : undefined,
        }),
      );
      return ok({ reports: res.Items ?? [], nextCursor: encodeCursor(res.LastEvaluatedKey) }, origin);
    }

    const res = await ddb.send(
      new QueryCommand({
        TableName: tables.reports,
        KeyConditionExpression: '#d = :d',
        ExpressionAttributeNames: { '#d': 'domain' },
        ExpressionAttributeValues: { ':d': domain },
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: cursor ? JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) : undefined,
      }),
    );
    return ok({ reports: res.Items ?? [], nextCursor: encodeCursor(res.LastEvaluatedKey) }, origin);
  }

  // No domain filter: query by org via GSI
  const res = await ddb.send(
    new QueryCommand({
      TableName: tables.reports,
      IndexName: 'org-status-index',
      KeyConditionExpression: 'orgId = :o',
      ExpressionAttributeValues: { ':o': orgId },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: cursor ? JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) : undefined,
    }),
  );
  return ok({ reports: res.Items ?? [], nextCursor: encodeCursor(res.LastEvaluatedKey) }, origin);
});

function encodeCursor(key: Record<string, any> | undefined): string | null {
  if (!key) return null;
  return Buffer.from(JSON.stringify(key)).toString('base64');
}
