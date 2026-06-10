import { env } from './env';
import { getIdToken } from './auth';

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await getIdToken();
  const headers = new Headers(init.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  headers.set('Content-Type', 'application/json');
  const res = await fetch(`${env.HUB_BASE_URL}${path}`, { ...init, headers });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (data as any)?.error ?? { code: 'unknown', message: res.statusText };
    throw new ApiError(res.status, err.code, err.message);
  }
  return data as T;
}

// P0-16 — the destructive half of the write API. Each is owner-scoped on the
// backend (the JWT subject is the key/condition), so no id needs to be passed
// beyond the domain.

/** Hard-delete a claimed domain (pending or verified). */
export const deleteDomain = (domain: string) =>
  api(`/v1/orgs/me/domains/${encodeURIComponent(domain)}`, { method: 'DELETE' });

// base64url of an ASCII string (Pages keys are host + path, always ASCII).
function base64url(s: string): string {
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Hard-delete a GitHub Pages claim (P0-19). Its synthetic key
 * (`pages:<host>/<prefix>/`) contains slashes that can't survive the
 * `{domain}` path param — API Gateway decodes `%2F` and the route 404s with no
 * CORS headers ("Failed to fetch"). Send the key as a path-safe base64url
 * token instead; the backend decodes it.
 */
export const deletePagesClaim = (key: string) =>
  api(`/v1/orgs/me/domains/${base64url(key)}`, { method: 'DELETE' });

/** Clear the target repo config but keep the GitHub App installed. */
export const deleteRepoConfig = () =>
  api<{ status: string }>('/v1/orgs/me/integrations/github/repo', { method: 'DELETE' });

/** Disconnect GitHub: drop our integration row AND uninstall the App on GitHub. */
export const deleteIntegration = () =>
  api('/v1/orgs/me/integrations/github', { method: 'DELETE' });

/** Right-to-erasure: cascade-delete domains, integration, GitHub link + Cognito user. */
export const deleteAccount = () => api('/v1/orgs/me', { method: 'DELETE' });
