import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { requireUser, getOrigin, HttpError } from '../../lib/auth';
import { ddb, tables } from '../../lib/db';
import { nowIso } from '../../lib/ids';
import { integrationCreateSchema } from '../../lib/validation';
import { installationToken } from '../../lib/github-app';
import { renderIssue } from '../../lib/issue-template';
import { ok } from '../../lib/response';
import { wrapAuth } from '../../lib/wrap';

// POST /v1/orgs/me/integrations/github (P0-08 Step 5). Authenticated. Sets the
// target repo + Issue template for the caller's installation.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = wrapAuth(async (event) => {
  const user = requireUser(event);

  if (!event.body) throw new HttpError(400, 'invalid_body', 'Missing request body');
  let raw: unknown;
  try {
    raw = JSON.parse(event.body);
  } catch {
    throw new HttpError(400, 'invalid_json', 'Request body is not valid JSON');
  }
  const parsed = integrationCreateSchema.safeParse(raw);
  if (!parsed.success) {
    throw new HttpError(400, 'schema_violation', parsed.error.issues[0]?.message ?? 'Invalid body');
  }
  const { repo_owner, repo_name, issue_template } = parsed.data;

  // Trust the installationId stored at install time, not the request body — the
  // body's installation_id is advisory (don't let it re-point at another
  // installation).
  const existing = await ddb.send(
    new GetCommand({ TableName: tables.integrations, Key: { userId: user.sub } }),
  );
  const installationId = existing.Item?.installationId as number | undefined;
  if (!installationId) {
    throw new HttpError(409, 'no_installation', 'Install the GitHub App first');
  }

  // Reject a template with unknown placeholders before any GitHub call.
  renderIssue(issue_template, { summary: 'preview', details: 'preview', doc_url: 'https://example.com' });

  // Confirm the App can write this repo: a repo-scoped token mint fails if the
  // App was not granted access to it.
  try {
    await installationToken(installationId, repo_name);
  } catch {
    throw new HttpError(400, 'repo_not_in_installation', 'The GitHub App is not installed on that repository');
  }

  const ts = nowIso();
  await ddb.send(
    new UpdateCommand({
      TableName: tables.integrations,
      Key: { userId: user.sub },
      UpdateExpression: 'SET repoOwner = :o, repoName = :r, issueTemplate = :t, #s = :st, updatedAt = :u',
      ExpressionAttributeNames: { '#s': 'status' },
      ExpressionAttributeValues: {
        ':o': repo_owner,
        ':r': repo_name,
        ':t': issue_template,
        ':st': 'configured',
        ':u': ts,
      },
      ConditionExpression: 'attribute_exists(userId)',
    }),
  );

  return ok({ status: 'configured', repo: `${repo_owner}/${repo_name}` }, getOrigin(event));
});
