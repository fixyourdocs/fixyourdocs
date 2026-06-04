import { randomBytes } from 'node:crypto';
import type {
  APIGatewayProxyEventV2,
  APIGatewayProxyHandlerV2,
  APIGatewayProxyResultV2,
} from 'aws-lambda';
import { DeleteCommand, GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import {
  CognitoIdentityProviderClient,
  AdminCreateUserCommand,
  AdminInitiateAuthCommand,
  AdminRespondToAuthChallengeCommand,
  AdminSetUserPasswordCommand,
  AdminUpdateUserAttributesCommand,
  ListUsersCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { ddb, tables } from '../../lib/db';
import { handoffKey, pinKey, stateKey } from '../../lib/oauth-state';
import { getParam } from '../../lib/ssm';
import {
  exchangeCodeForToken,
  fetchGithubId,
  fetchPrimaryVerifiedEmail,
} from '../../lib/github-oauth';
import { checkAndConsume } from '../../lib/rate-limit';
import { wrapPublic } from '../../lib/wrap';

const cognito = new CognitoIdentityProviderClient({});

const PIN_TTL_SECONDS = 120;
const HANDOFF_TTL_SECONDS = 60;
// Throwaway password to move an AdminCreateUser account out of
// FORCE_CHANGE_PASSWORD (finding M4). Never used and never stored — GitHub is
// the only credential. Mixed case + digit satisfies the user-pool policy.
const throwawayPassword = () => `${randomBytes(24).toString('hex')}Aa1`;

function appUrl(p: string): string {
  return `${process.env.APP_BASE_URL}${p}`;
}

function redirect(location: string, clearBindCookie = false): APIGatewayProxyResultV2 {
  const res: APIGatewayProxyResultV2 = { statusCode: 302, headers: { location } };
  if (clearBindCookie) {
    res.cookies = ['fyd_oauth_bind=; HttpOnly; Secure; SameSite=Lax; Path=/v1/auth/github; Max-Age=0'];
  }
  return res;
}

function readCookie(event: APIGatewayProxyEventV2, name: string): string | undefined {
  for (const c of event.cookies ?? []) {
    const eq = c.indexOf('=');
    if (eq > 0 && c.slice(0, eq).trim() === name) return c.slice(eq + 1);
  }
  return undefined;
}

interface LinkResult {
  username?: string;
  reject?: string;
}

// Linking policy (see P3-08 §"Linking policy"). Keyed on the GitHub-vouched
// verified email plus a reverse github_id→username index, so that one GitHub
// account maps to exactly one Cognito user.
async function resolveUser(email: string, githubId: string): Promise<LinkResult> {
  const userPoolId = process.env.COGNITO_USER_POOL_ID!;

  const byEmail = await cognito.send(
    new ListUsersCommand({ UserPoolId: userPoolId, Filter: `email = "${email}"`, Limit: 1 }),
  );
  const existing = byEmail.Users?.[0];

  const linkRow = await ddb.send(
    new GetCommand({ TableName: tables.githubLinks, Key: { githubId } }),
  );
  const linkedUsername = linkRow.Item?.username as string | undefined;

  if (!existing) {
    // No account on this email. If the github_id is already bound to a
    // different account, reject — never split one GitHub identity across two.
    if (linkedUsername) return { reject: 'account_conflict' };

    // Pool is UsernameAttributes:['email'] — AdminCreateUser requires the email
    // as Username; Cognito assigns the immutable UUID sub. Reuse that sub
    // downstream (pin key + AdminInitiateAuth) so it matches event.userName in
    // the CUSTOM_AUTH triggers.
    const created = await cognito.send(
      new AdminCreateUserCommand({
        UserPoolId: userPoolId,
        Username: email,
        MessageAction: 'SUPPRESS',
        UserAttributes: [
          { Name: 'email', Value: email },
          { Name: 'email_verified', Value: 'true' },
          { Name: 'custom:github_id', Value: githubId },
        ],
      }),
    );
    const username = created.User!.Username!;
    // M4: leave FORCE_CHANGE_PASSWORD → CONFIRMED so CUSTOM_AUTH can proceed.
    await cognito.send(
      new AdminSetUserPasswordCommand({
        UserPoolId: userPoolId,
        Username: username,
        Password: throwawayPassword(),
        Permanent: true,
      }),
    );
    await ddb.send(new PutCommand({ TableName: tables.githubLinks, Item: { githubId, username } }));
    return { username };
  }

  const attrs = Object.fromEntries((existing.Attributes ?? []).map((a) => [a.Name, a.Value]));
  // Closes the takeover vector: never link onto an unverified address.
  if (attrs.email_verified !== 'true') return { reject: 'verify_email_first' };

  const username = existing.Username!;
  const boundGithub = attrs['custom:github_id'];
  if (!boundGithub) {
    if (linkedUsername && linkedUsername !== username) return { reject: 'account_conflict' };
    await cognito.send(
      new AdminUpdateUserAttributesCommand({
        UserPoolId: userPoolId,
        Username: username,
        UserAttributes: [{ Name: 'custom:github_id', Value: githubId }],
      }),
    );
    await ddb.send(new PutCommand({ TableName: tables.githubLinks, Item: { githubId, username } }));
    return { username };
  }
  if (boundGithub === githubId) return { username };
  return { reject: 'account_conflict' };
}

// GET /v1/auth/github/callback — completes the GitHub OAuth dance, applies the
// linking policy, runs CUSTOM_AUTH as admin, and hands the SPA a single-use
// code (never tokens) in the redirect fragment.
export const handler: APIGatewayProxyHandlerV2 = wrapPublic(async (event): Promise<APIGatewayProxyResultV2> => {
  // M3: rate-limit the callback leg too (per-IP).
  if (!(await checkAndConsume(event.requestContext.http.sourceIp))) {
    return redirect(appUrl('/signin?error=rate_limited'));
  }

  const q = event.queryStringParameters ?? {};
  const state = q.state;
  const code = q.code;
  if (!state || !code) return redirect(appUrl('/signin?error=invalid_request'));

  // Consume the state row (delete-on-read → replay-proof).
  const consumed = await ddb.send(
    new DeleteCommand({ TableName: tables.oauthState, Key: { pk: stateKey(state) }, ReturnValues: 'ALL_OLD' }),
  );
  const row = consumed.Attributes;
  const now = Math.floor(Date.now() / 1000);
  if (!row || (typeof row.ttl === 'number' && row.ttl <= now)) {
    return redirect(appUrl('/signin?error=state_mismatch'), true);
  }

  // H1: the browser-binding cookie must match the nonce minted by /start.
  const bind = readCookie(event, 'fyd_oauth_bind');
  if (!bind || bind !== row.bind_nonce) {
    return redirect(appUrl('/signin?error=state_mismatch'), true);
  }
  const flowId = row.flow_id as string;

  const clientId = await getParam(process.env.GITHUB_OAUTH_CLIENT_ID_PARAM!);
  const clientSecret = await getParam(process.env.GITHUB_OAUTH_CLIENT_SECRET_PARAM!, true);
  const ghToken = await exchangeCodeForToken({
    clientId,
    clientSecret,
    code,
    redirectUri: `${process.env.HUB_BASE_URL}/v1/auth/github/callback`,
  });
  if (!ghToken) return redirect(appUrl('/signin?error=github_oauth_failed'), true);

  const githubId = await fetchGithubId(ghToken);
  const email = await fetchPrimaryVerifiedEmail(ghToken);
  // ghToken is intentionally discarded here — never persisted (finding L1).
  if (!githubId) return redirect(appUrl('/signin?error=github_oauth_failed'), true);
  if (!email) return redirect(appUrl('/signin?error=email_unverified'), true);

  const decision = await resolveUser(email, githubId);
  if (decision.reject) return redirect(appUrl(`/signin?error=${decision.reject}`), true);
  const username = decision.username!;

  // Seed the one-time pin (read+deleted by create-auth-challenge), then run
  // CUSTOM_AUTH as admin.
  const authPin = randomBytes(16).toString('hex');
  await ddb.send(
    new PutCommand({
      TableName: tables.oauthState,
      Item: { pk: pinKey(username), auth_pin: authPin, ttl: now + PIN_TTL_SECONDS },
    }),
  );

  const userPoolId = process.env.COGNITO_USER_POOL_ID!;
  const appClientId = process.env.COGNITO_CLIENT_ID!;
  const init = await cognito.send(
    new AdminInitiateAuthCommand({
      AuthFlow: 'CUSTOM_AUTH',
      UserPoolId: userPoolId,
      ClientId: appClientId,
      AuthParameters: { USERNAME: username },
      ClientMetadata: { flow_id: flowId },
    }),
  );
  const responded = await cognito.send(
    new AdminRespondToAuthChallengeCommand({
      ChallengeName: 'CUSTOM_CHALLENGE',
      UserPoolId: userPoolId,
      ClientId: appClientId,
      Session: init.Session,
      ChallengeResponses: { USERNAME: username, ANSWER: authPin },
      ClientMetadata: { flow_id: flowId },
    }),
  );
  const tokens = responded.AuthenticationResult;
  if (!tokens?.IdToken || !tokens.AccessToken) return redirect(appUrl('/signin?error=auth_failed'), true);

  // Token handoff: tokens go server-side under a single-use code; only the
  // opaque code rides the fragment (never a server-visible part of the URL).
  const handoff = randomBytes(32).toString('hex');
  await ddb.send(
    new PutCommand({
      TableName: tables.oauthState,
      Item: {
        pk: handoffKey(handoff),
        id_token: tokens.IdToken,
        access_token: tokens.AccessToken,
        refresh_token: tokens.RefreshToken ?? null,
        expires_in: tokens.ExpiresIn ?? 3600,
        ttl: now + HANDOFF_TTL_SECONDS,
      },
    }),
  );

  return redirect(`${appUrl('/auth/github/complete')}#handoff=${handoff}`, true);
});
