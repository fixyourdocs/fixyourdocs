import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { QueryCommand, BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables } from '../../lib/db.js';
import { publicOk } from '../../lib/response.js';
import { wrapPublic } from '../../lib/wrap.js';

export const handler: APIGatewayProxyHandlerV2 = wrapPublic(async (event) => {
  const qs = event.queryStringParameters ?? {};
  const limit = Math.min(Math.max(parseInt(qs.limit ?? '50', 10) || 50, 1), 100);
  const cursor = qs.cursor;

  const res = await ddb.send(
    new QueryCommand({
      TableName: tables.domains,
      IndexName: 'status-index',
      KeyConditionExpression: '#s = :v',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':v': 'verified' },
      ScanIndexForward: false,
      Limit: limit,
      ExclusiveStartKey: cursor ? JSON.parse(Buffer.from(cursor, 'base64').toString('utf8')) : undefined,
    }),
  );

  const items = res.Items ?? [];
  const orgIds = Array.from(new Set(items.map((i) => i.orgId as string).filter(Boolean)));
  const orgsById = new Map<string, any>();
  if (orgIds.length > 0) {
    const batch = await ddb.send(
      new BatchGetCommand({
        RequestItems: {
          [tables.orgs]: { Keys: orgIds.map((orgId) => ({ orgId })) },
        },
      }),
    );
    for (const o of batch.Responses?.[tables.orgs] ?? []) orgsById.set(o.orgId, o);
  }

  const vendors = items.map((d) => {
    const org = orgsById.get(d.orgId);
    return {
      domain: d.domain,
      verifiedAt: d.verifiedAt,
      org: org ? { orgId: org.orgId, name: org.name, slug: org.slug } : null,
    };
  });

  return publicOk({
    vendors,
    nextCursor: res.LastEvaluatedKey ? Buffer.from(JSON.stringify(res.LastEvaluatedKey)).toString('base64') : null,
  });
});
