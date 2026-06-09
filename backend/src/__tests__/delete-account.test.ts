import { describe, it, expect, beforeEach, vi } from 'vitest';

const { cognitoSend } = vi.hoisted(() => ({ cognitoSend: vi.fn() }));

vi.mock('../lib/db', () => ({
  ddb: { send: vi.fn() },
  tables: { reports: 'r', integrations: 'i', rateLimit: 'rl', domains: 'd', oauthState: 'os', githubLinks: 'gl' },
}));
vi.mock('../lib/github-app', () => ({ deleteInstallation: vi.fn() }));
vi.mock('@aws-sdk/client-cognito-identity-provider', () => ({
  CognitoIdentityProviderClient: vi.fn(() => ({ send: cognitoSend })),
  AdminGetUserCommand: vi.fn((input) => ({ __cmd: 'AdminGetUser', input })),
  AdminDeleteUserCommand: vi.fn((input) => ({ __cmd: 'AdminDeleteUser', input })),
}));

import { ddb } from '../lib/db';
import { deleteInstallation } from '../lib/github-app';
import { handler } from '../handlers/orgs/delete-account';

const sendMock = ddb.send as unknown as ReturnType<typeof vi.fn>;
const uninstallMock = deleteInstallation as unknown as ReturnType<typeof vi.fn>;

function authEvent(sub = 'user-1'): any {
  return {
    requestContext: {
      requestId: 't',
      http: { method: 'DELETE', path: '/v1/orgs/me', sourceIp: '1.2.3.4' },
      authorizer: { jwt: { claims: { sub, email: 'a@b.com' } } },
    },
    headers: {},
  };
}
async function call(): Promise<any> {
  return (handler as any)(authEvent(), {} as any, () => {});
}
const userNotFound = () => Object.assign(new Error('gone'), { name: 'UserNotFoundException' });

beforeEach(() => {
  sendMock.mockReset();
  uninstallMock.mockReset().mockResolvedValue(true);
  cognitoSend.mockReset();
  process.env.COGNITO_USER_POOL_ID = 'pool-1';
});

describe('DELETE /v1/orgs/me (account cascade)', () => {
  it('deletes github-link + integration + domains + Cognito user; never touches reports', async () => {
    cognitoSend
      .mockResolvedValueOnce({ UserAttributes: [{ Name: 'custom:github_id', Value: 'gh-99' }] }) // AdminGetUser
      .mockResolvedValueOnce({}); // AdminDeleteUser
    sendMock
      .mockResolvedValueOnce({}) // githubLinks Delete
      .mockResolvedValueOnce({ Item: { userId: 'user-1', installationId: 4242 } }) // integrations Get
      .mockResolvedValueOnce({}) // integrations Delete
      .mockResolvedValueOnce({ Items: [{ domain: 'a.io' }, { domain: 'b.io' }] }) // domains Query
      .mockResolvedValueOnce({}); // domains BatchWrite

    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ deleted: true });

    // github-link dropped by githubId from the custom attribute.
    expect(sendMock.mock.calls[0][0].input).toMatchObject({ TableName: 'gl', Key: { githubId: 'gh-99' } });
    // App uninstalled with the stored installationId.
    expect(uninstallMock).toHaveBeenCalledWith(4242);
    // integration row deleted.
    expect(sendMock.mock.calls[2][0].input).toMatchObject({ TableName: 'i', Key: { userId: 'user-1' } });
    // domains batch-deleted.
    const batch = sendMock.mock.calls[4][0].input;
    expect(batch.RequestItems.d).toEqual([
      { DeleteRequest: { Key: { domain: 'a.io' } } },
      { DeleteRequest: { Key: { domain: 'b.io' } } },
    ]);
    // Cognito user deleted by sub.
    expect(cognitoSend.mock.calls[1][0]).toMatchObject({ __cmd: 'AdminDeleteUser', input: { Username: 'user-1' } });

    // D22: the reports table is never read or written by the cascade.
    const tablesTouched = sendMock.mock.calls.map((c) => c[0].input.TableName ?? Object.keys(c[0].input.RequestItems ?? {})[0]);
    expect(tablesTouched).not.toContain('r');
  });

  it('idempotent on retry: already-gone user/rows still converge to 200', async () => {
    cognitoSend
      .mockRejectedValueOnce(userNotFound()) // AdminGetUser — user already gone
      .mockRejectedValueOnce(userNotFound()); // AdminDeleteUser — already gone
    sendMock
      .mockResolvedValueOnce({ Item: undefined }) // integrations Get — gone
      .mockResolvedValueOnce({ Items: [] }); // domains Query — none

    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ deleted: true });
    // No github-link delete, no integration delete, no batch write.
    expect(uninstallMock).not.toHaveBeenCalled();
    expect(sendMock).toHaveBeenCalledTimes(2);
  });
});
