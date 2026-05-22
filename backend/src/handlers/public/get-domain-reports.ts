import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables } from '../../lib/db.js';
import { HttpError } from '../../lib/auth.js';
import { publicOk, publicError } from '../../lib/response.js';
import { domainSchema, statusSchema } from '../../lib/validation.js';
import { wrapPublic } from '../../lib/wrap.js';

export const handler: APIGatewayProxyHandlerV2 = wrapPublic(async (event) => {
  const rawDomain = event.pathParameters?.domain;
  if (!rawDomain) throw new HttpError(404, 'not_found', 'missing domain');
  const parsed = domainSchema.safeParse(rawDomain);
  if (!parsed.success) return publicError('validation_failed', 'invalid domain', 422);
  const domain = parsed.data;

  const domRes = await ddb.send(new GetCommand({ TableName: tables.domains, Key: { domain } }));
  if (!domRes.Item || domRes.Item.status !== 'verified') {
    return publicError('domain_not_registered', 'domain is not registered or not verified', 404);
  }

  const qs = event.queryStringParameters ?? {};
  const limit = Math.min(Math.max(parseInt(qs.limit ?? '50', 10) || 50, 1), 100);
  const cursor = qs.cursor;
  const start = cursor ? JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) : undefined;

  let res;
  if (qs.status) {
    const s = statusSchema.parse(qs.status);
    res = await ddb.send(
      new QueryCommand({
        TableName: tables.reports,
        IndexName: 'status-index',
        KeyConditionExpression: '#d = :d AND begins_with(statusCreatedAt, :s)',
        ExpressionAttributeNames: { '#d': 'domain' },
        ExpressionAttributeValues: { ':d': domain, ':s': `${s}#` },
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: start,
      }),
    );
  } else {
    res = await ddb.send(
      new QueryCommand({
        TableName: tables.reports,
        KeyConditionExpression: '#d = :d',
        FilterExpression: '#s <> :spam',
        ExpressionAttributeNames: { '#d': 'domain', '#s': 'status' },
        ExpressionAttributeValues: { ':d': domain, ':spam': 'spam' },
        ScanIndexForward: false,
        Limit: limit,
        ExclusiveStartKey: start,
      }),
    );
  }

  const items = (res.Items ?? [])
    .filter((r) => r.status !== 'spam')
    .map((r) => ({
      reportId: r.reportId,
      status: r.status,
      issueType: r.issueType,
      url: r.url,
      title: r.title,
      description: r.description,
      evidence: r.evidence ?? null,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));

  return publicOk({
    domain,
    domainStatus: domRes.Item.status,
    reports: items,
    nextCursor: res.LastEvaluatedKey ? Buffer.from(JSON.stringify(res.LastEvaluatedKey)).toString('base64') : null,
  });
});
