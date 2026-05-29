import type { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables } from '../../lib/db';
import { handoffKey } from '../../lib/oauth-state';
import { getOrigin } from '../../lib/auth';
import { checkAndConsume } from '../../lib/rate-limit';
import { wrapPublic } from '../../lib/wrap';

// H2: ACAO is locked to the exact SPA origin(s) — never `*` and never the
// reflected request Origin verbatim — because this endpoint returns tokens.
const allowedOrigins = (process.env.ALLOWED_ORIGINS ?? '').split(',').filter(Boolean);

function headers(origin?: string): Record<string, string> {
  const allow = origin && allowedOrigins.includes(origin) ? origin : allowedOrigins[0] ?? '';
  return {
    'content-type': 'application/json',
    'cache-control': 'no-store',
    'access-control-allow-origin': allow,
    vary: 'Origin',
  };
}

// POST /v1/auth/github/exchange — trades the single-use handoff code for the
// Cognito tokens. Delete-on-read makes a replayed code 404.
export const handler: APIGatewayProxyHandlerV2 = wrapPublic(async (event): Promise<APIGatewayProxyResultV2> => {
  const h = headers(getOrigin(event));

  // M3: rate-limit so the handoff code can't be brute-forced.
  if (!(await checkAndConsume(event.requestContext.http.sourceIp))) {
    return { statusCode: 429, headers: h, body: JSON.stringify({ error: { code: 'rate_limited', message: 'Too many requests' } }) };
  }

  let body: { handoff?: unknown };
  try {
    body = event.body ? JSON.parse(event.body) : {};
  } catch {
    return { statusCode: 400, headers: h, body: JSON.stringify({ error: { code: 'invalid_json', message: 'Body is not valid JSON' } }) };
  }
  const handoff = typeof body.handoff === 'string' ? body.handoff : '';
  if (!handoff) {
    return { statusCode: 400, headers: h, body: JSON.stringify({ error: { code: 'invalid_request', message: 'Missing handoff code' } }) };
  }

  const consumed = await ddb.send(
    new DeleteCommand({ TableName: tables.oauthState, Key: { pk: handoffKey(handoff) }, ReturnValues: 'ALL_OLD' }),
  );
  const row = consumed.Attributes;
  const now = Math.floor(Date.now() / 1000);
  // Enforce expiry in code — DynamoDB TTL deletion can lag and is cleanup
  // only, not a security boundary.
  if (!row || (typeof row.ttl === 'number' && row.ttl <= now)) {
    return { statusCode: 404, headers: h, body: JSON.stringify({ error: { code: 'not_found', message: 'Handoff code is invalid or expired' } }) };
  }

  return {
    statusCode: 200,
    headers: h,
    body: JSON.stringify({
      id_token: row.id_token,
      access_token: row.access_token,
      refresh_token: row.refresh_token ?? null,
      expires_in: row.expires_in ?? 3600,
    }),
  };
});
