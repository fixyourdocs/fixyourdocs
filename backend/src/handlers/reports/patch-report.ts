import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables } from '../../lib/db.js';
import { requireUser, HttpError, getOrigin } from '../../lib/auth.js';
import { ok, errorResponse } from '../../lib/response.js';
import { requireMembership } from '../../lib/membership.js';
import { domainSchema, patchReportSchema } from '../../lib/validation.js';
import { nowIso } from '../../lib/ids.js';
import { wrapAuth } from '../../lib/wrap.js';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = wrapAuth(async (event) => {
  const origin = getOrigin(event);
  const user = requireUser(event as any);
  const rawDomain = event.pathParameters?.domain;
  const reportId = event.pathParameters?.reportId;
  if (!rawDomain || !reportId) throw new HttpError(404, 'not_found', 'missing path params');

  const domain = domainSchema.parse(rawDomain);

  const reportRes = await ddb.send(new GetCommand({ TableName: tables.reports, Key: { domain, reportId } }));
  if (!reportRes.Item) throw new HttpError(404, 'not_found', 'report not found');

  const orgId = reportRes.Item.orgId as string;
  await requireMembership(user.sub, orgId);

  const parsed = patchReportSchema.safeParse(event.body ? JSON.parse(event.body) : {});
  if (!parsed.success) {
    return errorResponse('validation_failed', parsed.error.issues[0]?.message ?? 'invalid body', 422, origin);
  }
  const { status, note } = parsed.data;
  const updatedAt = nowIso();

  if (status) {
    await ddb.send(
      new UpdateCommand({
        TableName: tables.reports,
        Key: { domain, reportId },
        UpdateExpression: 'SET #s = :s, statusCreatedAt = :sca, updatedAt = :u',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: {
          ':s': status,
          ':sca': `${status}#${reportRes.Item.createdAt}`,
          ':u': updatedAt,
        },
      }),
    );
  }

  if (note) {
    await ddb.send(
      new PutCommand({
        TableName: tables.replies,
        Item: {
          reportId,
          createdAt: updatedAt,
          domain,
          authorUserId: user.sub,
          body: note,
          visibility: 'internal',
        },
      }),
    );
  }

  return ok({ ok: true, status: status ?? reportRes.Item.status, updatedAt }, origin);
});
