import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables } from '../../lib/db.js';
import { HttpError } from '../../lib/auth.js';
import { publicOk, publicError } from '../../lib/response.js';
import { domainSchema } from '../../lib/validation.js';
import { wrapPublic } from '../../lib/wrap.js';

export const handler: APIGatewayProxyHandlerV2 = wrapPublic(async (event) => {
  const rawDomain = event.pathParameters?.domain;
  const reportId = event.pathParameters?.reportId;
  if (!rawDomain || !reportId) throw new HttpError(404, 'not_found', 'missing path params');
  const parsed = domainSchema.safeParse(rawDomain);
  if (!parsed.success) return publicError('validation_failed', 'invalid domain', 422);
  const domain = parsed.data;

  const r = await ddb.send(new GetCommand({ TableName: tables.reports, Key: { domain, reportId } }));
  if (!r.Item || r.Item.status === 'spam') return publicError('not_found', 'report not found', 404);

  const domRes = await ddb.send(new GetCommand({ TableName: tables.domains, Key: { domain } }));
  if (!domRes.Item || domRes.Item.status !== 'verified') {
    return publicError('domain_not_registered', 'domain is not registered', 404);
  }

  const reps = await ddb.send(
    new QueryCommand({
      TableName: tables.replies,
      KeyConditionExpression: 'reportId = :r',
      ExpressionAttributeValues: { ':r': reportId },
      ScanIndexForward: true,
    }),
  );
  const replies = (reps.Items ?? [])
    .filter((rp) => rp.visibility === 'public')
    .map((rp) => ({ createdAt: rp.createdAt, body: rp.body }));

  return publicOk({
    report: {
      reportId: r.Item.reportId,
      domain: r.Item.domain,
      status: r.Item.status,
      issueType: r.Item.issueType,
      url: r.Item.url,
      title: r.Item.title,
      description: r.Item.description,
      evidence: r.Item.evidence ?? null,
      createdAt: r.Item.createdAt,
      updatedAt: r.Item.updatedAt,
    },
    replies,
  });
});
