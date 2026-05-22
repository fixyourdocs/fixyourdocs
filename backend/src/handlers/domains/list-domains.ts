import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
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

  const res = await ddb.send(
    new QueryCommand({
      TableName: tables.domains,
      IndexName: 'org-index',
      KeyConditionExpression: 'orgId = :o',
      ExpressionAttributeValues: { ':o': orgId },
    }),
  );

  const domains = (res.Items ?? []).map((d) => ({
    domain: d.domain,
    status: d.status,
    createdAt: d.createdAt,
    verifiedAt: d.verifiedAt ?? null,
    verification:
      d.status === 'pending'
        ? {
            type: 'dns_txt',
            host: `_fixyourdocs.${d.domain}`,
            value: `fyd-verify=${d.verificationToken}`,
          }
        : undefined,
  }));

  return ok({ domains }, origin);
});
