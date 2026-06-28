import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { requireUser, getOrigin, HttpError } from '../../lib/auth';
import { wrapAuth } from '../../lib/wrap';
import { ok } from '../../lib/response';
import { ddb, tables } from '../../lib/db';
import { normalizeDomain } from '../../lib/domains';
import { isPagesKey, decodePagesDeleteToken } from '../../lib/pages';

// DELETE /v1/orgs/me/domains/{domain}. Authenticated. Deletes the caller's DNS
// domain (has a `.`; canonicalised) or Pages claim (synthetic key, sent
// base64url because it has `/`). The conditional delete is owner-scoped, so a
// foreign or missing row 404s without leaking existence.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = wrapAuth(async (event) => {
  const user = requireUser(event);
  const param = decodeURIComponent(event.pathParameters?.domain ?? '');
  let domain: string;
  if (param.includes('.')) {
    domain = normalizeDomain(param);
  } else {
    domain = decodePagesDeleteToken(param);
    if (!isPagesKey(domain)) throw new HttpError(400, 'invalid_claim', 'Not a valid claim identifier');
  }

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
