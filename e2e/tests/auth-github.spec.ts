import { test, expect, request, type Page } from '@playwright/test';

// P3-08 — "Sign in with GitHub" (Cognito CUSTOM_AUTH).
//
// These tests exercise a LIVE sandbox stack: a deployed Hub, a sandbox GitHub
// OAuth App, and a sandbox Cognito pool with the three challenge triggers
// wired. CI does not run e2e (it has no deployed stack), so the whole suite
// skips unless HUB_BASE_URL points at a sandbox Hub. The full-dance tests skip
// further unless a sandbox GitHub test account is provided.
//
// Required env:
//   HUB_BASE_URL          sandbox Hub origin, e.g. https://hub-sandbox.fixyourdocs.io
//   BASE_URL              sandbox SPA origin (Playwright baseURL)
//   FYD_TEST_GITHUB_USER  + FYD_TEST_GITHUB_PASSWORD  (tests 1, 4 — full consent dance)
//   COGNITO_REGION, COGNITO_CLIENT_ID, FYD_TEST_USERNAME  (test 5 — direct InitiateAuth)

const HUB_BASE_URL = process.env.HUB_BASE_URL;
const GITHUB_USER = process.env.FYD_TEST_GITHUB_USER;
const GITHUB_PASSWORD = process.env.FYD_TEST_GITHUB_PASSWORD;

// Drive the SPA → GitHub consent → back to the SPA. Best-effort automation of
// GitHub's login + authorize screens; tune selectors per the sandbox account's
// 2FA / "reauthorize" state.
async function signInWithGithub(page: Page): Promise<void> {
  await page.goto('/signin');
  await page.getByRole('button', { name: /sign in with github/i }).click();

  await page.waitForURL(/github\.com/, { timeout: 30_000 });
  if (await page.locator('#login_field').isVisible().catch(() => false)) {
    await page.locator('#login_field').fill(GITHUB_USER!);
    await page.locator('#password').fill(GITHUB_PASSWORD!);
    await page.getByRole('button', { name: /sign in/i }).click();
  }
  const authorize = page.getByRole('button', { name: /authorize/i });
  if (await authorize.isVisible().catch(() => false)) {
    await authorize.click();
  }
}

test.describe('Sign in with GitHub (P3-08)', () => {
  test.skip(!HUB_BASE_URL, 'HUB_BASE_URL not set; requires a deployed sandbox Hub');

  test.describe('full OAuth dance', () => {
    test.skip(!GITHUB_USER || !GITHUB_PASSWORD, 'no sandbox GitHub test account configured');

    // 8a — new user: a brand-new GitHub account lands signed in with a fresh
    // Cognito user (custom:github_id set, email_verified=true).
    test('new user is created and lands on /integrations/github', async ({ page }) => {
      await signInWithGithub(page);
      await page.waitForURL(/\/integrations\/github/, { timeout: 30_000 });
      await expect(page).toHaveURL(/\/integrations\/github/);
      // No token may appear in the URL after completion.
      expect(page.url()).not.toContain('handoff=');
      expect(page.url()).not.toContain('id_token');
    });

    // 8d (finding C2) — a GitHub account whose primary email is UNVERIFIED is
    // rejected and no Cognito user is created.
    test('unverified GitHub email is rejected with error=email_unverified', async ({ page }) => {
      // Requires FYD_TEST_GITHUB_USER to be an account with no verified primary
      // email. Asserts the reject redirect rather than a successful landing.
      await signInWithGithub(page);
      await page.waitForURL(/\/signin\?error=email_unverified/, { timeout: 30_000 });
      await expect(page).toHaveURL(/error=email_unverified/);
    });
  });

  // 8b — existing email + new GitHub link. Pre-seed a Cognito user (verified
  // email) via the Admin API, then run the dance with a GitHub account whose
  // primary email matches; assert the existing user is reused and
  // custom:github_id is now set. Needs AWS admin credentials in the harness.
  test.fixme('existing verified-email user is reused and linked', async () => {});

  // 8c — reject path: pre-seed a Cognito user with email_verified=false; the
  // dance must redirect with error=verify_email_first. Needs admin seeding.
  test.fixme('unverified existing user is rejected with verify_email_first', async () => {});

  // 8e (finding C1) — a direct InitiateAuth(CUSTOM_AUTH) with no backend-issued
  // pin must fail with no tokens. Driven straight against the Cognito JSON API,
  // no browser or GitHub account needed.
  test('direct CUSTOM_AUTH with no pin issues no tokens (fail closed)', async () => {
    const region = process.env.COGNITO_REGION;
    const clientId = process.env.COGNITO_CLIENT_ID;
    const username = process.env.FYD_TEST_USERNAME;
    test.skip(!region || !clientId || !username, 'COGNITO_REGION / COGNITO_CLIENT_ID / FYD_TEST_USERNAME not set');

    const idp = await request.newContext({ baseURL: `https://cognito-idp.${region}.amazonaws.com` });
    const call = (target: string, body: unknown) =>
      idp.post('/', {
        headers: { 'content-type': 'application/x-amz-json-1.1', 'x-amz-target': `AWSCognitoIdentityProviderService.${target}` },
        data: body,
      });

    const init = await call('InitiateAuth', { AuthFlow: 'CUSTOM_AUTH', ClientId: clientId, AuthParameters: { USERNAME: username } });
    expect(init.ok()).toBeTruthy();
    const challenge = await init.json();
    expect(challenge.AuthenticationResult).toBeUndefined();
    expect(challenge.ChallengeName).toBe('CUSTOM_CHALLENGE');

    const answer = await call('RespondToAuthChallenge', {
      ChallengeName: 'CUSTOM_CHALLENGE',
      ClientId: clientId,
      Session: challenge.Session,
      ChallengeResponses: { USERNAME: username, ANSWER: 'definitely-not-the-pin' },
    });
    expect(answer.status()).toBe(400);
    const body = await answer.json();
    expect(String(body.__type)).toContain('NotAuthorizedException');
    expect(body.AuthenticationResult).toBeUndefined();
  });

  // 8f (finding H1) — a callback carrying a valid `state` but a missing
  // fyd_oauth_bind cookie must redirect with error=state_mismatch.
  test('callback without the binding cookie is rejected (state_mismatch)', async () => {
    // /start mints the state row + Set-Cookie in one context...
    const starter = await request.newContext({ baseURL: HUB_BASE_URL });
    const startRes = await starter.get('/v1/auth/github/start', { maxRedirects: 0 });
    expect(startRes.status()).toBe(302);
    const state = new URL(startRes.headers()['location']).searchParams.get('state');
    expect(state).toBeTruthy();

    // ...but the callback is replayed from a FRESH context (no bind cookie).
    const attacker = await request.newContext({ baseURL: HUB_BASE_URL });
    const cb = await attacker.get(`/v1/auth/github/callback?state=${state}&code=irrelevant`, { maxRedirects: 0 });
    expect(cb.status()).toBe(302);
    expect(cb.headers()['location']).toContain('error=state_mismatch');
  });
});
