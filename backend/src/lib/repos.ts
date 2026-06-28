// Parse GitHub source URLs (the repo's own files) into (owner, repo, path) and
// own the synthetic `repo:<owner>/<repo>` claim key. Mirrors lib/pages.ts; the
// key reuses the Domains table and can't collide with a real domain or a Pages
// claim.

const OWNER_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38}[a-zA-Z0-9])?$/;
const REPO_RE = /^[a-zA-Z0-9._-]{1,100}$/;

const GITHUB_HOST = 'github.com';
const RAW_HOST = 'raw.githubusercontent.com';

// Sub-routes that name a file inside the repo (allowlist; /issues, /pull, /wiki… don't route).
const FILE_ROUTES = new Set(['blob', 'tree', 'raw']);

export const REPO_KEY_PREFIX = 'repo:';

export interface RepoRef {
  owner: string; // lower-cased
  repo: string; // lower-cased
  path: string; // repo-relative path ('' for repo root); informational
}

export function isRepoSourceHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === GITHUB_HOST || h === RAW_HOST;
}

export function isRepoKey(key: string): boolean {
  return key.startsWith(REPO_KEY_PREFIX);
}

// Lower-cased so a claim is case-stable (GitHub owner/repo are case-insensitive).
export function repoClaimKey(owner: string, repo: string): string {
  return `${REPO_KEY_PREFIX}${owner.toLowerCase()}/${repo.toLowerCase()}`;
}

// The key contains `/`, so it rides the shared DELETE route as a base64url token.
export function decodeRepoDeleteToken(token: string): string {
  return Buffer.from(token, 'base64url').toString('utf8');
}

// null for anything that isn't a routable repo-file URL. `?plain=1`/`#Lnn` fall
// out for free (query ignored; fragment never reaches url.pathname).
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

export function repoUrl(owner: string, repo: string): string {
  return `https://github.com/${owner}/${repo}`;
}
