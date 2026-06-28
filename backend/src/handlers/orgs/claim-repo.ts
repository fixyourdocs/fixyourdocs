import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { requireUser, getOrigin, HttpError } from '../../lib/auth';
import { wrapAuth } from '../../lib/wrap';
import { created } from '../../lib/response';
import { ddb, tables } from '../../lib/db';
import { nowIso } from '../../lib/ids';
import { repoClaimSchema } from '../../lib/validation';
import { installationToken } from '../../lib/github-app';
import { renderIssue } from '../../lib/issue-template';
import { getIntegration } from '../../lib/integrations';
import { repoKey, repoUrl } from '../../lib/repos';

// POST /v1/orgs/me/repos. Authenticated. Claim a repository (with its own Issue
// template), proven by a repo-scoped token mint exactly as set-integration does.
// N per user. Needs the GitHub-App SSM grant + Repos-table write on its Lambda.
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

  // installationId from the stored integration, never the body.
  const integration = await getIntegration(user.sub);
  if (!integration?.installationId) {
    throw new HttpError(409, 'no_installation', 'Install the GitHub App first');
  }

  // Reject a template with unknown placeholders before any GitHub call.
  renderIssue(issue_template, { summary: 'preview', details: 'preview', doc_url: 'https://example.com' });

  // Proof of control: the mint fails if the App can't reach the repo.
  try {
    await installationToken(integration.installationId, repo_name);
  } catch {
    throw new HttpError(400, 'repo_not_in_installation', 'The GitHub App is not installed on that repository');
  }

  const key = repoKey(repo_owner, repo_name);
  const now = nowIso();
  const item = {
    repo: key,
    userId: user.sub,
    status: 'verified',
    createdAt: now,
    verifiedAt: now,
    repoOwner: repo_owner, // original case for the GitHub API
    repoName: repo_name,
    issueTemplate: issue_template,
  };

  try {
    await ddb.send(new PutCommand({
      TableName: tables.repos,
      Item: item,
      ConditionExpression: 'attribute_not_exists(#r)',
      ExpressionAttributeNames: { '#r': 'repo' },
    }));
  } catch (err) {
    if ((err as { name?: string }).name !== 'ConditionalCheckFailedException') throw err;
    const existing = await ddb.send(new GetCommand({ TableName: tables.repos, Key: { repo: key } }));
    if (!existing.Item || existing.Item.userId !== user.sub) {
      throw new HttpError(409, 'repo_taken', 'This repository is already claimed');
    }
    // Same-owner re-claim: update the template (the dashboard edits through this call).
    await ddb.send(new UpdateCommand({
      TableName: tables.repos,
      Key: { repo: key },
      UpdateExpression: 'SET issueTemplate = :t, updatedAt = :u',
      ExpressionAttributeValues: { ':t': issue_template, ':u': now },
    }));
  }

  return created(
    { repo: `${repo_owner}/${repo_name}`, repo_url: repoUrl(repo_owner, repo_name), status: 'verified' },
    getOrigin(event),
  );
});
