import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { randomBytes } from 'node:crypto';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables } from '../../lib/db.js';
import { requireUser, HttpError, getOrigin } from '../../lib/auth.js';
import { created, errorResponse } from '../../lib/response.js';
import { requireMembership } from '../../lib/membership.js';
import { registerDomainSchema } from '../../lib/validation.js';
import { nowIso } from '../../lib/ids.js';
import { wrapAuth } from '../../lib/wrap.js';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = wrapAuth(async (event) => {
  const origin = getOrigin(event);
  const user = requireUser(event as any);
  const orgId = event.pathParameters?.orgId;
  if (!orgId) throw new HttpError(404, 'not_found', 'missing orgId');
  await requireMembership(user.sub, orgId);

  const parsed = registerDomainSchema.safeParse(event.body ? JSON.parse(event.body) : {});
  if (!parsed.success) {
    return errorResponse('validation_failed', parsed.error.issues[0]?.message ?? 'invalid body', 422, origin);
  }
  const { domain } = parsed.data;
  const verificationToken = randomBytes(24).toString('base64url');
  const createdAt = nowIso();

  try {
    await ddb.send(
      new PutCommand({
        TableName: tables.domains,
        Item: {
          domain,
          orgId,
          status: 'pending',
          verificationToken,
          createdAt,
        },
        ConditionExpression: 'attribute_not_exists(#d) OR orgId = :o',
        ExpressionAttributeNames: { '#d': 'domain' },
        ExpressionAttributeValues: { ':o': orgId },
      }),
    );
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') {
      throw new HttpError(409, 'domain_taken_by_other_org', 'domain owned by another organization');
    }
    throw err;
  }

  return created(
    {
      domain,
      status: 'pending',
      verification: {
        type: 'dns_txt',
        host: `_fixyourdocs.${domain}`,
        value: `fyd-verify=${verificationToken}`,
      },
    },
    origin,
  );
});
