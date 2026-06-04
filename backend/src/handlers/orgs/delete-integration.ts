import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { GetCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { requireUser, getOrigin, HttpError } from '../../lib/auth';
import { wrapAuth } from '../../lib/wrap';
import { ok } from '../../lib/response';
import { ddb, tables } from '../../lib/db';
import { deleteInstallation } from '../../lib/github-app';

// DELETE /v1/orgs/me/integrations/github (P0-16). Authenticated. Removes the
// whole integration row AND uninstalls the App on GitHub, so "Disconnect" is a
// true undo of the install — not just a local forget. If GitHub returns
// anything other than success/404 we log a warning but still delete our row:
// the user asked to disconnect, and a stale install is reconciled later by the
// installation.deleted webhook anyway.
export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = wrapAuth(async (event) => {
  const user = requireUser(event);

  const res = await ddb.send(
    new GetCommand({ TableName: tables.integrations, Key: { userId: user.sub } }),
  );
  if (!res.Item) throw new HttpError(404, 'no_integration', 'No GitHub integration to delete');

  const installationId = res.Item.installationId as number | undefined;
  if (installationId) {
    const removed = await deleteInstallation(installationId);
    if (!removed) console.warn('github_uninstall_failed', { sub: user.sub, installationId });
  }

  await ddb.send(new DeleteCommand({ TableName: tables.integrations, Key: { userId: user.sub } }));

  return ok({ deleted: true }, getOrigin(event));
});
