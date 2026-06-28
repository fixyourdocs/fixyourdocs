import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { requireUser, getOrigin, HttpError } from '../../lib/auth';
import { wrapAuth } from '../../lib/wrap';
import { ok } from '../../lib/response';
import { ddb, tables } from '../../lib/db';
import { normalizeDomain } from '../../lib/domains';
import { isPagesKey, decodePagesDeleteToken } from '../../lib/pages';
import { isRepoKey } from '../../lib/repos';

// DELETE /v1/orgs/me/domains/{domain} (P0-16; extended P0-19, P1-16).
// Authenticated. Hard-deletes the caller's claim (DNS domain — pending or
// verified — a GitHub Pages claim, or a repo claim). Two handle shapes share
// this route:
//   - a DNS domain — always contains a `.`; normalizeDomain canonicalises it
//     (casing/IDN) so it can't dodge the owner check by hitting a different key;
//   - a synthetic claim key (`pages:<host>/<prefix>/` or `repo:<owner>/<repo>`)
//     contains slashes that can't survive the `{domain}` path param, so the
//     frontend sends its base64url token instead (no `.`); we decode it back to
//     the stored key. The decode is generic base64url (decodePagesDeleteToken).
// The owner check is a conditional delete: a row that isn't yours — or is
// already gone — fails the condition and returns 404, so we never leak whether
// some other user owns the claim.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = wrapAuth(async (event) => {
  const user = requireUser(event);
  const param = decodeURIComponent(event.pathParameters?.domain ?? '');
  let domain: string;
  if (param.includes('.')) {
    domain = normalizeDomain(param);
  } else {
    domain = decodePagesDeleteToken(param);
    if (!isPagesKey(domain) && !isRepoKey(domain)) {
      throw new HttpError(400, 'invalid_claim', 'Not a valid claim identifier');
    }
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
