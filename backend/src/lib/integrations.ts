import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables } from './db';
import { candidateDomains, getDomain } from './domains';
import { isPagesHost, pagesCandidatePrefixes, pagesClaimKey } from './pages';
import { isRepoSourceHost, parseRepoUrl, repoClaimKey } from './repos';

export interface Integration {
  userId: string;
  installationId: number;
  // Legacy single-repo fields from the pre-repo-centric model. Kept for back-compat +
  // migration safety: the repo-centric model stores the repo + its template on a
  // dedicated claim row instead, so these are optional and only used as a fallback
  // until a user's existing claim is migrated.
  repoOwner?: string;
  repoName?: string;
  issueTemplate?: string;
  status: string; // 'installed' | 'configured' | 'revoked'
}

// What the forwarder needs to file an Issue: which installation, which repo,
// which template. Resolved from a repo claim (reached by a repo-file URL, an
// auto-derived Pages URL, or an attached FQDN) — or, until migration, from a
// legacy configured single-repo integration.
export interface ResolvedTarget {
  userId: string;
  installationId: number;
  repoOwner: string;
  repoName: string;
  issueTemplate: string;
}

// A repo claim: a Domains-table row under the synthetic `repo:<o>/<r>`
// key, carrying the per-repo Issue template. Marked `kind: 'repo'`. repoOwner /
// repoName keep their original case for the GitHub API; the key is lower-cased.
interface RepoClaimRow {
  domain: string;
  userId: string;
  status: string;
  repoOwner: string;
  repoName: string;
  issueTemplate: string;
}

// A verified domain row may now point at a specific repo. The
// fields are optional so a pre-migration row (no repo attached) still resolves
// via the legacy single-repo fallback.
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

// Fetch a verified repo claim by (owner, repo). Returns null unless the row
// exists and is verified.
async function getRepoClaim(owner: string, repo: string): Promise<RepoClaimRow | null> {
  const res = await ddb.send(
    new GetCommand({ TableName: tables.domains, Key: { domain: repoClaimKey(owner, repo) } }),
  );
  const row = res.Item as RepoClaimRow | undefined;
  return row && row.status === 'verified' ? row : null;
}

// A repo claim names the repo + template; the installationId lives on the
// owner's integration row. Join them into a forwarder target.
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

// Pre-migration fallback: a `configured` single-repo integration is itself a
// target. Null unless it carries a full repo + template.
function legacyTarget(integration: Integration | null): ResolvedTarget | null {
  if (!integration || integration.status !== 'configured') return null;
  if (!integration.repoOwner || !integration.repoName || !integration.issueTemplate) return null;
  return {
    userId: integration.userId,
    installationId: integration.installationId,
    repoOwner: integration.repoOwner,
    repoName: integration.repoName,
    issueTemplate: integration.issueTemplate,
  };
}

// THE routing policy. A report's doc_url resolves to the repo it is
// about by one of THREE address types, each landing on the SAME repo claim:
//   1. repo-file URL: github.com / raw.githubusercontent.com → parse
//      (owner, repo) → repo claim.
//   2. GitHub Pages URL: *.github.io → derive the publishing repo → its repo
//      claim (auto-derived; nothing stored). Legacy stored Pages claims
//      still resolve until migration drops them.
//   3. attached custom domain: most-specific verified domain → the repo it
//      points at; or, pre-migration, the owner's legacy single repo.
// No match → null → the forwarder posts nothing.
export async function resolveTargetForReport(docUrl: string): Promise<ResolvedTarget | null> {
  let url: URL;
  try {
    url = new URL(docUrl); // URL() already punycodes IDNs
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();

  // (1) Repo files. github.com is not a Pages host and is DNS-unclaimable, so
  // previously it dropped silently; now it routes via the repo claim.
  if (isRepoSourceHost(host)) {
    const ref = parseRepoUrl(docUrl);
    if (!ref) return null;
    const claim = await getRepoClaim(ref.owner, ref.repo);
    return claim ? targetFromRepoClaim(claim) : null;
  }

  // (2) GitHub Pages docs — derive the repo from the URL (GitHub-guaranteed 1:1
  // mapping), no separate Pages claim required.
  if (isPagesHost(host)) {
    return resolvePagesTarget(host, url.pathname);
  }

  // (3) Custom domains — most-specific verified owner wins.
  for (const candidate of candidateDomains(host)) {
    const dom = (await getDomain(candidate)) as DomainRowWithRepo | null;
    if (dom?.status === 'verified') {
      if (dom.repoOwner && dom.repoName) {
        const claim = await getRepoClaim(dom.repoOwner, dom.repoName);
        if (claim) return targetFromRepoClaim(claim);
      }
      // Pre-migration: the domain implicitly points at the owner's single repo.
      return legacyTarget(await getIntegration(dom.userId));
    }
  }
  return null;
}

// Derive the publishing repo from a *.github.io URL and route via its repo
// claim — <user>.github.io/<repo>/… → <user>/<repo>; <user>.github.io/… →
// <user>/<user>.github.io. Falls back to a legacy stored Pages claim
// (longest-prefix wins) so existing Pages claims keep routing until migration.
async function resolvePagesTarget(host: string, pathname: string): Promise<ResolvedTarget | null> {
  const user = host.slice(0, -'.github.io'.length);
  // Only a single-label <user>.github.io maps to one publishing repo; a CNAME'd
  // sub-host (docs.user.github.io) does not, so skip auto-derivation for it.
  if (user && !user.includes('.')) {
    const segments = pathname.split('/').filter(Boolean);
    const candidates: Array<[string, string]> = [];
    if (segments.length >= 1) candidates.push([user, segments[0]!]); // project Pages
    candidates.push([user, `${user}.github.io`]); // user/org Pages
    for (const [owner, repo] of candidates) {
      const claim = await getRepoClaim(owner, repo);
      if (claim) return targetFromRepoClaim(claim);
    }
  }

  // Legacy stored Pages claim.
  for (const prefix of pagesCandidatePrefixes(pathname)) {
    const row = await getDomain(pagesClaimKey(host, prefix));
    if (row?.status === 'verified') {
      return legacyTarget(await getIntegration(row.userId));
    }
  }
  return null;
}
