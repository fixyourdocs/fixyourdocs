import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables } from './db';
import { candidateDomains, getDomain } from './domains';
import { isPagesHost, pagesCandidatePrefixes, pagesClaimKey } from './pages';

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

// THE routing policy (Option C). Parse the report's doc_url host, label-walk
// from most-specific to the registrable domain, and return the first VERIFIED
// domain's owner integration — but only if it's `configured`. No match → null
// → the forwarder posts nothing.
export async function resolveIntegrationForReport(docUrl: string): Promise<Integration | null> {
  let url: URL;
  try {
    url = new URL(docUrl); // URL() already punycodes IDNs
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();

  // (P0-19) GitHub Pages docs route by claimed path-prefix, not DNS domain —
  // github.io is a public suffix so it has no DNS-verified owner to fall back
  // to. DNS routing is untouched for every custom domain.
  if (isPagesHost(host)) {
    return resolvePagesIntegration(host, url.pathname);
  }

  for (const candidate of candidateDomains(host)) {
    const dom = await getDomain(candidate);
    if (dom?.status === 'verified') {
      const integration = await getIntegration(dom.userId);
      // The most-specific verified owner wins; if they haven't finished
      // configuring a repo, we stop here rather than routing to a parent owner.
      return integration && integration.status === 'configured' ? integration : null;
    }
  }
  return null;
}

// Longest claimed path-prefix wins, so a report under `/widgets/` routes to the
// `/widgets/` owner and never leaks to a different repo's Pages path under the
// same <user>.github.io. A claim only ever resolves to a `configured`
// integration whose repo the App was proved installed on (see claim-domain).
async function resolvePagesIntegration(host: string, pathname: string): Promise<Integration | null> {
  for (const prefix of pagesCandidatePrefixes(pathname)) {
    const row = await getDomain(pagesClaimKey(host, prefix));
    if (row?.status === 'verified') {
      const integration = await getIntegration(row.userId);
      return integration && integration.status === 'configured' ? integration : null;
    }
  }
  return null;
}
