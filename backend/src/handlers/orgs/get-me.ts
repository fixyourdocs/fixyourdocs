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
  key: string; // synthetic `repo:<o>/<r>` key (base64url it to Remove)
  repo: string;
  repo_url: string;
  status: string;
  issueTemplate?: string;
  createdAt?: string;
  verifiedAt?: string;
}

// Pages and repo claims share the Domains table with a synthetic
// key + a `kind` marker and extra repo fields. A row with no `kind` is a DNS
// domain.
interface ClaimRow extends DomainRow {
  kind?: string;
  host?: string;
  pathPrefix?: string;
  repoOwner?: string;
  repoName?: string;
  issueTemplate?: string;
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

  // Listing a user's domains uses the Domains userId-index. Stay resilient:
  // this endpoint also serves sign-in verification, so if that query ever
  // fails (e.g. the index isn't available yet) fall back to an empty list
  // rather than failing the whole response.
  let domains: DomainView[] = [];
  let pages: PagesView[] = [];
  let repos: RepoView[] = [];
  try {
    const res = await ddb.send(
      new QueryCommand({
        TableName: tables.domains,
        IndexName: 'userId-index',
        KeyConditionExpression: 'userId = :u',
        ExpressionAttributeValues: { ':u': user.sub },
      }),
    );
    const rows = (res.Items as ClaimRow[] | undefined) ?? [];
    const byCreated = (a: { createdAt?: string }, b: { createdAt?: string }) =>
      (a.createdAt ?? '').localeCompare(b.createdAt ?? '');

    domains = rows
      .filter((d) => !d.kind) // a DNS domain carries no kind marker
      .map((d) => ({
        domain: d.domain,
        status: d.status,
        createdAt: d.createdAt,
        verifiedAt: d.verifiedAt,
        dns_record: d.status === 'pending' ? challengeRecord(d.domain, d.challengeToken) : undefined,
      }))
      .sort(byCreated);

    pages = rows
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

    repos = rows
      .filter((d) => d.kind === 'repo')
      .map((d) => ({
        key: d.domain,
        repo: `${d.repoOwner ?? ''}/${d.repoName ?? ''}`,
        repo_url: repoUrl(d.repoOwner ?? '', d.repoName ?? ''),
        status: d.status,
        issueTemplate: d.issueTemplate,
        createdAt: d.createdAt,
        verifiedAt: d.verifiedAt,
      }))
      .sort(byCreated);
  } catch (err) {
    console.log('domains_list_unavailable', { sub: user.sub, err: (err as Error).name });
  }

  return ok({ sub: user.sub, email: user.email, integration, domains, pages, repos }, getOrigin(event));
});
