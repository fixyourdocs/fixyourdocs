import type { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { DeleteCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables } from '../../lib/db';
import { nowIso } from '../../lib/ids';
import { installStateKey } from '../../lib/oauth-state';
import { checkAndConsume } from '../../lib/rate-limit';
import {
  exchangeInstallCode,
  getInstallationAccountLogin,
  userControlsInstallation,
} from '../../lib/github-app';
import { wrapPublic } from '../../lib/wrap';

function appUrl(p: string): string {
  return `${process.env.APP_BASE_URL}${p}`;
}
function redirect(location: string): APIGatewayProxyResultV2 {
  return { statusCode: 302, headers: { location } };
}

// GET /v1/integrations/github/callback (P0-08 Step 5). UNauthenticated — GitHub
// redirects the browser here after install. It cannot sit behind the JWT
// authoriser, so it is protected by the one-time state row + an ownership check.
export const handler: APIGatewayProxyHandlerV2 = wrapPublic(
  async (event): Promise<APIGatewayProxyResultV2> => {
    // S9: reject junk before any GitHub call.
    if (!(await checkAndConsume(event.requestContext.http.sourceIp))) {
      return redirect(appUrl('/integrations/github?error=rate_limited'));
    }

    const q = event.queryStringParameters ?? {};
    const state = q.state;
    const code = q.code;
    const installationId = Number(q.installation_id);
    if (!state || !code || !Number.isInteger(installationId) || installationId <= 0) {
      return redirect(appUrl('/integrations/github?error=invalid_request'));
    }

    // Consume the state row (delete-on-read → replay-proof; recovers the sub).
    const consumed = await ddb.send(
      new DeleteCommand({
        TableName: tables.oauthState,
        Key: { pk: installStateKey(state) },
        ReturnValues: 'ALL_OLD',
      }),
    );
    const row = consumed.Attributes;
    const now = Math.floor(Date.now() / 1000);
    if (!row || (typeof row.ttl === 'number' && row.ttl <= now)) {
      return redirect(appUrl('/integrations/github?error=state_mismatch'));
    }
    const sub = row.sub as string;

    // S2: prove the installer actually controls this installation. Fail closed.
    const userToken = await exchangeInstallCode(code);
    if (!userToken) return redirect(appUrl('/integrations/github?error=github_oauth_failed'));
    if (!(await userControlsInstallation(userToken, installationId))) {
      return redirect(appUrl('/integrations/github?error=not_your_installation'));
    }

    const accountLogin = await getInstallationAccountLogin(installationId);
    const ts = nowIso();
    await ddb.send(
      new PutCommand({
        TableName: tables.integrations,
        Item: {
          userId: sub,
          installationId,
          installAccountLogin: accountLogin,
          status: 'installed',
          createdAt: ts,
          updatedAt: ts,
        },
      }),
    );

    // S3: redirect only to the server-controlled SPA, never a request URL.
    return redirect(appUrl('/integrations/github?installed=1'));
  },
);
