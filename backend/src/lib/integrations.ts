import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables } from './db';
import { candidateDomains, getDomain } from './domains';

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
  let host: string;
  try {
    host = new URL(docUrl).hostname.toLowerCase(); // URL() already punycodes IDNs
  } catch {
    return null;
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
