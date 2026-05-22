import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { BatchGetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables } from '../../lib/db.js';
import { requireUser, getOrigin } from '../../lib/auth.js';
import { ok } from '../../lib/response.js';
import { membershipsForUser } from '../../lib/membership.js';
import { wrapAuth } from '../../lib/wrap.js';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = wrapAuth(async (event) => {
  const origin = getOrigin(event);
  const user = requireUser(event as any);
  const memberships = await membershipsForUser(user.sub);
  if (memberships.length === 0) return ok({ orgs: [] }, origin);

  const res = await ddb.send(
    new BatchGetCommand({
      RequestItems: {
        [tables.orgs]: {
          Keys: memberships.map((m) => ({ orgId: m.orgId })),
        },
      },
    }),
  );
  const orgsById = new Map<string, any>();
  for (const item of res.Responses?.[tables.orgs] ?? []) orgsById.set(item.orgId, item);

  const orgs = memberships
    .map((m) => {
      const o = orgsById.get(m.orgId);
      if (!o) return null;
      return { orgId: o.orgId, name: o.name, slug: o.slug, role: m.role };
    })
    .filter(Boolean);

  return ok({ orgs }, origin);
});
