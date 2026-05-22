import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { TransactWriteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables } from '../../lib/db.js';
import { requireUser, HttpError, getOrigin } from '../../lib/auth.js';
import { created, errorResponse } from '../../lib/response.js';
import { nowIso } from '../../lib/ids.js';
import { orgCreateSchema } from '../../lib/validation.js';
import { wrapAuth } from '../../lib/wrap.js';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = wrapAuth(async (event) => {
  const origin = getOrigin(event);
  const user = requireUser(event as any);
  const parsed = orgCreateSchema.safeParse(event.body ? JSON.parse(event.body) : {});
  if (!parsed.success) {
    return errorResponse('validation_failed', parsed.error.issues[0]?.message ?? 'invalid body', 422, origin);
  }
  const { name, slug } = parsed.data;
  // Use slug as orgId so uniqueness is enforced by the PK condition.
  const orgId = slug;
  const createdAt = nowIso();

  try {
    await ddb.send(
      new TransactWriteCommand({
        TransactItems: [
          {
            Put: {
              TableName: tables.orgs,
              Item: { orgId, name, slug, ownerUserId: user.sub, createdAt },
              ConditionExpression: 'attribute_not_exists(orgId)',
            },
          },
          {
            Put: {
              TableName: tables.memberships,
              Item: { userId: user.sub, orgId, role: 'owner', createdAt },
            },
          },
        ],
      }),
    );
  } catch (err: any) {
    if (err?.name === 'TransactionCanceledException') {
      throw new HttpError(409, 'slug_taken', 'slug already in use');
    }
    throw err;
  }

  return created({ orgId, name, slug, createdAt }, origin);
});
