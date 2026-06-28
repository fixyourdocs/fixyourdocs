import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables } from './db';
import { candidateDomains, getDomain } from './domains';
import {
  isPagesHost, pagesCandidatePrefixes, pagesClaimKey, PAGES_SUFFIX,
} from './pages';
import { isRepoSourceHost, parseRepoUrl, repoKey } from './repos';

export interface Integration {
  userId: string;
  installationId: number;
  repoOwner: string;
  repoName: string;
  issueTemplate: string;
  status: string; // 'installed' | 'configured' | 'revoked'
}

export async function getIntegration(userId: string): Promise<Integration | null> {
  const res = await ddb.send(new GetCommand({ TableName: tables.integrations, Key: { userId } }));
  return (res.Item as Integration | undefined) ?? null;
}

// A claimed repo — the routing anchor. The resolver returns the matched repo as
// a ResolvedTarget; the forwarder files the Issue there with its own template.
export interface RepoClaim {
  repo: string; // owner/repo, lower-cased (the table key)
  userId: string;
  status: string;
  repoOwner: string;
  repoName: string;
  issueTemplate: string;
  createdAt?: string;
  verifiedAt?: string;
}

export interface ResolvedTarget {
  userId: string;
  installationId: number;
  repoOwner: string;
  repoName: string;
  issueTemplate: string;
}

// A repo claim row, only when verified.
export async function getRepoClaim(owner: string, repo: string): Promise<RepoClaim | null> {
  const res = await ddb.send(new GetCommand({ TableName: tables.repos, Key: { repo: repoKey(owner, repo) } }));
  const row = res.Item as RepoClaim | undefined;
  return row && row.status === 'verified' ? row : null;
}

// Join the owner's installationId (one App install per user today) onto a claim.
async function targetFromRepoClaim(claim: RepoClaim): Promise<ResolvedTarget | null> {
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

// Route a report's doc_url to the repo it's about, by one of three address
// types. Repo-file URLs and Pages URLs resolve to a repo claim; a custom domain
// resolves to its attached repo. A pre-migration fallback (the owner's single
// configured repo, and stored Pages claims) keeps routing working until the
// migration runs — that fallback is removed once the repo model is the only one.
export async function resolveTargetForReport(docUrl: string): Promise<ResolvedTarget | null> {
  let url: URL;
  try {
    url = new URL(docUrl);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();

  // 1. repo-file URL → repo claim
  if (isRepoSourceHost(host)) {
    const ref = parseRepoUrl(docUrl);
    if (!ref) return null;
    const claim = await getRepoClaim(ref.owner, ref.repo);
    return claim ? targetFromRepoClaim(claim) : null;
  }

  // 2. *.github.io → derive publishing repo → repo claim (auto-Pages, nothing stored)
  if (isPagesHost(host)) return resolvePagesTarget(host, url.pathname);

  // 3. custom domain → its attached repo; else (legacy) the owner's single repo
  for (const candidate of candidateDomains(host)) {
    const dom = await getDomain(candidate);
    if (dom?.status === 'verified') {
      if (dom.repoOwner && dom.repoName) {
        const claim = await getRepoClaim(dom.repoOwner, dom.repoName);
        if (claim) return targetFromRepoClaim(claim);
      }
      return legacyTarget(await getIntegration(dom.userId));
    }
  }
  return null;
}

// <o>.github.io/<r>/… → <o>/<r> (project Pages); <o>.github.io/… → <o>/<o>.github.io
// (user Pages). Routes via the repo claim; pre-migration, falls back to a stored
// Pages claim's configured integration.
async function resolvePagesTarget(host: string, pathname: string): Promise<ResolvedTarget | null> {
  const owner = host.slice(0, -PAGES_SUFFIX.length);
  const segments = pathname.split('/').filter(Boolean);
  const repo = segments.length > 0 ? segments[0]! : `${owner}${PAGES_SUFFIX}`;

  const claim = await getRepoClaim(owner, repo);
  if (claim) return targetFromRepoClaim(claim);

  for (const prefix of pagesCandidatePrefixes(pathname)) {
    const row = await getDomain(pagesClaimKey(host, prefix));
    if (row?.status === 'verified') return legacyTarget(await getIntegration(row.userId));
  }
  return null;
}

// Pre-migration fallback only (deleted when the legacy single-repo model is retired).
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
