import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/db', () => ({
  ddb: { send: vi.fn() },
  tables: {
    reports: 'r',
    integrations: 'i',
    rateLimit: 'rl',
    oauthState: 'os',
    githubLinks: 'gl',
  },
}));

vi.mock('../lib/rate-limit', () => ({
  checkAndConsume: vi.fn().mockResolvedValue(true),
}));

vi.mock('../lib/github-app', () => ({
  exchangeInstallCode: vi.fn(),
  userControlsInstallation: vi.fn(),
  getInstallationAccountLogin: vi.fn(),
  installationToken: vi.fn(),
  createIssue: vi.fn(),
}));

import { ddb } from '../lib/db';
import { checkAndConsume } from '../lib/rate-limit';
import {
  exchangeInstallCode,
  userControlsInstallation,
  getInstallationAccountLogin,
  installationToken,
} from '../lib/github-app';
import { handler as installHandler } from '../handlers/integrations/install';
import { handler as callbackHandler } from '../handlers/integrations/callback';
import { handler as setIntegrationHandler } from '../handlers/orgs/set-integration';

const sendMock = ddb.send as unknown as ReturnType<typeof vi.fn>;
const rateMock = checkAndConsume as unknown as ReturnType<typeof vi.fn>;
const exchangeMock = exchangeInstallCode as unknown as ReturnType<typeof vi.fn>;
const ownsMock = userControlsInstallation as unknown as ReturnType<typeof vi.fn>;
const accountMock = getInstallationAccountLogin as unknown as ReturnType<typeof vi.fn>;
const tokenMock = installationToken as unknown as ReturnType<typeof vi.fn>;

interface ApiResult {
  statusCode: number;
  headers: Record<string, string>;
  body?: string;
}

function authEvent(claims: Record<string, unknown>, body?: unknown): any {
  return {
    requestContext: {
      requestId: 'test',
      http: { method: 'POST', path: '/x', sourceIp: '1.2.3.4' },
      authorizer: { jwt: { claims } },
    },
    headers: {},
    body: body === undefined ? undefined : JSON.stringify(body),
  };
}

function publicEvent(query?: Record<string, string>): any {
  return {
    requestContext: { requestId: 'test', http: { method: 'GET', path: '/x', sourceIp: '1.2.3.4' } },
    queryStringParameters: query,
  };
}

async function call(h: unknown, ev: unknown): Promise<ApiResult> {
  return (await (h as any)(ev, {} as any, () => {})) as ApiResult;
}

const future = () => Math.floor(Date.now() / 1000) + 600;

beforeEach(() => {
  sendMock.mockReset();
  rateMock.mockReset().mockResolvedValue(true);
  exchangeMock.mockReset();
  ownsMock.mockReset();
  accountMock.mockReset();
  tokenMock.mockReset();
  process.env.GITHUB_APP_SLUG = 'fixyourdocs';
  process.env.APP_BASE_URL = 'https://fixyourdocs.io';
});

describe('GET /v1/integrations/github/install', () => {
  it('returns 200 with the GitHub App install URL and persists install#<state> -> sub', async () => {
    sendMock.mockResolvedValueOnce({}); // PutCommand
    const res = await call(installHandler, authEvent({ sub: 'user-1' }));

    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body!) as { url: string };
    expect(body.url).toMatch(
      /^https:\/\/github\.com\/apps\/fixyourdocs\/installations\/new\?state=[0-9a-f]{64}$/,
    );
    const put = sendMock.mock.calls[0][0].input;
    expect(put.TableName).toBe('os');
    expect(put.Item.pk).toMatch(/^install#/);
    expect(put.Item.sub).toBe('user-1');
  });
});

describe('GET /v1/integrations/github/callback', () => {
  it('happy path: verifies ownership, writes the integration, redirects installed=1', async () => {
    sendMock.mockResolvedValueOnce({ Attributes: { sub: 'user-1', ttl: future() } }); // Delete
    exchangeMock.mockResolvedValueOnce('user-token');
    ownsMock.mockResolvedValueOnce(true);
    accountMock.mockResolvedValueOnce('octo-org');
    sendMock.mockResolvedValueOnce({}); // Put integration

    const res = await call(
      callbackHandler,
      publicEvent({ state: 'abc', code: 'c', installation_id: '4242' }),
    );

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(
      'https://fixyourdocs.io/integrations/github?installed=1&installation_id=4242',
    );
    const put = sendMock.mock.calls[1][0].input;
    expect(put.TableName).toBe('i');
    expect(put.Item.userId).toBe('user-1');
    expect(put.Item.installationId).toBe(4242);
    expect(put.Item.installAccountLogin).toBe('octo-org');
    expect(put.Item.status).toBe('installed');
  });

  it('rejects a forged installation_id the caller does not control (no row written)', async () => {
    sendMock.mockResolvedValueOnce({ Attributes: { sub: 'attacker', ttl: future() } }); // Delete
    exchangeMock.mockResolvedValueOnce('user-token');
    ownsMock.mockResolvedValueOnce(false); // not in the user's installations

    const res = await call(
      callbackHandler,
      publicEvent({ state: 'abc', code: 'c', installation_id: '9999' }),
    );

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe(
      'https://fixyourdocs.io/integrations/github?error=not_your_installation',
    );
    // Only the state Delete ran — no integration Put.
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('redirects state_mismatch when the state row is missing/expired', async () => {
    sendMock.mockResolvedValueOnce({ Attributes: undefined }); // Delete: no row
    const res = await call(
      callbackHandler,
      publicEvent({ state: 'gone', code: 'c', installation_id: '1' }),
    );
    expect(res.headers.location).toBe(
      'https://fixyourdocs.io/integrations/github?error=state_mismatch',
    );
    expect(exchangeMock).not.toHaveBeenCalled();
  });

  it('redirects invalid_request on missing params (no GitHub call, no ddb)', async () => {
    const res = await call(callbackHandler, publicEvent({ state: 'abc' }));
    expect(res.headers.location).toBe(
      'https://fixyourdocs.io/integrations/github?error=invalid_request',
    );
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('redirects rate_limited when the bucket is drained', async () => {
    rateMock.mockResolvedValueOnce(false);
    const res = await call(
      callbackHandler,
      publicEvent({ state: 'abc', code: 'c', installation_id: '1' }),
    );
    expect(res.headers.location).toBe(
      'https://fixyourdocs.io/integrations/github?error=rate_limited',
    );
    expect(sendMock).not.toHaveBeenCalled();
  });
});

describe('POST /v1/orgs/me/integrations/github', () => {
  const validBody = {
    installation_id: 4242,
    repo_owner: 'octo-org',
    repo_name: 'docs',
    issue_template: 'S: {summary}\n{details}\n{doc_url}',
  };

  it('configures the repo when the App can write it', async () => {
    sendMock.mockResolvedValueOnce({ Item: { installationId: 4242 } }); // Get
    tokenMock.mockResolvedValueOnce('inst-token'); // repo-scoped mint succeeds
    sendMock.mockResolvedValueOnce({}); // Update

    const res = await call(setIntegrationHandler, authEvent({ sub: 'user-1' }, validBody));

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body!)).toMatchObject({ status: 'configured', repo: 'octo-org/docs' });
    const upd = sendMock.mock.calls[1][0].input;
    expect(upd.ExpressionAttributeValues[':st']).toBe('configured');
    expect(tokenMock).toHaveBeenCalledWith(4242, 'docs');
  });

  it('409 when no installation exists yet', async () => {
    sendMock.mockResolvedValueOnce({ Item: undefined }); // Get
    const res = await call(setIntegrationHandler, authEvent({ sub: 'user-1' }, validBody));
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body!).error.code).toBe('no_installation');
  });

  it('400 repo_not_in_installation when the scoped token mint fails', async () => {
    sendMock.mockResolvedValueOnce({ Item: { installationId: 4242 } }); // Get
    tokenMock.mockRejectedValueOnce(new Error('422'));
    const res = await call(setIntegrationHandler, authEvent({ sub: 'user-1' }, validBody));
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body!).error.code).toBe('repo_not_in_installation');
  });

  it('400 bad_template on an unknown placeholder (before any GitHub call)', async () => {
    sendMock.mockResolvedValueOnce({ Item: { installationId: 4242 } }); // Get
    const res = await call(
      setIntegrationHandler,
      authEvent({ sub: 'user-1' }, { ...validBody, issue_template: 'hi {bogus}' }),
    );
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body!).error.code).toBe('bad_template');
    expect(tokenMock).not.toHaveBeenCalled();
  });
});
