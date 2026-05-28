import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { requireUser, getOrigin, HttpError } from '../../lib/auth';
import { wrapAuth } from '../../lib/wrap';
import { ok } from '../../lib/response';
import { ddb, tables } from '../../lib/db';
import { nowIso } from '../../lib/ids';
import { checkAndConsume } from '../../lib/rate-limit';
import { normalizeDomain, getDomain, verifyTxt } from '../../lib/domains';

// POST /v1/orgs/me/domains/{domain}/verify (P0-08 Step 6). Authenticated.
// Resolves the DNS TXT challenge and promotes the row to `verified` on a match.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = wrapAuth(async (event) => {
  const user = requireUser(event);

  // (S24) verification triggers outbound DNS on a user-named domain → rate-limit.
  if (!(await checkAndConsume(event.requestContext.http.sourceIp))) {
    throw new HttpError(429, 'rate_limited', 'Too many requests');
  }

  const domain = normalizeDomain(event.pathParameters?.domain ?? '');
  const row = await getDomain(domain);
  if (!row || row.userId !== user.sub) throw new HttpError(404, 'not_found', 'Domain not claimed by you');
  if (row.status === 'verified') return ok({ domain, status: 'verified' }, getOrigin(event));

  if (!(await verifyTxt(domain, row.challengeToken))) {
    return ok(
      { domain, status: 'pending', hint: 'TXT record not found yet — DNS can take a few minutes to propagate' },
      getOrigin(event),
    );
  }

  const now = nowIso();
  await ddb.send(new UpdateCommand({
    TableName: tables.domains,
    Key: { domain },
    UpdateExpression: 'SET #s = :v, verifiedAt = :t, lastCheckedAt = :t',
    ExpressionAttributeNames: { '#s': 'status' },
    ExpressionAttributeValues: { ':v': 'verified', ':t': now },
  }));

  return ok({ domain, status: 'verified', verifiedAt: now }, getOrigin(event));
});
