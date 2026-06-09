import { createHmac, timingSafeEqual } from 'node:crypto';
import type { APIGatewayProxyHandlerV2, APIGatewayProxyEventV2 } from 'aws-lambda';
import { QueryCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables } from '../../lib/db';
import { publicJson, publicError } from '../../lib/response';
import { wrapPublic } from '../../lib/wrap';
import { checkAndConsume } from '../../lib/rate-limit';
import { getParam } from '../../lib/ssm';

// POST /v1/webhooks/github (P0-16). Unauthenticated route, but HMAC-verified:
// the signature check IS the auth. GitHub fires installation.deleted when a user
// removes the App from GitHub's own UI; without this our integration row would
// go stale (pointing at a dead installation). We reconcile by dropping the
// matching row, found via the integrations installationId-index GSI.
//
// HTTP API v2 lowercases header keys. The body must be HMAC'd over the exact
// bytes GitHub sent, so decode base64 if the gateway flagged it.

function rawBody(event: APIGatewayProxyEventV2): Buffer {
  if (!event.body) return Buffer.alloc(0);
  return Buffer.from(event.body, event.isBase64Encoded ? 'base64' : 'utf8');
}

async function signatureValid(event: APIGatewayProxyEventV2, body: Buffer): Promise<boolean> {
  const header = event.headers?.['x-hub-signature-256'];
  if (!header) return false;
  const secret = await getParam(process.env.GITHUB_WEBHOOK_SECRET_PARAM!, true);
  const expected = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  // Length-guard before timingSafeEqual (it throws on unequal lengths).
  return a.length === b.length && timingSafeEqual(a, b);
}

export const handler: APIGatewayProxyHandlerV2 = wrapPublic(async (event) => {
  // Public route → per-IP token bucket, same as the other public endpoints.
  if (!(await checkAndConsume(event.requestContext.http.sourceIp))) {
    return publicError('rate_limited', 'Too many requests', 429);
  }

  // Verify the signature over the raw body BEFORE parsing — reject forgeries
  // with 401 without ever touching attacker-controlled JSON.
  const body = rawBody(event);
  if (!(await signatureValid(event, body))) {
    return publicError('bad_signature', 'Invalid or missing signature', 401);
  }

  let payload: { action?: string; installation?: { id?: number } };
  try {
    payload = JSON.parse(body.toString('utf8'));
  } catch {
    return publicError('invalid_json', 'Body is not valid JSON', 400);
  }

  // Only installation.deleted reconciles. Everything else (incl. the
  // reversible installation.suspend) is acked 200 so GitHub stops retrying;
  // we deliberately do NOT delete on suspend — that would strand a user whose
  // install is only paused.
  const eventType = event.headers?.['x-github-event'];
  if (eventType !== 'installation' || payload.action !== 'deleted') {
    return publicJson(200, { ok: true, ignored: true });
  }

  const installationId = payload.installation?.id;
  if (!installationId) return publicJson(200, { ok: true, ignored: true });

  // integrations is keyed by userId, so find the owning row by installationId
  // via the GSI (added in the infra data-stack for exactly this lookup).
  const matched = await ddb.send(
    new QueryCommand({
      TableName: tables.integrations,
      IndexName: 'installationId-index',
      KeyConditionExpression: 'installationId = :iid',
      ExpressionAttributeValues: { ':iid': installationId },
    }),
  );
  const rows = (matched.Items as Array<{ userId: string }> | undefined) ?? [];
  for (const row of rows) {
    await ddb.send(new DeleteCommand({ TableName: tables.integrations, Key: { userId: row.userId } }));
  }

  return publicJson(200, { ok: true, reconciled: rows.length });
});
