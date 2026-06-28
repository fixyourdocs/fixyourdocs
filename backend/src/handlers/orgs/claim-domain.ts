import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { requireUser, getOrigin, HttpError } from '../../lib/auth';
import { wrapAuth } from '../../lib/wrap';
import { created } from '../../lib/response';
import { ddb, tables } from '../../lib/db';
import { nowIso } from '../../lib/ids';
import { domainClaimSchema } from '../../lib/validation';
import { normalizeDomain, assertClaimable, getDomain, newChallengeToken, challengeRecord } from '../../lib/domains';

// POST /v1/orgs/me/domains. Authenticated. Claim a DNS domain: returns the TXT
// challenge to publish, status pending. (GitHub Pages no longer has an explicit
// claim — it is auto-derived from the repo claim at resolve time.)
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = wrapAuth(async (event) => {
  const user = requireUser(event);
  if (!event.body) throw new HttpError(400, 'invalid_body', 'Missing request body');

  let raw: unknown;
  try { raw = JSON.parse(event.body); } catch { throw new HttpError(400, 'invalid_json', 'Body is not JSON'); }

  const parsed = domainClaimSchema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, 'schema_violation', parsed.error.issues[0]?.message ?? 'Invalid body');

  const domain = normalizeDomain(parsed.data.domain);
  assertClaimable(domain); // (S19)

  const token = newChallengeToken();
  try {
    // (S22) conditional put serialises concurrent claims — one owner per domain.
    await ddb.send(new PutCommand({
      TableName: tables.domains,
      Item: { domain, userId: user.sub, status: 'pending', challengeToken: token, createdAt: nowIso() },
      ConditionExpression: 'attribute_not_exists(#d)',
      ExpressionAttributeNames: { '#d': 'domain' },
    }));
  } catch (err) {
    if ((err as { name?: string }).name !== 'ConditionalCheckFailedException') throw err;
    const existing = await getDomain(domain);
    if (!existing || existing.userId !== user.sub) {
      throw new HttpError(409, 'domain_taken', 'This domain is already claimed'); // (A21)
    }
    // Idempotent re-claim by the same owner → return the stored challenge.
    return created(
      { domain, status: existing.status, dns_record: challengeRecord(domain, existing.challengeToken) },
      getOrigin(event),
    );
  }

  return created({ domain, status: 'pending', dns_record: challengeRecord(domain, token) }, getOrigin(event));
});
