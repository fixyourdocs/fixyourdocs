import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { requireUser, getOrigin, HttpError } from '../../lib/auth';
import { wrapAuth } from '../../lib/wrap';
import { ok } from '../../lib/response';
import { ddb, tables } from '../../lib/db';
import { repoKey } from '../../lib/repos';

// DELETE /v1/orgs/me/repos/{owner}/{repo}. Authenticated. Owner-scoped
// conditional delete; a foreign or missing row 404s without leaking existence.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = wrapAuth(async (event) => {
  const user = requireUser(event);
  const owner = event.pathParameters?.owner ?? '';
  const repo = event.pathParameters?.repo ?? '';
  if (!owner || !repo) throw new HttpError(400, 'invalid_claim', 'Missing owner/repo');

  try {
    await ddb.send(
      new DeleteCommand({
        TableName: tables.repos,
        Key: { repo: repoKey(owner, repo) },
        ConditionExpression: 'userId = :sub',
        ExpressionAttributeValues: { ':sub': user.sub },
      }),
    );
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      throw new HttpError(404, 'not_found', 'Repository not claimed by you');
    }
    throw err;
  }

  return ok({ deleted: true }, getOrigin(event));
});
