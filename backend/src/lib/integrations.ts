import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables } from './db';
import { candidateDomains, getDomain } from './domains';
import { isPagesHost } from './pages';
import { isRepoSourceHost, parseRepoUrl, repoKey } from './repos';

export interface Integration {
  userId: string;
  installationId: number;
  status: string; // 'installed' | 'revoked'
}

// What the forwarder needs to file an Issue: installation + repo + template.
export interface ResolvedTarget {
  userId: string;
  installationId: number;
  repoOwner: string;
  repoName: string;
  issueTemplate: string;
}

// A Repos-table row. repoOwner/repoName keep original case for the GitHub API;
// the `repo` key is lower-cased.
interface RepoClaimRow {
  repo: string;
  userId: string;
  status: string;
  repoOwner: string;
  repoName: string;
  issueTemplate: string;
}

// A verified domain points at a specific repo.
interface DomainRowWithRepo {
  userId: string;
  status: string;
  repoOwner?: string;
  repoName?: string;
}

export async function getIntegration(userId: string): Promise<Integration | null> {
  const res = await ddb.send(new GetCommand({ TableName: tables.integrations, Key: { userId } }));
  return (res.Item as Integration | undefined) ?? null;
}

async function getRepoClaim(owner: string, repo: string): Promise<RepoClaimRow | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: tables.repos, Key: { repo: repoKey(owner, repo) } }),
  );
  const row = res.Item as RepoClaimRow | undefined;
  return row && row.status === 'verified' ? row : null;
}

// The installationId lives on the owner's integration row; join it to the claim.
async function targetFromRepoClaim(claim: RepoClaimRow): Promise<ResolvedTarget | null> {
  const integration = await getIntegration(claim.userId);
  if (!integration?.installationId) return null;
  return {
    userId: claim.userId,
    installationId: integration.installationId,
    repoOwner: claim.repoOwner,
    repoName: claim.repoName,
    issueTemplate: claim.issueTemplate,
  };
}

// Resolve a doc_url to the repo it is about by one of three address types
// (repo-file URL, GitHub Pages URL, attached custom domain) → the same repo
// claim. No match → null → the forwarder posts nothing.
export async function resolveTargetForReport(docUrl: string): Promise<ResolvedTarget | null> {
  let url: URL;
  try {
    url = new URL(docUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();

  if (isRepoSourceHost(host)) {
    const ref = parseRepoUrl(docUrl);
    if (!ref) return null;
    const claim = await getRepoClaim(ref.owner, ref.repo);
    return claim ? targetFromRepoClaim(claim) : null;
  }

  if (isPagesHost(host)) {
    return resolvePagesTarget(host, url.pathname);
  }

  // Custom domains — most-specific verified owner wins; route via its attached repo.
  for (const candidate of candidateDomains(host)) {
    const dom = (await getDomain(candidate)) as DomainRowWithRepo | null;
    if (dom?.status === 'verified') {
      if (dom.repoOwner && dom.repoName) {
        const claim = await getRepoClaim(dom.repoOwner, dom.repoName);
        if (claim) return targetFromRepoClaim(claim);
      }
      return null;
    }
  }
  return null;
}

// Derive the publishing repo from a *.github.io URL and route via its repo claim.
async function resolvePagesTarget(host: string, pathname: string): Promise<ResolvedTarget | null> {
  const user = host.slice(0, -'.github.io'.length);
  // A single-label <user>.github.io maps to one repo; a CNAME'd sub-host doesn't.
  if (!user || user.includes('.')) return null;
  const segments = pathname.split('/').filter(Boolean);
  const candidates: Array<[string, string]> = [];
  if (segments.length >= 1) candidates.push([user, segments[0]!]); // project Pages
  candidates.push([user, `${user}.github.io`]); // user/org Pages
  for (const [owner, repo] of candidates) {
    const claim = await getRepoClaim(owner, repo);
    if (claim) return targetFromRepoClaim(claim);
  }
  return null;
}
