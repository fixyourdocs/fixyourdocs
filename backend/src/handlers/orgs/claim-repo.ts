import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { requireUser, getOrigin, HttpError } from '../../lib/auth';
import { ddb, tables } from '../../lib/db';
import { nowIso } from '../../lib/ids';
import { repoClaimSchema } from '../../lib/validation';
import { getIntegration } from '../../lib/integrations';
import { installationToken } from '../../lib/github-app';
import { renderIssue } from '../../lib/issue-template';
import { repoKey, repoUrl } from '../../lib/repos';
import { created } from '../../lib/response';
import { wrapAuth } from '../../lib/wrap';

// POST /v1/orgs/me/repos. Authenticated. Claim a repo as a routing target with
// its own Issue template. Proof of control is the same repo-scoped token mint
// the integration setup uses — no new GitHub call. N claims per user; an
// idempotent re-claim by the owner updates the template.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = wrapAuth(async (event) => {
  const user = requireUser(event);
  if (!event.body) throw new HttpError(400, 'invalid_body', 'Missing request body');

  let raw: unknown;
  try { raw = JSON.parse(event.body); } catch { throw new HttpError(400, 'invalid_json', 'Body is not JSON'); }
  const parsed = repoClaimSchema.safeParse(raw);
  if (!parsed.success) throw new HttpError(400, 'schema_violation', parsed.error.issues[0]?.message ?? 'Invalid body');
  const { repo_owner, repo_name, issue_template } = parsed.data;

  const integration = await getIntegration(user.sub);
  if (!integration?.installationId) throw new HttpError(409, 'no_installation', 'Install the GitHub App first');

  // Reject a template with unknown placeholders before any GitHub call.
  renderIssue(issue_template, { summary: 'preview', details: 'preview', doc_url: 'https://example.com' });

  // Proof: the mint fails iff the App can't reach the repo.
  try {
    await installationToken(integration.installationId, repo_name);
  } catch {
    throw new HttpError(400, 'repo_not_in_installation', 'The GitHub App is not installed on that repository');
  }

  const key = repoKey(repo_owner, repo_name);
  const now = nowIso();
  try {
    await ddb.send(new PutCommand({
      TableName: tables.repos,
      Item: {
        repo: key, userId: user.sub, status: 'verified', createdAt: now, verifiedAt: now,
        repoOwner: repo_owner, repoName: repo_name, issueTemplate: issue_template,
      },
      ConditionExpression: 'attribute_not_exists(#r)',
      ExpressionAttributeNames: { '#r': 'repo' },
    }));
  } catch (err) {
    if ((err as { name?: string }).name !== 'ConditionalCheckFailedException') throw err;
    const existing = await ddb.send(new GetCommand({ TableName: tables.repos, Key: { repo: key } }));
    if (!existing.Item || existing.Item.userId !== user.sub) {
      throw new HttpError(409, 'repo_taken', 'This repository is already claimed');
    }
    // Idempotent re-claim by the owner → update the template.
    await ddb.send(new UpdateCommand({
      TableName: tables.repos,
      Key: { repo: key },
      UpdateExpression: 'SET issueTemplate = :t, updatedAt = :u',
      ExpressionAttributeValues: { ':t': issue_template, ':u': now },
    }));
  }

  return created({ repo: key, repo_url: repoUrl(repo_owner, repo_name), status: 'verified' }, getOrigin(event));
});
