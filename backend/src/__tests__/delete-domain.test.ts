import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/db', () => ({
  ddb: { send: vi.fn() },
  tables: { reports: 'r', integrations: 'i', rateLimit: 'rl', domains: 'd', oauthState: 'os', githubLinks: 'gl' },
}));

import { ddb } from '../lib/db';
import { handler } from '../handlers/orgs/delete-domain';

const sendMock = ddb.send as unknown as ReturnType<typeof vi.fn>;

function authEvent(domain: string, sub = 'user-1'): any {
  return {
    requestContext: {
      requestId: 't',
      http: { method: 'DELETE', path: '/v1/orgs/me/domains/x', sourceIp: '1.2.3.4' },
      authorizer: { jwt: { claims: { sub, email: 'a@b.com' } } },
    },
    headers: {},
    pathParameters: { domain },
  };
}
async function call(ev: any): Promise<any> {
  return (handler as any)(ev, {} as any, () => {});
}
const condFail = () => Object.assign(new Error('cond'), { name: 'ConditionalCheckFailedException' });

beforeEach(() => sendMock.mockReset());

describe('DELETE /v1/orgs/me/domains/{domain}', () => {
  it('owner deletes: 200 + conditional delete scoped to the caller sub', async () => {
    sendMock.mockResolvedValueOnce({});
    const res = await call(authEvent('acme.io'));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ deleted: true });
    const del = sendMock.mock.calls[0][0].input;
    expect(del.TableName).toBe('d');
    expect(del.Key).toEqual({ domain: 'acme.io' });
    expect(del.ConditionExpression).toBe('userId = :sub');
    expect(del.ExpressionAttributeValues).toEqual({ ':sub': 'user-1' });
  });

  it('normalizes the path param (casing) so it hits the stored canonical key', async () => {
    sendMock.mockResolvedValueOnce({});
    await call(authEvent('ACME.IO'));
    expect(sendMock.mock.calls[0][0].input.Key).toEqual({ domain: 'acme.io' });
  });

  it("non-owner → 404 (condition fails, doesn't leak existence)", async () => {
    sendMock.mockRejectedValueOnce(condFail());
    const res = await call(authEvent('acme.io', 'someone-else'));
    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body).error.code).toBe('not_found');
  });

  it('already gone → 404 (same condition path, idempotent-friendly)', async () => {
    sendMock.mockRejectedValueOnce(condFail());
    const res = await call(authEvent('gone.io'));
    expect(res.statusCode).toBe(404);
  });
});
