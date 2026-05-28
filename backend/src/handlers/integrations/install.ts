import { randomBytes } from 'node:crypto';
import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { requireUser, getOrigin } from '../../lib/auth';
import { ddb, tables } from '../../lib/db';
import { installStateKey } from '../../lib/oauth-state';
import { ok } from '../../lib/response';
import { wrapAuth } from '../../lib/wrap';

const STATE_TTL_SECONDS = 600;

// GET /v1/integrations/github/install (P0-08 Step 5). Authenticated: the JWT
// authoriser reads the bearer token from the Authorization header, so the SPA
// calls this with `fetch` (not a top-level navigation, which can't set that
// header) and then redirects the browser to the returned `url`. Mint a
// one-time state row binding the sub; the unauthenticated callback recovers
// the sub by consuming that row.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = wrapAuth(async (event) => {
  const user = requireUser(event);

  const state = randomBytes(32).toString('hex');
  const now = Math.floor(Date.now() / 1000);
  await ddb.send(
    new PutCommand({
      TableName: tables.oauthState,
      Item: { pk: installStateKey(state), sub: user.sub, ttl: now + STATE_TTL_SECONDS },
    }),
  );

  const slug = process.env.GITHUB_APP_SLUG!;
  const url = `https://github.com/apps/${slug}/installations/new?state=${state}`;
  return ok({ url }, getOrigin(event));
});
