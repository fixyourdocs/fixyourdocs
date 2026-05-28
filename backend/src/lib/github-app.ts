// GitHub App client (P0-08 Step 5/6). Distinct from github-oauth.ts, which is
// the "Sign in with GitHub" OAuth App used by auth/*. This module handles the
// *install + forward* App: App-JWT + installation tokens (to write Issues),
// the user-authorization-during-installation code exchange, and the
// installation-ownership check.
//
// SSM parameter NAMES arrive via env vars (never hardcode the SSM paths in this
// public repo). The App private key + client secret are SecureStrings.

import { createAppAuth } from '@octokit/auth-app';
import { getParam } from './ssm';

const API = 'https://api.github.com';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const USER_AGENT = 'fixyourdocs-hub';

// Built once per warm Lambda; getParam itself caches the SSM reads.
let authPromise: Promise<ReturnType<typeof createAppAuth>> | null = null;

function appAuth(): Promise<ReturnType<typeof createAppAuth>> {
  if (!authPromise) {
    authPromise = (async () => {
      const [appId, privateKey, clientId, clientSecret] = await Promise.all([
        getParam(process.env.GITHUB_APP_ID_PARAM!),
        getParam(process.env.GITHUB_APP_PRIVATE_KEY_PARAM!, true),
        getParam(process.env.GITHUB_APP_CLIENT_ID_PARAM!),
        getParam(process.env.GITHUB_APP_CLIENT_SECRET_PARAM!, true),
      ]);
      return createAppAuth({ appId, privateKey, clientId, clientSecret });
    })();
  }
  return authPromise;
}

// Installation token scoped to a SINGLE repo + issues:write only (least
// privilege, audit S7). Throws if the App is not installed on that repo.
export async function installationToken(installationId: number, repoName: string): Promise<string> {
  const auth = await appAuth();
  const { token } = await auth({
    type: 'installation',
    installationId,
    repositoryNames: [repoName],
    permissions: { issues: 'write' },
  });
  return token;
}

export async function getInstallationAccountLogin(installationId: number): Promise<string | null> {
  const auth = await appAuth();
  const { token } = await auth({ type: 'app' }); // short-lived App JWT
  const res = await fetch(`${API}/app/installations/${installationId}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': USER_AGENT,
    },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { account?: { login?: string } };
  return data.account?.login ?? null;
}

// "Request user authorization (OAuth) during installation" returns a code on
// the callback. Swap it for a short-lived user-to-server token, used once to
// prove ownership, then discarded (never persisted).
export async function exchangeInstallCode(code: string): Promise<string | null> {
  const [clientId, clientSecret] = await Promise.all([
    getParam(process.env.GITHUB_APP_CLIENT_ID_PARAM!),
    getParam(process.env.GITHUB_APP_CLIENT_SECRET_PARAM!, true),
  ]);
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

// Audit S2 (the load-bearing control): confirm the person who completed the
// install actually controls this installation. Without it, a logged-in
// attacker could bind a victim's installation_id to their own account.
export async function userControlsInstallation(
  userToken: string,
  installationId: number,
): Promise<boolean> {
  for (let page = 1; ; page += 1) {
    const res = await fetch(`${API}/user/installations?per_page=100&page=${page}`, {
      headers: {
        Authorization: `Bearer ${userToken}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': USER_AGENT,
      },
    });
    if (!res.ok) return false;
    const data = (await res.json()) as {
      total_count: number;
      installations: Array<{ id: number }>;
    };
    if (data.installations.some((i) => i.id === installationId)) return true;
    if (data.installations.length === 0 || page * 100 >= data.total_count) return false;
  }
}

// Used by the Step 6 forwarder. Returns null on any non-2xx so the caller can
// mark the forward failed without leaking GitHub's response.
export async function createIssue(
  token: string,
  owner: string,
  repo: string,
  title: string,
  body: string,
): Promise<{ number: number; htmlUrl: string } | null> {
  const res = await fetch(
    `${API}/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/issues`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
        'User-Agent': USER_AGENT,
      },
      body: JSON.stringify({ title, body }),
    },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { number: number; html_url: string };
  return { number: data.number, htmlUrl: data.html_url };
}
