import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables } from '../../lib/db.js';
import { requireUser, HttpError, getOrigin } from '../../lib/auth.js';
import { ok } from '../../lib/response.js';
import { requireMembership } from '../../lib/membership.js';
import { wrapAuth } from '../../lib/wrap.js';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = wrapAuth(async (event) => {
  const origin = getOrigin(event);
  const user = requireUser(event as any);
  const orgId = event.pathParameters?.orgId;
  if (!orgId) throw new HttpError(404, 'not_found', 'missing orgId');
  await requireMembership(user.sub, orgId);

  const res = await ddb.send(new GetCommand({ TableName: tables.orgs, Key: { orgId } }));
  if (!res.Item) throw new HttpError(404, 'not_found', 'org not found');

  const { ownerUserId, ...rest } = res.Item;
  return ok(rest, origin);
});
