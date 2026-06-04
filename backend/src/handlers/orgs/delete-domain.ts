import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { requireUser, getOrigin, HttpError } from '../../lib/auth';
import { wrapAuth } from '../../lib/wrap';
import { ok } from '../../lib/response';
import { ddb, tables } from '../../lib/db';
import { normalizeDomain } from '../../lib/domains';

// DELETE /v1/orgs/me/domains/{domain} (P0-16). Authenticated. Hard-deletes the
// caller's domain claim (pending or verified). normalizeDomain canonicalises
// the path param (casing/IDN) so it can't dodge the owner check by hitting a
// different stored key. The owner check is a conditional delete: a row that
// isn't yours — or is already gone — fails the condition and returns 404, so we
// never leak whether some other user owns the domain.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = wrapAuth(async (event) => {
  const user = requireUser(event);
  const domain = normalizeDomain(decodeURIComponent(event.pathParameters?.domain ?? ''));

  try {
    await ddb.send(
      new DeleteCommand({
        TableName: tables.domains,
        Key: { domain },
        ConditionExpression: 'userId = :sub',
        ExpressionAttributeValues: { ':sub': user.sub },
      }),
    );
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      throw new HttpError(404, 'not_found', 'Domain not claimed by you');
    }
    throw err;
  }

  return ok({ deleted: true }, getOrigin(event));
});
