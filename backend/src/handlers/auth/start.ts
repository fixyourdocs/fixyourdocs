import { randomBytes } from 'node:crypto';
import type { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables } from '../../lib/db';
import { newId } from '../../lib/ids';
import { stateKey } from '../../lib/oauth-state';
import { getParam } from '../../lib/ssm';
import { checkAndConsume } from '../../lib/rate-limit';
import { wrapPublic } from '../../lib/wrap';

const STATE_TTL_SECONDS = 600;

// GET /v1/auth/github/start — kicks off the GitHub OAuth web flow (P3-08).
export const handler: APIGatewayProxyHandlerV2 = wrapPublic(async (event): Promise<APIGatewayProxyResultV2> => {
  // M3: rate-limit so /start can't be spammed to bloat OAuthState.
  if (!(await checkAndConsume(event.requestContext.http.sourceIp))) {
    return {
      statusCode: 429,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ error: { code: 'rate_limited', message: 'Too many requests' } }),
    };
  }

  const state = randomBytes(32).toString('hex');
  const flowId = newId();
  const bindNonce = randomBytes(32).toString('hex');
  const now = Math.floor(Date.now() / 1000);

  await ddb.send(
    new PutCommand({
      TableName: tables.oauthState,
      Item: {
        pk: stateKey(state),
        flow_id: flowId,
        bind_nonce: bindNonce,
        ttl: now + STATE_TTL_SECONDS,
      },
    }),
  );

  const clientId = await getParam(process.env.GITHUB_OAUTH_CLIENT_ID_PARAM!);
  const redirectUri = `${process.env.HUB_BASE_URL}/v1/auth/github/callback`;
  const authorizeUrl =
    'https://github.com/login/oauth/authorize?' +
    new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: 'read:user user:email',
      state,
      allow_signup: 'false',
    }).toString();

  // H1: bind the flow to this browser. SameSite=Lax still rides the top-level
  // GET redirect back from GitHub; HttpOnly keeps it out of reach of JS.
  return {
    statusCode: 302,
    headers: { location: authorizeUrl },
    cookies: [
      `fyd_oauth_bind=${bindNonce}; HttpOnly; Secure; SameSite=Lax; Path=/v1/auth/github; Max-Age=${STATE_TTL_SECONDS}`,
    ],
  };
});
