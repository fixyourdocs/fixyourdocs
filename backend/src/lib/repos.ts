// Repo-centric routing (P1-16). A report whose doc_url points at a GitHub
// *source* URL — the repository's own files, not a Pages site and not a custom
// domain — routes to the claim for that repository. This module parses such
// URLs into (owner, repo, path) and owns the synthetic storage key +
// delete-token helpers for repo claims, mirroring lib/pages.ts.
//
// Storage reuses the Domains table: a repo claim is a row keyed on a synthetic
// `repo:<owner>/<repo>` string (always lower-cased) that can never collide with
// a real domain (real hosts contain no `:` or `/`) nor with a Pages claim
// (`pages:`). The existing userId-index lists them and the existing DELETE route
// removes them (via the base64url token trick, because the key contains `/`).

// GitHub login + repo-name shapes (mirrors validation.ts / pages.ts so a parsed
// segment can't smuggle a path traversal or an over-long value into the key).
const OWNER_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38}[a-zA-Z0-9])?$/;
const REPO_RE = /^[a-zA-Z0-9._-]{1,100}$/;

// Source hosts we route in v0. github.com serves the blob/tree file views;
// raw.githubusercontent.com serves raw file bytes. Wikis, gists, and
// discussions are out of scope (different URL grammar, not "the repo").
const GITHUB_HOST = 'github.com';
const RAW_HOST = 'raw.githubusercontent.com';

// Only these github.com sub-routes name a file *inside* the repo. Anything else
// (/issues, /pull, /wiki, /releases, /actions, …) is not a doc and must not
// route — an allowlist is safer than blocklisting the ever-growing set of
// non-file routes.
const FILE_ROUTES = new Set(['blob', 'tree', 'raw']);

export const REPO_KEY_PREFIX = 'repo:';

export interface RepoRef {
  owner: string; // lower-cased
  repo: string; // lower-cased
  path: string; // repo-relative file path ('' for the repo root); informational
}

// True for a real GitHub source host we route. The path is validated separately
// by parseRepoUrl; this is only the host gate the resolver branches on.
export function isRepoSourceHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === GITHUB_HOST || h === RAW_HOST;
}

// True for a stored repo-claim key, so the domain handlers can branch away from
// DNS normalisation (which would mangle the synthetic key).
export function isRepoKey(key: string): boolean {
  return key.startsWith(REPO_KEY_PREFIX);
}

// Canonical (lower-cased) claim key. GitHub owner/repo are case-insensitive, so
// the key is lower-cased at BOTH claim time and resolve time — `Acme/Widgets`
// and `acme/widgets` are the same repo and must hit the same row.
export function repoClaimKey(owner: string, repo: string): string {
  return `${REPO_KEY_PREFIX}${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

// The repo-claim key contains `/` (and `:`), so — exactly like a Pages key — it
// can't ride in the single-segment {domain} path param of the shared DELETE
// route (API Gateway decodes %2F back to `/` and the path stops matching). The
// frontend sends the base64url of the key; this decodes it back. (The decode is
// generic base64url; lib/pages.decodePagesDeleteToken is the same operation.)
export function decodeRepoDeleteToken(token: string): string {
  return Buffer.from(token, 'base64url').toString('utf8');
}

// Parse a GitHub source URL into (owner, repo, path). Returns null for anything
// that isn't a routable repo-file URL: a non-GitHub host, a gist, a non-file
// sub-route (/issues, /pull, /wiki …), or a malformed owner/repo. Lower-cases
// owner/repo (GitHub is case-insensitive; the protocol §4.3 lower-cases the
// host but not the path). The `?plain=1` query is ignored and the `#Lnn`
// fragment never reaches url.pathname, so both fall out of the match for free.
export function parseRepoUrl(docUrl: string): RepoRef | null {
  let url: URL;
  try {
    url = new URL(docUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  const segments = url.pathname.split('/').filter(Boolean);

  if (host === GITHUB_HOST) {
    // github.com/<o>/<r>[/(blob|tree|raw)/<ref>/<path...>]
    if (segments.length < 2) return null;
    if (segments.length > 2 && !FILE_ROUTES.has(segments[2]!)) return null;
    // Everything after the <ref> (index 3) is the repo-relative path.
    const path = segments.length > 4 ? segments.slice(4).join('/') : '';
    return makeRef(segments[0]!, segments[1]!, path);
  }

  if (host === RAW_HOST) {
    // raw.githubusercontent.com/<o>/<r>/<ref>/<path...>
    if (segments.length < 2) return null;
    const path = segments.length > 3 ? segments.slice(3).join('/') : '';
    return makeRef(segments[0]!, segments[1]!, path);
  }

  return null;
}

function makeRef(owner: string, repo: string, path: string): RepoRef | null {
  if (!OWNER_RE.test(owner) || !REPO_RE.test(repo)) return null;
  return { owner: owner.toLowerCase(), repo: repo.toLowerCase(), path };
}

// Public-facing canonical URL for a stored repo claim (dashboard / API view).
export function repoUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}`;
}
