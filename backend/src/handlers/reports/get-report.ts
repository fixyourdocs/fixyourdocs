import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables } from '../../lib/db';
import { publicError, publicJson } from '../../lib/response';
import { wrapPublic } from '../../lib/wrap';

export const handler: APIGatewayProxyHandlerV2 = wrapPublic(async (event) => {
  const reportId = event.pathParameters?.reportId;
  if (!reportId || reportId.length > 64) {
    return publicError('not_found', 'Report not found', 404);
  }

  const res = await ddb.send(
    new GetCommand({
      TableName: tables.reports,
      Key: { reportId },
    }),
  );
  if (!res.Item) {
    return publicError('not_found', 'Report not found', 404);
  }

  return publicJson(200, {
    id: res.Item.reportId,
    created_at: res.Item.createdAt,
    doc_url: res.Item.docUrl,
    agent: { name: res.Item.agentName },
    report: {
      kind: res.Item.kind,
      summary: res.Item.summary,
      ...(res.Item.details ? { details: res.Item.details } : {}),
    },
  });
});
