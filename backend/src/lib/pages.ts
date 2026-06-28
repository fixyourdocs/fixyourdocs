// GitHub Pages helpers. Pages routing is auto-derived from the repo claim at
// resolve time (see integrations.ts); this module only keeps the host/key
// guards + the public URL + the base64url delete-token for any dormant
// `pages:` rows from the earlier explicit-claim model.

const PAGES_SUFFIX = '.github.io';

export const PAGES_KEY_PREFIX = 'pages:';

// True for a real *.github.io Pages host (but not the bare public suffix).
export function isPagesHost(host: string): boolean {
  const h = host.toLowerCase();
  return h !== 'github.io' && h.endsWith(PAGES_SUFFIX);
}

// True for a stored `pages:` key, so the domain handlers can branch away from
// DNS normalisation (which would mangle the synthetic key).
export function isPagesKey(key: string): boolean {
  return key.startsWith(PAGES_KEY_PREFIX);
}

// The key contains `/`, so it rides the shared DELETE route as a base64url token.
export function decodePagesDeleteToken(token: string): string {
  return Buffer.from(token, 'base64url').toString('utf8');
}

// Public-facing URL of a stored claim (dashboard / API view).
export function pagesUrl(host: string, pathPrefix: string): string {
  return `https://${host}${pathPrefix}`;
}
