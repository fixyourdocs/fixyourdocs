import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/db', () => ({
  ddb: { send: vi.fn() },
  tables: { reports: 'r', integrations: 'i', rateLimit: 'rl', domains: 'd', oauthState: 'os', githubLinks: 'gl' },
}));

import { ddb } from '../lib/db';
import { handler } from '../handlers/orgs/delete-repo-config';

const sendMock = ddb.send as unknown as ReturnType<typeof vi.fn>;

function authEvent(sub = 'user-1'): any {
  return {
    requestContext: {
      requestId: 't',
      http: { method: 'DELETE', path: '/v1/orgs/me/integrations/github/repo', sourceIp: '1.2.3.4' },
      authorizer: { jwt: { claims: { sub, email: 'a@b.com' } } },
    },
    headers: {},
  };
}
async function call(): Promise<any> {
  return (handler as any)(authEvent(), {} as any, () => {});
}
const condFail = () => Object.assign(new Error('cond'), { name: 'ConditionalCheckFailedException' });

beforeEach(() => sendMock.mockReset());

describe('DELETE /v1/orgs/me/integrations/github/repo', () => {
  it('removes the repo fields, reverts status → installed, leaves the install', async () => {
    sendMock.mockResolvedValueOnce({});
    const res = await call();
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ status: 'installed' });
    const upd = sendMock.mock.calls[0][0].input;
    expect(upd.TableName).toBe('i');
    expect(upd.Key).toEqual({ userId: 'user-1' });
    expect(upd.UpdateExpression).toContain('REMOVE repoOwner, repoName, issueTemplate');
    expect(upd.ExpressionAttributeValues[':st']).toBe('installed');
    expect(upd.ConditionExpression).toBe('attribute_exists(userId)');
    // installationId is never referenced → the App stays installed.
    expect(JSON.stringify(upd)).not.toContain('installationId');
  });

  it('no integration row → 404 no_integration', async () => {
    sendMock.mockRejectedValueOnce(condFail());
    const res = await call();
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('no_integration');
  });
});
