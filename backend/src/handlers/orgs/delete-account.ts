import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand, DeleteCommand, QueryCommand, BatchWriteCommand } from '@aws-sdk/lib-dynamodb';
import {
  CognitoIdentityProviderClient,
  AdminGetUserCommand,
  AdminDeleteUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { requireUser, getOrigin } from '../../lib/auth';
import { wrapAuth } from '../../lib/wrap';
import { ok } from '../../lib/response';
import { ddb, tables } from '../../lib/db';
import { deleteInstallation } from '../../lib/github-app';

const cognito = new CognitoIdentityProviderClient({});

// DELETE /v1/orgs/me (P0-16). Right-to-erasure cascade. Order matters: external
// / identity systems first, our own rows last, so a mid-step failure leaves a
// state a retried DELETE can converge from. Every sub-step tolerates "already
// gone".
//
// Admin Cognito APIs accept the user's `sub` as `Username` for an alias pool
// (the actual username is a UUID, distinct from the sub — see the github-links
// linking policy), so we never need to resolve username first.
//
// Reports are NOT touched (D22): they carry no userId — the owner is resolved
// at forward time from the doc_url domain — so they are anonymous, un-ownable,
// and exempt from erasure. rate-limit / oauth-state rows self-purge via TTL.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = wrapAuth(async (event) => {
  const user = requireUser(event);
  const userPoolId = process.env.COGNITO_USER_POOL_ID!;

  // 1. GitHub link — read custom:github_id off the Cognito user, then drop the
  //    reverse githubId → username index row (keyed by githubId). No GSI needed.
  let githubId: string | undefined;
  try {
    const u = await cognito.send(
      new AdminGetUserCommand({ UserPoolId: userPoolId, Username: user.sub }),
    );
    githubId = u.UserAttributes?.find((a) => a.Name === 'custom:github_id')?.Value;
  } catch (err) {
    if ((err as { name?: string }).name !== 'UserNotFoundException') throw err;
  }
  if (githubId) {
    await ddb.send(new DeleteCommand({ TableName: tables.githubLinks, Key: { githubId } }));
  }

  // 2. Integration — uninstall the App on GitHub (best-effort), then drop the row.
  const integ = await ddb.send(
    new GetCommand({ TableName: tables.integrations, Key: { userId: user.sub } }),
  );
  const installationId = integ.Item?.installationId as number | undefined;
  if (installationId) {
    const removed = await deleteInstallation(installationId);
    if (!removed) console.warn('github_uninstall_failed', { sub: user.sub, installationId });
  }
  if (integ.Item) {
    await ddb.send(new DeleteCommand({ TableName: tables.integrations, Key: { userId: user.sub } }));
  }

  // 3. Domains — list via the userId-index, hard-delete in chunks of 25.
  const domainsRes = await ddb.send(
    new QueryCommand({
      TableName: tables.domains,
      IndexName: 'userId-index',
      KeyConditionExpression: 'userId = :u',
      ExpressionAttributeValues: { ':u': user.sub },
      ProjectionExpression: '#d',
      ExpressionAttributeNames: { '#d': 'domain' },
    }),
  );
  const domains = ((domainsRes.Items as Array<{ domain: string }> | undefined) ?? []).map(
    (d) => d.domain,
  );
  for (let i = 0; i < domains.length; i += 25) {
    const chunk = domains.slice(i, i + 25);
    await ddb.send(
      new BatchWriteCommand({
        RequestItems: {
          [tables.domains]: chunk.map((domain) => ({ DeleteRequest: { Key: { domain } } })),
        },
      }),
    );
  }

  // 4. Cognito user — removes the identity. Existing access tokens stay valid
  //    until their exp (~1h); acceptable for v0. (No AdminUserGlobalSignOut —
  //    deleting the user supersedes it.)
  try {
    await cognito.send(new AdminDeleteUserCommand({ UserPoolId: userPoolId, Username: user.sub }));
  } catch (err) {
    if ((err as { name?: string }).name !== 'UserNotFoundException') throw err;
  }

  return ok({ deleted: true }, getOrigin(event));
});
