import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables } from '../../lib/db.js';
import { requireUser, HttpError, getOrigin } from '../../lib/auth.js';
import { noContent } from '../../lib/response.js';
import { requireMembership } from '../../lib/membership.js';
import { domainSchema } from '../../lib/validation.js';
import { wrapAuth } from '../../lib/wrap.js';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = wrapAuth(async (event) => {
  const origin = getOrigin(event);
  const user = requireUser(event as any);
  const orgId = event.pathParameters?.orgId;
  const rawDomain = event.pathParameters?.domain;
  if (!orgId || !rawDomain) throw new HttpError(404, 'not_found', 'missing path params');
  await requireMembership(user.sub, orgId);

  const parsed = domainSchema.safeParse(rawDomain);
  if (!parsed.success) throw new HttpError(422, 'validation_failed', 'invalid domain');
  const domain = parsed.data;

  try {
    await ddb.send(
      new DeleteCommand({
        TableName: tables.domains,
        Key: { domain },
        ConditionExpression: 'orgId = :o',
        ExpressionAttributeValues: { ':o': orgId },
      }),
    );
  } catch (err: any) {
    if (err?.name === 'ConditionalCheckFailedException') {
      throw new HttpError(403, 'forbidden', 'domain not owned by this org');
    }
    throw err;
  }

  return noContent(origin);
});
