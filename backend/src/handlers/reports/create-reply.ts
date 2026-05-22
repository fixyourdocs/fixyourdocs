import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables } from '../../lib/db.js';
import { requireUser, HttpError, getOrigin } from '../../lib/auth.js';
import { created, errorResponse } from '../../lib/response.js';
import { requireMembership } from '../../lib/membership.js';
import { domainSchema, replySchema } from '../../lib/validation.js';
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
  await requireMembership(user.sub, reportRes.Item.orgId as string);

  const parsed = replySchema.safeParse(event.body ? JSON.parse(event.body) : {});
  if (!parsed.success) {
    return errorResponse('validation_failed', parsed.error.issues[0]?.message ?? 'invalid body', 422, origin);
  }
  const { body, visibility = 'public' } = parsed.data;
  const createdAt = nowIso();

  await ddb.send(
    new PutCommand({
      TableName: tables.replies,
      Item: { reportId, createdAt, domain, authorUserId: user.sub, body, visibility },
    }),
  );

  return created({ reportId, createdAt, body, visibility }, origin);
});
