// Turns a report's doc_url into a (owner, repo) ref. The URL grammar lives here
// — allowlisted sub-routes, case-folding, rejections — so the resolver stays
// simple. Owners/repos are lower-cased: GitHub treats them case-insensitively,
// but the claim key must be stable.

const OWNER_RE = /^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,38}[a-zA-Z0-9])?$/;
const REPO_RE = /^[a-zA-Z0-9._-]{1,100}$/;
const GITHUB_HOST = 'github.com';
const RAW_HOST = 'raw.githubusercontent.com';
// Sub-routes that name a file inside the repo; /issues, /pull, /wiki… don't route.
const FILE_ROUTES = new Set(['blob', 'tree', 'raw']);

export interface RepoRef {
  owner: string;
  repo: string;
  path: string;
}

export function isRepoSourceHost(host: string): boolean {
  const h = host.toLowerCase();
  return h === GITHUB_HOST || h === RAW_HOST;
}

// The Repos-table key. Lower-cased so a claim is case-stable.
export function repoKey(owner: string, repo: string): string {
  return `${owner.toLowerCase()}/${repo.toLowerCase()}`;
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
    if (segments.length < 2) return null;
    if (segments.length > 2 && !FILE_ROUTES.has(segments[2]!)) return null;
    const path = segments.length > 4 ? segments.slice(4).join('/') : '';
    return makeRef(segments[0]!, segments[1]!, path);
  }
  if (host === RAW_HOST) {
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
