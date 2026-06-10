// GitHub Pages doc claim (P0-19). A maintainer whose docs live on a
// `*.github.io` Pages site has no DNS zone to TXT-verify — `github.io` is a
// public suffix, so `assertClaimable` (domains.ts, S19) correctly refuses it.
// This module adds the parallel claim method: a Pages claim binds a
// (host, path-prefix) to the repo that PUBLISHES that site, and is verified by
// reusing the GitHub-App installation the maintainer already proved control of
// when they configured their integration (see set-integration's repo-scoped
// token mint). No DNS step, no new GitHub call from the claim path.
//
// Storage reuses the Domains table: a Pages claim is a row keyed on a synthetic
// `pages:<host><path-prefix>` string that can never collide with a real domain
// (real hosts contain no `:` or `/`). The existing userId-index lists them and
// the existing DELETE route removes them.

import { HttpError } from './auth';

// Hosts we treat as GitHub Pages. Kept as a list so other public-suffix Pages
// providers (pages.dev, …) can generalise here later (P0-19 out-of-scope now).
const PAGES_SUFFIX = '.github.io';

// GitHub login + repo name shapes (mirrors validation.ts so a claimed segment
// can't smuggle a path traversal or an over-long value into the routing key).
const OWNER_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38}[a-zA-Z0-9])?$/;
const REPO_RE = /^[a-zA-Z0-9._-]{1,100}$/;

export const PAGES_KEY_PREFIX = 'pages:';

export interface PagesClaim {
  host: string; // <user>.github.io (always lowercased)
  repoOwner: string; // <user>
  repoName: string; // <repo>, or <user>.github.io for a user/org site
  pathPrefix: string; // '/<repo>/' (project Pages) or '/' (user/org Pages)
}

// True for a real *.github.io Pages host (but not the bare public suffix).
export function isPagesHost(host: string): boolean {
  const h = host.toLowerCase();
  return h !== 'github.io' && h.endsWith(PAGES_SUFFIX);
}

// True for a stored Pages claim key (so the domain handlers can branch away
// from DNS normalisation, which would mangle the synthetic key).
export function isPagesKey(key: string): boolean {
  return key.startsWith(PAGES_KEY_PREFIX);
}

export function pagesClaimKey(host: string, pathPrefix: string): string {
  return `${PAGES_KEY_PREFIX}${host}${pathPrefix}`;
}

// A Pages claim key embeds the path-prefix, so it always contains `/` (and a
// `:`). That key can't ride in the single-segment `{domain}` path param of the
// DELETE route: API Gateway HTTP API decodes `%2F` back to `/` and the path no
// longer matches the route, 404ing at the gateway with no CORS headers — which
// the browser surfaces as "Failed to fetch". So the DELETE handle is the
// base64url of the key: a path-safe token (alphabet `A-Za-z0-9-_`, no `/`,
// `:`, `.` or `%`) the gateway passes through untouched. The frontend encodes;
// `decodePagesDeleteToken` is the backend end. Distinguishing a token from a
// DNS domain on the shared route is trivial — a domain always has a `.`, a
// base64url token never does.
export function decodePagesDeleteToken(token: string): string {
  return Buffer.from(token, 'base64url').toString('utf8');
}

// Map a user-supplied Pages URL (scheme optional) to the publishing repo and
// the canonical path-prefix being claimed. Throws HttpError(400) on anything
// that isn't a resolvable *.github.io URL.
//
//   https://acme.github.io/widgets/guide  -> acme/widgets       , prefix /widgets/
//   https://acme.github.io/               -> acme/acme.github.io , prefix /
//   https://github.io/...                 -> rejected (bare suffix, no owner)
//   https://docs.acme.github.io/...        -> rejected (multi-label, ambiguous)
export function resolvePagesClaim(input: string): PagesClaim {
  const raw = (input ?? '').trim();
  if (!raw || raw.length > 2048) {
    throw new HttpError(400, 'invalid_pages_url', 'Provide a valid GitHub Pages URL');
  }

  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    throw new HttpError(400, 'invalid_pages_url', 'Not a valid GitHub Pages URL');
  }

  const host = url.hostname.toLowerCase();
  if (!isPagesHost(host)) {
    throw new HttpError(400, 'not_github_pages', 'Expected a https://<user>.github.io/ URL');
  }

  const user = host.slice(0, -PAGES_SUFFIX.length);
  // A Pages site host is exactly one label before .github.io. A CNAME'd
  // sub-host (docs.user.github.io) doesn't map to a single publishing repo.
  if (!user || user.includes('.') || !OWNER_RE.test(user)) {
    throw new HttpError(400, 'not_github_pages', 'Expected a https://<user>.github.io/ URL');
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length === 0) {
    // User/org Pages: <user>.github.io is published by <user>/<user>.github.io.
    return { host, repoOwner: user, repoName: `${user}${PAGES_SUFFIX}`, pathPrefix: '/' };
  }

  // Project Pages: the first path segment is the repository name.
  const repo = segments[0];
  if (!REPO_RE.test(repo)) {
    throw new HttpError(400, 'invalid_pages_url', 'Invalid repository in the Pages path');
  }
  return { host, repoOwner: user, repoName: repo, pathPrefix: `/${repo}/` };
}

// Path-prefixes a report URL could match, longest (most specific) first, so a
// `/widgets/` claim beats a bare `/` claim. Bounded to at most two lookups:
// the project-Pages prefix and the user/org-Pages root.
export function pagesCandidatePrefixes(pathname: string): string[] {
  const segments = pathname.split('/').filter(Boolean);
  const out: string[] = [];
  if (segments.length >= 1) out.push(`/${segments[0]}/`);
  out.push('/');
  return out;
}

// Public-facing URL of a stored claim (for the dashboard / API view).
export function pagesUrl(host: string, pathPrefix: string): string {
  return `https://${host}${pathPrefix}`;
}
