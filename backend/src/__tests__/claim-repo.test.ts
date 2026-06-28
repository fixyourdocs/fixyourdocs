import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/db', () => ({
  ddb: { send: vi.fn() },
  tables: { reports: 'r', integrations: 'i', rateLimit: 'rl', domains: 'd' },
}));

vi.mock('../lib/github-app', () => ({
  installationToken: vi.fn(),
}));

import { ddb } from '../lib/db';
import { installationToken } from '../lib/github-app';
import { handler } from '../handlers/orgs/claim-repo';

const sendMock = ddb.send as unknown as ReturnType<typeof vi.fn>;
const tokenMock = installationToken as unknown as ReturnType<typeof vi.fn>;

function authEvent(sub: string, body: Record<string, unknown>): any {
  return {
    requestContext: {
      requestId: 't',
      http: { method: 'POST', path: '/v1/orgs/me/repos', sourceIp: '1.2.3.4' },
      authorizer: { jwt: { claims: { sub } } },
    },
    headers: {},
    body: JSON.stringify(body),
  };
}
const call = (ev: unknown) => (handler as any)(ev, {} as any, () => {});

const VALID = { repo_owner: 'Acme', repo_name: 'Widgets', issue_template: '{summary}\n\n{details}' };
const installed = { userId: 'u1', installationId: 42, status: 'configured' };

beforeEach(() => {
  sendMock.mockReset();
  tokenMock.mockReset().mockResolvedValue('ghs_test');
});

describe('POST /v1/orgs/me/repos — claim a repo (P1-16)', () => {
  it('claims a reachable repo and stores a lower-cased repo: key with its template', async () => {
    sendMock
      .mockResolvedValueOnce({ Item: installed }) // getIntegration
      .mockResolvedValueOnce({}); // PutCommand
    const res = await call(authEvent('u1', VALID));
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body).toMatchObject({ kind: 'repo', repo: 'Acme/Widgets', status: 'verified' });
    expect(body.repo_url).toBe('https://github.com/Acme/Widgets');

    expect(tokenMock).toHaveBeenCalledWith(42, 'Widgets');
    const put = sendMock.mock.calls[1][0].input;
    expect(put.Item.domain).toBe('repo:acme/widgets');
    expect(put.Item.kind).toBe('repo');
    expect(put.Item.repoOwner).toBe('Acme');
    expect(put.Item.issueTemplate).toBe('{summary}\n\n{details}');
    expect(put.ConditionExpression).toContain('attribute_not_exists');
  });

  it('409 no_installation when the App is not installed', async () => {
    sendMock.mockResolvedValueOnce({ Item: undefined }); // getIntegration → none
    const res = await call(authEvent('u1', VALID));
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe('no_installation');
    expect(tokenMock).not.toHaveBeenCalled();
  });

  it('400 repo_not_in_installation when the token mint fails', async () => {
    sendMock.mockResolvedValueOnce({ Item: installed });
    tokenMock.mockRejectedValueOnce(new Error('not installed on repo'));
    const res = await call(authEvent('u1', VALID));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('repo_not_in_installation');
    expect(sendMock).toHaveBeenCalledTimes(1); // no write happened
  });

  it('400 bad_template before any GitHub call when the template has an unknown placeholder', async () => {
    sendMock.mockResolvedValueOnce({ Item: installed });
    const res = await call(authEvent('u1', { ...VALID, issue_template: 'hi {bogus}' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('bad_template');
    expect(tokenMock).not.toHaveBeenCalled();
  });

  it('idempotent re-claim by the same owner overrides the template (201)', async () => {
    sendMock
      .mockResolvedValueOnce({ Item: installed }) // getIntegration
      .mockRejectedValueOnce(Object.assign(new Error('cond'), { name: 'ConditionalCheckFailedException' })) // Put
      .mockResolvedValueOnce({ Item: { domain: 'repo:acme/widgets', userId: 'u1' } }) // getDomain
      .mockResolvedValueOnce({}); // UpdateCommand (template override)
    const res = await call(authEvent('u1', VALID));
    expect(res.statusCode).toBe(201);
    const update = sendMock.mock.calls[3][0].input;
    expect(update.UpdateExpression).toContain('issueTemplate');
  });

  it('409 repo_taken when another user already claimed it', async () => {
    sendMock
      .mockResolvedValueOnce({ Item: installed })
      .mockRejectedValueOnce(Object.assign(new Error('cond'), { name: 'ConditionalCheckFailedException' }))
      .mockResolvedValueOnce({ Item: { domain: 'repo:acme/widgets', userId: 'someone-else' } });
    const res = await call(authEvent('u1', VALID));
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe('repo_taken');
  });

  it('400 schema_violation on an invalid repo owner', async () => {
    sendMock.mockResolvedValue({ Item: installed });
    const res = await call(authEvent('u1', { ...VALID, repo_owner: 'bad owner!' }));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error.code).toBe('schema_violation');
  });
});
