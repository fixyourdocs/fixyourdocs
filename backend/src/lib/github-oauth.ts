// Thin wrappers over the GitHub OAuth 2.0 web flow used by auth/callback.ts.
// The access token returned here is short-lived in our process: callback.ts
// fetches the id + verified email, then discards it (finding L1) — it is never
// persisted.

const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const API = 'https://api.github.com';
const USER_AGENT = 'fixyourdocs-hub';

export async function exchangeCodeForToken(opts: {
  clientId: string;
  clientSecret: string;
  code: string;
  redirectUri: string;
}): Promise<string | null> {
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'User-Agent': USER_AGENT,
    },
    body: JSON.stringify({
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      code: opts.code,
      redirect_uri: opts.redirectUri,
    }),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token ?? null;
}

export async function fetchGithubId(token: string): Promise<string | null> {
  const res = await fetch(`${API}/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': USER_AGENT,
    },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { id?: number };
  return typeof data.id === 'number' ? String(data.id) : null;
}

// Select the primary email that GitHub reports as verified (finding C2). An
// unverified email is never trusted — return null so callback.ts rejects.
export async function fetchPrimaryVerifiedEmail(token: string): Promise<string | null> {
  const res = await fetch(`${API}/user/emails`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': USER_AGENT,
    },
  });
  if (!res.ok) return null;
  const data = (await res.json()) as Array<{ email: string; primary: boolean; verified: boolean }>;
  const primary = data.find((e) => e.primary && e.verified);
  return primary ? primary.email.toLowerCase() : null;
}
