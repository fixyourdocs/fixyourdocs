import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { resolveTxt } from 'node:dns/promises';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables } from '../../lib/db.js';
import { requireUser, HttpError, getOrigin } from '../../lib/auth.js';
import { ok, errorResponse } from '../../lib/response.js';
import { requireMembership } from '../../lib/membership.js';
import { domainSchema } from '../../lib/validation.js';
import { nowIso } from '../../lib/ids.js';
import { wrapAuth } from '../../lib/wrap.js';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = wrapAuth(async (event) => {
  const origin = getOrigin(event);
  const user = requireUser(event as any);
  const orgId = event.pathParameters?.orgId;
  const rawDomain = event.pathParameters?.domain;
  if (!orgId || !rawDomain) throw new HttpError(404, 'not_found', 'missing path params');
  await requireMembership(user.sub, orgId);

  const parsed = domainSchema.safeParse(rawDomain);
  if (!parsed.success) {
    return errorResponse('validation_failed', 'invalid domain', 422, origin);
  }
  const domain = parsed.data;

  const rec = await ddb.send(new GetCommand({ TableName: tables.domains, Key: { domain } }));
  if (!rec.Item || rec.Item.orgId !== orgId) {
    throw new HttpError(404, 'not_found', 'domain not registered');
  }
  if (rec.Item.status === 'verified') return ok({ domain, status: 'verified', verifiedAt: rec.Item.verifiedAt }, origin);

  const expected = `fyd-verify=${rec.Item.verificationToken}`;
  const host = `_fixyourdocs.${domain}`;

  let records: string[][] = [];
  try {
    records = await Promise.race([
      resolveTxt(host),
      new Promise<string[][]>((_, rej) => setTimeout(() => rej(new Error('timeout')), 5000)),
    ]);
  } catch (err: any) {
    return errorResponse('verification_failed', `TXT record not found at ${host}`, 422, origin);
  }

  const flat = records.map((r) => r.join(''));
  if (!flat.includes(expected)) {
    return errorResponse(
      'verification_failed',
      `Expected TXT record at ${host} with value "${expected}". Found: ${flat.join(' | ') || '(none)'}`,
      422,
      origin,
    );
  }

  const verifiedAt = nowIso();
  await ddb.send(
    new UpdateCommand({
      TableName: tables.domains,
      Key: { domain },
      UpdateExpression: 'SET #s = :v, verifiedAt = :t',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: { ':v': 'verified', ':t': verifiedAt },
    }),
  );

  return ok({ domain, status: 'verified', verifiedAt }, origin);
});
