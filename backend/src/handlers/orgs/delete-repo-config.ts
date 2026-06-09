import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { requireUser, getOrigin, HttpError } from '../../lib/auth';
import { wrapAuth } from '../../lib/wrap';
import { ok } from '../../lib/response';
import { ddb, tables } from '../../lib/db';
import { nowIso } from '../../lib/ids';

// DELETE /v1/orgs/me/integrations/github/repo (P0-16). Authenticated. Clears the
// target repo config while keeping the GitHub App installed: drops
// repoOwner/repoName/issueTemplate and reverts status → 'installed'. The
// forwarder treats a row that is not 'configured' (and has no repoName) as
// not-routable (lib/integrations.ts resolveIntegrationForReport), so reports for
// this user defer cleanly with no forwarder change. The integration row is
// keyed by userId (== the JWT subject), so ownership is implicit.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = wrapAuth(async (event) => {
  const user = requireUser(event);

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: tables.integrations,
        Key: { userId: user.sub },
        UpdateExpression: 'REMOVE repoOwner, repoName, issueTemplate SET #s = :st, updatedAt = :u',
        ExpressionAttributeNames: { '#s': 'status' },
        ExpressionAttributeValues: { ':st': 'installed', ':u': nowIso() },
        ConditionExpression: 'attribute_exists(userId)',
      }),
    );
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      throw new HttpError(404, 'no_integration', 'No GitHub integration to update');
    }
    throw err;
  }

  return ok({ status: 'installed' }, getOrigin(event));
});
