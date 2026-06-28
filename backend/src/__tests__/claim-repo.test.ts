import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/db', () => ({
  ddb: { send: vi.fn() },
  tables: { reports: 'r', integrations: 'i', rateLimit: 'rl', domains: 'd', repos: 'repos' },
}));

vi.mock('../lib/github-app', () => ({
  installationToken: vi.fn(),
}));

import { ddb } from '../lib/db';
import { installationToken } from '../lib/github-app';
import { handler } from '../handlers/orgs/claim-repo';

const sendMock = ddb.send as unknown as ReturnType<typeof vi.fn>;
const tokenMock = installationToken as unknown as ReturnType<typeof vi.fn>;

function authEvent(body: unknown, sub = 'user-1'): any {
  return {
    requestContext: {
      requestId: 't', http: { method: 'POST', path: '/v1/orgs/me/repos', sourceIp: '1.2.3.4' },
      authorizer: { jwt: { claims: { sub, email: 'a@b.com' } } },
    },
    headers: {},
    body: JSON.stringify(body),
  };
}
const call = (ev: any) => (handler as any)(ev, {} as any, () => {});
const condFail = () => Object.assign(new Error('cond'), { name: 'ConditionalCheckFailedException' });
const integration = { Item: { userId: 'user-1', status: 'configured', installationId: 42 } };
const body = { repo_owner: 'Acme', repo_name: 'Widgets', issue_template: 'Report: {summary}' };

beforeEach(() => {
  sendMock.mockReset();
  tokenMock.mockReset().mockResolvedValue('ghs_test');
});

describe('POST /v1/orgs/me/repos', () => {
  it('claims a reachable repo → verified, stored lower-cased', async () => {
    sendMock
      .mockResolvedValueOnce(integration) // getIntegration
      .mockResolvedValueOnce({}); // PutCommand (no conflict)
    const res = await call(authEvent(body));
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body)).toEqual({
      repo: 'acme/widgets', repo_url: 'https://github.com/Acme/Widgets', status: 'verified',
    });
    const put = sendMock.mock.calls[1][0].input;
    expect(put.TableName).toBe('repos');
    expect(put.Item).toMatchObject({ repo: 'acme/widgets', userId: 'user-1', status: 'verified', repoOwner: 'Acme', repoName: 'Widgets' });
    expect(put.ConditionExpression).toBe('attribute_not_exists(#r)');
  });

  it('rejects when the App is not installed (mint fails) → 400', async () => {
    sendMock.mockResolvedValueOnce(integration);
    tokenMock.mockRejectedValueOnce(new Error('not installed'));
    const res = await call(authEvent(body));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('repo_not_in_installation');
  });

  it('409 when no installation exists', async () => {
    sendMock.mockResolvedValueOnce({}); // getIntegration → none
    const res = await call(authEvent(body));
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe('no_installation');
    expect(tokenMock).not.toHaveBeenCalled();
  });

  it('foreign re-claim → 409 repo_taken', async () => {
    sendMock
      .mockResolvedValueOnce(integration)
      .mockRejectedValueOnce(condFail()) // Put loses
      .mockResolvedValueOnce({ Item: { repo: 'acme/widgets', userId: 'someone-else' } }); // Get
    const res = await call(authEvent(body));
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe('repo_taken');
  });

  it('same-owner re-claim updates the template', async () => {
    sendMock
      .mockResolvedValueOnce(integration)
      .mockRejectedValueOnce(condFail()) // Put loses
      .mockResolvedValueOnce({ Item: { repo: 'acme/widgets', userId: 'user-1' } }) // Get → mine
      .mockResolvedValueOnce({}); // Update template
    const res = await call(authEvent(body));
    expect(res.statusCode).toBe(201);
    const upd = sendMock.mock.calls[3][0].input;
    expect(upd.UpdateExpression).toContain('issueTemplate = :t');
    expect(upd.ExpressionAttributeValues[':t']).toBe('Report: {summary}');
  });

  it('rejects a template with an unknown placeholder → 400 (no GitHub call)', async () => {
    sendMock.mockResolvedValueOnce(integration);
    const res = await call(authEvent({ ...body, issue_template: 'hi {nope}' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('bad_template');
    expect(tokenMock).not.toHaveBeenCalled();
  });

  it('rejects an invalid repo owner → 400 schema_violation', async () => {
    const res = await call(authEvent({ ...body, repo_owner: '-bad-' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('schema_violation');
  });
});
