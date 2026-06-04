import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/db', () => ({
  ddb: { send: vi.fn() },
  tables: { reports: 'r', integrations: 'i', rateLimit: 'rl', domains: 'd', oauthState: 'os', githubLinks: 'gl' },
}));
vi.mock('../lib/github-app', () => ({ deleteInstallation: vi.fn() }));

import { ddb } from '../lib/db';
import { deleteInstallation } from '../lib/github-app';
import { handler } from '../handlers/orgs/delete-integration';

const sendMock = ddb.send as unknown as ReturnType<typeof vi.fn>;
const uninstallMock = deleteInstallation as unknown as ReturnType<typeof vi.fn>;

function authEvent(sub = 'user-1'): any {
  return {
    requestContext: {
      requestId: 't',
      http: { method: 'DELETE', path: '/v1/orgs/me/integrations/github', sourceIp: '1.2.3.4' },
      authorizer: { jwt: { claims: { sub, email: 'a@b.com' } } },
    },
    headers: {},
  };
}
async function call(): Promise<any> {
  return (handler as any)(authEvent(), {} as any, () => {});
}

beforeEach(() => {
  sendMock.mockReset();
  uninstallMock.mockReset().mockResolvedValue(true);
});

describe('DELETE /v1/orgs/me/integrations/github', () => {
  it('uninstalls on GitHub with the stored installationId, then deletes the row', async () => {
    sendMock.mockResolvedValueOnce({ Item: { userId: 'user-1', installationId: 4242 } }); // Get
    sendMock.mockResolvedValueOnce({}); // Delete
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ deleted: true });
    expect(uninstallMock).toHaveBeenCalledWith(4242);
    const del = sendMock.mock.calls[1][0].input;
    expect(del.TableName).toBe('i');
    expect(del.Key).toEqual({ userId: 'user-1' });
  });

  it('GitHub uninstall failure (404/other) still deletes our row', async () => {
    sendMock.mockResolvedValueOnce({ Item: { userId: 'user-1', installationId: 4242 } });
    uninstallMock.mockResolvedValueOnce(false); // GitHub hiccup
    sendMock.mockResolvedValueOnce({});
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(sendMock.mock.calls[1][0].input.Key).toEqual({ userId: 'user-1' });
  });

  it('no row → 404, no uninstall attempted', async () => {
    sendMock.mockResolvedValueOnce({ Item: undefined });
    const res = await call();
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('no_integration');
    expect(uninstallMock).not.toHaveBeenCalled();
  });
});
