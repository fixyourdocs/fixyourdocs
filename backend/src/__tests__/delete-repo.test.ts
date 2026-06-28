import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/db', () => ({
  ddb: { send: vi.fn() },
  tables: { reports: 'r', integrations: 'i', rateLimit: 'rl', domains: 'd', repos: 'repos' },
}));

import { ddb } from '../lib/db';
import { handler } from '../handlers/orgs/delete-repo';

const sendMock = ddb.send as unknown as ReturnType<typeof vi.fn>;

function authEvent(owner: string, repo: string, sub = 'user-1'): any {
  return {
    requestContext: {
      requestId: 't', http: { method: 'DELETE', path: '/v1/orgs/me/repos/x/y', sourceIp: '1.2.3.4' },
      authorizer: { jwt: { claims: { sub, email: 'a@b.com' } } },
    },
    headers: {},
    pathParameters: { owner, repo },
  };
}
const call = (ev: any) => (handler as any)(ev, {} as any, () => {});
const condFail = () => Object.assign(new Error('cond'), { name: 'ConditionalCheckFailedException' });

beforeEach(() => sendMock.mockReset());

describe('DELETE /v1/orgs/me/repos/{owner}/{repo}', () => {
  it('owner deletes: 200, conditional delete scoped to the caller, key lower-cased', async () => {
    sendMock.mockResolvedValueOnce({});
    const res = await call(authEvent('Acme', 'Widgets'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ deleted: true });
    const del = sendMock.mock.calls[0][0].input;
    expect(del.TableName).toBe('repos');
    expect(del.Key).toEqual({ repo: 'acme/widgets' });
    expect(del.ConditionExpression).toBe('userId = :sub');
    expect(del.ExpressionAttributeValues).toEqual({ ':sub': 'user-1' });
  });

  it('foreign/missing row → 404 (condition fails, no existence leak)', async () => {
    sendMock.mockRejectedValueOnce(condFail());
    const res = await call(authEvent('acme', 'widgets', 'someone-else'));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('not_found');
  });

  it('400 when owner or repo is missing', async () => {
    const res = await call(authEvent('', 'widgets'));
    expect(res.statusCode).toBe(400);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
