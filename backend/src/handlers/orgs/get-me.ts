import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { requireUser, getOrigin } from '../../lib/auth';
import { ok } from '../../lib/response';
import { wrapAuth } from '../../lib/wrap';
import { ddb, tables } from '../../lib/db';
import { challengeRecord, type DomainRow } from '../../lib/domains';
import { pagesUrl } from '../../lib/pages';
import { repoUrl } from '../../lib/repos';

// P0-08 Step 4a/6 — the SPA's settings snapshot. Returns the JWT subject +
// email (sign-in verification target), the caller's GitHub integration (so the
// UI knows whether the App is installed/configured and can prefill the repo
// form), and the domains they've claimed (with the DNS challenge for any still
// pending verification).

interface IntegrationView {
  status: string;
  installationId?: number;
  installAccountLogin?: string;
  repoOwner?: string;
  repoName?: string;
  issueTemplate?: string;
}

interface DomainView {
  domain: string;
  status: string;
  createdAt?: string;
  verifiedAt?: string;
  dns_record?: ReturnType<typeof challengeRecord>;
}

interface PagesView {
  key: string; // synthetic claim key (used to Remove via the DELETE route)
  pages_url: string;
  repo: string;
  status: string;
  createdAt?: string;
  verifiedAt?: string;
}

interface RepoView {
  repo: string; // '<owner>/<repo>' — also the delete path
  repo_url: string;
  status: string;
  issueTemplate?: string;
  createdAt?: string;
  verifiedAt?: string;
}

// Pages claims share the Domains table via a `kind` marker; a row with no `kind`
// is a DNS domain. Repo claims live in their own Repos table.
interface ClaimRow extends DomainRow {
  kind?: string;
  host?: string;
  pathPrefix?: string;
  repoOwner?: string;
  repoName?: string;
}

interface RepoRow {
  repo: string;
  status: string;
  repoOwner?: string;
  repoName?: string;
  issueTemplate?: string;
  createdAt?: string;
  verifiedAt?: string;
}

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = wrapAuth(async (event) => {
  const user = requireUser(event);

  const integrationRes = await ddb.send(
    new GetCommand({ TableName: tables.integrations, Key: { userId: user.sub } }),
  );
  const i = integrationRes.Item;
  const integration: IntegrationView | null = i
    ? {
        status: (i.status as string) ?? 'installed',
        installationId: i.installationId as number | undefined,
        installAccountLogin: i.installAccountLogin as string | undefined,
        repoOwner: i.repoOwner as string | undefined,
        repoName: i.repoName as string | undefined,
        issueTemplate: i.issueTemplate as string | undefined,
      }
    : null;

  // List the user's claims via the Domains + Repos userId-indexes (in parallel).
  // Stay resilient: this endpoint also serves sign-in verification, so on any
  // query failure fall back to empty lists rather than failing the response.
  let domains: DomainView[] = [];
  let pages: PagesView[] = [];
  let repos: RepoView[] = [];
  const listByUser = (table: string) =>
    ddb.send(new QueryCommand({
      TableName: table,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :u',
      ExpressionAttributeValues: { ':u': user.sub },
    }));
  try {
    const [domRes, repoRes] = await Promise.all([listByUser(tables.domains), listByUser(tables.repos)]);
    const domRows = (domRes.Items as ClaimRow[] | undefined) ?? [];
    const repoRows = (repoRes.Items as RepoRow[] | undefined) ?? [];
    const byCreated = (a: { createdAt?: string }, b: { createdAt?: string }) =>
      (a.createdAt ?? '').localeCompare(b.createdAt ?? '');

    domains = domRows
      .filter((d) => !d.kind) // a DNS domain carries no kind marker
      .map((d) => ({
        domain: d.domain,
        status: d.status,
        createdAt: d.createdAt,
        verifiedAt: d.verifiedAt,
        dns_record: d.status === 'pending' ? challengeRecord(d.domain, d.challengeToken) : undefined,
      }))
      .sort(byCreated);

    pages = domRows
      .filter((d) => d.kind === 'pages')
      .map((d) => ({
        key: d.domain,
        pages_url: pagesUrl(d.host ?? '', d.pathPrefix ?? '/'),
        repo: `${d.repoOwner ?? ''}/${d.repoName ?? ''}`,
        status: d.status,
        createdAt: d.createdAt,
        verifiedAt: d.verifiedAt,
      }))
      .sort(byCreated);

    repos = repoRows
      .map((r) => ({
        repo: `${r.repoOwner ?? ''}/${r.repoName ?? ''}`,
        repo_url: repoUrl(r.repoOwner ?? '', r.repoName ?? ''),
        status: r.status,
        issueTemplate: r.issueTemplate,
        createdAt: r.createdAt,
        verifiedAt: r.verifiedAt,
      }))
      .sort(byCreated);
  } catch (err) {
    console.log('claims_list_unavailable', { sub: user.sub, err: (err as Error).name });
  }

  return ok({ sub: user.sub, email: user.email, integration, domains, pages, repos }, getOrigin(event));
});
