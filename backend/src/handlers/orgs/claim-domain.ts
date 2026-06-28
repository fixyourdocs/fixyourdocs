import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { requireUser, getOrigin, HttpError } from '../../lib/auth';
import { wrapAuth } from '../../lib/wrap';
import { created } from '../../lib/response';
import { ddb, tables } from '../../lib/db';
import { nowIso } from '../../lib/ids';
import { domainClaimSchema } from '../../lib/validation';
import {
  normalizeDomain, assertClaimable, getDomain, newChallengeToken, challengeRecord,
  type DomainRow,
} from '../../lib/domains';
import { getIntegration } from '../../lib/integrations';
import { resolvePagesClaim, pagesClaimKey, pagesUrl, type PagesClaim } from '../../lib/pages';

// POST /v1/orgs/me/domains (P0-08 Step 6; extended P0-19). Authenticated.
// Two claim shapes share this route (so no new API Gateway route is needed):
//   - a DNS domain  -> returns the DNS TXT challenge to publish, status pending;
//   - a *.github.io Pages URL -> verified inline against the caller's GitHub
//     integration (no DNS), status verified.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = wrapAuth(async (event) => {
  const user = requireUser(event);
  if (!event.body) throw new HttpError(400, 'invalid_body', 'Missing request body');

  let raw: unknown;
  try { raw = JSON.parse(event.body); } catch { throw new HttpError(400, 'invalid_json', 'Body is not JSON'); }
  const input = typeof (raw as { domain?: unknown })?.domain === 'string'
    ? (raw as { domain: string }).domain
    : '';

  // A github.io host means a Pages claim; everything else is a DNS claim.
  if (/(^|\/\/|\.)github\.io(\/|$|:)/i.test(input)) {
    return claimPages(user.sub, input, getOrigin(event));
  }

  const parsed = domainClaimSchema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, 'schema_violation', parsed.error.issues[0]?.message ?? 'Invalid body');

  const domain = normalizeDomain(parsed.data.domain);
  assertClaimable(domain); // (S19)

  // Optionally attach the domain to one of the caller's claimed repos so the
  // resolver routes this FQDN to it once verified. Both fields or neither.
  const { repo_owner, repo_name } = parsed.data;
  const attach = repo_owner && repo_name ? { repoOwner: repo_owner, repoName: repo_name } : {};

  const token = newChallengeToken();
  try {
    // (S22) conditional put serialises concurrent claims — one owner per domain.
    await ddb.send(new PutCommand({
      TableName: tables.domains,
      Item: { domain, userId: user.sub, status: 'pending', challengeToken: token, createdAt: nowIso(), ...attach },
      ConditionExpression: 'attribute_not_exists(#d)',
      ExpressionAttributeNames: { '#d': 'domain' },
    }));
  } catch (err) {
    if ((err as { name?: string }).name !== 'ConditionalCheckFailedException') throw err;
    const existing = await getDomain(domain);
    if (!existing || existing.userId !== user.sub) {
      throw new HttpError(409, 'domain_taken', 'This domain is already claimed'); // (A21)
    }
    // Idempotent re-claim by the same owner → return the stored challenge.
    return created(
      { domain, status: existing.status, dns_record: challengeRecord(domain, existing.challengeToken) },
      getOrigin(event),
    );
  }

  return created({ domain, status: 'pending', dns_record: challengeRecord(domain, token) }, getOrigin(event));
});

// (P0-19) Verify a GitHub Pages claim WITHOUT a DNS step or a new GitHub call.
// The caller must already have a `configured` integration whose repo the App
// was proved installed on (set-integration mints a repo-scoped token to prove
// it). A Pages claim is allowed only when the site's publishing repo equals
// that already-verified repo, so ownership is inherited, not re-checked. The
// cross-repo case (App on a different repo than the forward target) is a
// documented follow-up that needs the claim Lambda to call GitHub directly.
async function claimPages(userId: string, input: string, origin?: string) {
  const claim = resolvePagesClaim(input);

  const integration = await getIntegration(userId);
  if (!integration || integration.status !== 'configured') {
    throw new HttpError(
      409,
      'integration_required',
      'Install the GitHub App and configure your repo before claiming its GitHub Pages site',
    );
  }
  if (
    integration.repoOwner.toLowerCase() !== claim.repoOwner.toLowerCase() ||
    integration.repoName.toLowerCase() !== claim.repoName.toLowerCase()
  ) {
    throw new HttpError(
      403,
      'repo_mismatch',
      `This Pages site is published by ${claim.repoOwner}/${claim.repoName}; configure that repository in your GitHub integration before claiming its Pages site`,
    );
  }

  const key = pagesClaimKey(claim.host, claim.pathPrefix);
  const now = nowIso();
  const item: DomainRow & PagesClaim & { kind: 'pages' } = {
    domain: key,
    userId,
    status: 'verified',
    challengeToken: '', // unused for Pages; kept for the shared DomainRow shape
    createdAt: now,
    verifiedAt: now,
    kind: 'pages',
    host: claim.host,
    pathPrefix: claim.pathPrefix,
    repoOwner: claim.repoOwner,
    repoName: claim.repoName,
  };

  try {
    // One owner per path-prefix; the conditional put serialises concurrent claims.
    await ddb.send(new PutCommand({
      TableName: tables.domains,
      Item: item,
      ConditionExpression: 'attribute_not_exists(#d)',
      ExpressionAttributeNames: { '#d': 'domain' },
    }));
  } catch (err) {
    if ((err as { name?: string }).name !== 'ConditionalCheckFailedException') throw err;
    const existing = await getDomain(key);
    if (!existing || existing.userId !== userId) {
      throw new HttpError(409, 'pages_taken', 'This GitHub Pages path is already claimed');
    }
    // Idempotent re-claim by the same owner.
    return created(pagesView(claim), origin);
  }

  return created(pagesView(claim), origin);
}

function pagesView(c: PagesClaim) {
  return {
    kind: 'pages' as const,
    pages_url: pagesUrl(c.host, c.pathPrefix),
    repo: `${c.repoOwner}/${c.repoName}`,
    status: 'verified' as const,
  };
}
