import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { requireUser, getOrigin, HttpError } from '../../lib/auth';
import { wrapAuth } from '../../lib/wrap';
import { created } from '../../lib/response';
import { ddb, tables } from '../../lib/db';
import { nowIso } from '../../lib/ids';
import { repoClaimSchema } from '../../lib/validation';
import { installationToken } from '../../lib/github-app';
import { renderIssue } from '../../lib/issue-template';
import { getIntegration } from '../../lib/integrations';
import { getDomain } from '../../lib/domains';
import { repoClaimKey, repoUrl } from '../../lib/repos';

// POST /v1/orgs/me/repos (P1-16). Authenticated. Claim a repository as a routing
// anchor, with its own Issue template. The claim is PROVEN the same way
// set-integration proves a repo: a repo-scoped installation-token mint succeeds
// iff the GitHub App can reach the repo — no new GitHub call, the mint IS the
// proof. N claims per user (the existing userId-index lists them; the shared
// DELETE /v1/orgs/me/domains/{token} route removes them). Claiming a repo also
// lights up its GitHub Pages routing automatically (auto-derived at resolve
// time) and lets a verified custom domain be attached to it.
//
// This handler mints an installation token, so it MUST be deployed on a Lambda
// that holds the GitHub-App SSM grant + Domains-table write (the same grants the
// integrations handler group already has).
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = wrapAuth(async (event) => {
  const user = requireUser(event);

  if (!event.body) throw new HttpError(400, 'invalid_body', 'Missing request body');
  let raw: unknown;
  try {
    raw = JSON.parse(event.body);
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body is not valid JSON');
  }
  const parsed = repoClaimSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(400, 'schema_violation', parsed.error.issues[0]?.message ?? 'Invalid body');
  }
  const { repo_owner, repo_name, issue_template } = parsed.data;

  // The installationId comes from the stored integration, never the body — the
  // body can't re-point a claim at another user's installation.
  const integration = await getIntegration(user.sub);
  if (!integration?.installationId) {
    throw new HttpError(409, 'no_installation', 'Install the GitHub App first');
  }

  // Reject a template with unknown placeholders before any GitHub call.
  renderIssue(issue_template, { summary: 'preview', details: 'preview', doc_url: 'https://example.com' });

  // Proof of control: a repo-scoped token mint fails if the App can't reach it.
  // Mint with the supplied case (GitHub matches case-insensitively); the stored
  // key is lower-cased so routing is case-stable.
  try {
    await installationToken(integration.installationId, repo_name);
  } catch {
    throw new HttpError(400, 'repo_not_in_installation', 'The GitHub App is not installed on that repository');
  }

  const key = repoClaimKey(repo_owner, repo_name);
  const now = nowIso();
  const item = {
    domain: key, // synthetic PK in the shared Domains table
    userId: user.sub,
    status: 'verified',
    challengeToken: '', // unused for repo claims; kept for the shared row shape
    createdAt: now,
    verifiedAt: now,
    kind: 'repo',
    repoOwner: repo_owner, // original case for the GitHub API + display
    repoName: repo_name,
    issueTemplate: issue_template,
  };

  try {
    // One owner per repo; the conditional put serialises concurrent claims.
    await ddb.send(new PutCommand({
      TableName: tables.domains,
      Item: item,
      ConditionExpression: 'attribute_not_exists(#d)',
      ExpressionAttributeNames: { '#d': 'domain' },
    }));
  } catch (err) {
    if ((err as { name?: string }).name !== 'ConditionalCheckFailedException') throw err;
    const existing = await getDomain(key);
    if (!existing || existing.userId !== user.sub) {
      throw new HttpError(409, 'repo_taken', 'This repository is already claimed');
    }
    // Idempotent re-claim by the same owner — apply the template as a per-repo
    // override (the dashboard edits a claim's template through this same call).
    await ddb.send(new UpdateCommand({
      TableName: tables.domains,
      Key: { domain: key },
      UpdateExpression: 'SET issueTemplate = :t, updatedAt = :u',
      ExpressionAttributeValues: { ':t': issue_template, ':u': now },
    }));
  }

  return created(
    { kind: 'repo', repo: `${repo_owner}/${repo_name}`, repo_url: repoUrl(repo_owner, repo_name), status: 'verified' },
    getOrigin(event),
  );
});
