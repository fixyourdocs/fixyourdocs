import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/db', () => ({
  ddb: { send: vi.fn() },
  tables: { reports: 'r', integrations: 'i', rateLimit: 'rl', domains: 'd', oauthState: 'os', githubLinks: 'gl' },
}));

import { ddb } from '../lib/db';
import { handler } from '../handlers/orgs/get-me';

const sendMock = ddb.send as unknown as ReturnType<typeof vi.fn>;

function authEvent(sub = 'user-1', email = 'a@b.com'): any {
  return {
    requestContext: {
      requestId: 't',
      http: { method: 'GET', path: '/v1/orgs/me', sourceIp: '1.2.3.4' },
      authorizer: { jwt: { claims: { sub, email } } },
    },
    headers: {},
  };
}
async function call(): Promise<any> {
  return (handler as any)(authEvent(), {} as any, () => {});
}

beforeEach(() => sendMock.mockReset());

describe('GET /v1/orgs/me', () => {
  it('returns sub/email + integration + domains (dns_record only for pending)', async () => {
    sendMock
      .mockResolvedValueOnce({
        Item: { userId: 'user-1', status: 'configured', installationId: 42, repoOwner: 'o', repoName: 'r', issueTemplate: '{summary}' },
      }) // integration Get
      .mockResolvedValueOnce({
        Items: [
          { domain: 'acme.io', userId: 'user-1', status: 'verified', challengeToken: 't1', createdAt: '2026-05-28T00:00:00Z', verifiedAt: '2026-05-28T01:00:00Z' },
          { domain: 'docs.example.com', userId: 'user-1', status: 'pending', challengeToken: 't2', createdAt: '2026-05-28T02:00:00Z' },
        ],
      }); // domains Query

    const res = await call();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.sub).toBe('user-1');
    expect(body.integration).toMatchObject({ status: 'configured', repoOwner: 'o', repoName: 'r', installationId: 42 });
    expect(body.domains).toHaveLength(2);
    const verified = body.domains.find((d: any) => d.domain === 'acme.io');
    const pending = body.domains.find((d: any) => d.domain === 'docs.example.com');
    expect(verified.status).toBe('verified');
    expect(verified.dns_record).toBeUndefined();
    expect(pending.dns_record).toEqual({
      name: '_fixyourdocs-challenge.docs.example.com',
      type: 'TXT',
      value: 'fyd-verify=t2',
    });
  });

  it('splits userId-index rows into domains / pages / repos by kind (P1-16)', async () => {
    sendMock
      .mockResolvedValueOnce({ Item: { userId: 'user-1', status: 'installed', installationId: 42 } })
      .mockResolvedValueOnce({
        Items: [
          { domain: 'acme.io', userId: 'user-1', status: 'verified', challengeToken: 't1', createdAt: '2026-06-01T00:00:00Z' },
          { domain: 'pages:acme.github.io/widgets/', userId: 'user-1', status: 'verified', kind: 'pages', host: 'acme.github.io', pathPrefix: '/widgets/', repoOwner: 'acme', repoName: 'widgets', createdAt: '2026-06-01T01:00:00Z' },
          { domain: 'repo:acme/widgets', userId: 'user-1', status: 'verified', kind: 'repo', repoOwner: 'Acme', repoName: 'Widgets', issueTemplate: '{summary}', createdAt: '2026-06-01T02:00:00Z' },
        ],
      });
    const body = JSON.parse((await call()).body);
    // The repo row must NOT leak into the domains list.
    expect(body.domains.map((d: any) => d.domain)).toEqual(['acme.io']);
    expect(body.pages).toHaveLength(1);
    expect(body.repos).toHaveLength(1);
    expect(body.repos[0]).toMatchObject({
      key: 'repo:acme/widgets',
      repo: 'Acme/Widgets',
      repo_url: 'https://github.com/Acme/Widgets',
      status: 'verified',
      issueTemplate: '{summary}',
    });
  });

  it('integration is null when none exists', async () => {
    sendMock.mockResolvedValueOnce({}).mockResolvedValueOnce({ Items: [] });
    const body = JSON.parse((await call()).body);
    expect(body.integration).toBeNull();
    expect(body.domains).toEqual([]);
  });

  it('stays up when the domains GSI query throws (resilient → empty list)', async () => {
    sendMock
      .mockResolvedValueOnce({ Item: { userId: 'user-1', status: 'installed', installationId: 7 } })
      .mockRejectedValueOnce(Object.assign(new Error('no index'), { name: 'ValidationException' }));
    const res = await call();
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body);
    expect(body.integration.status).toBe('installed');
    expect(body.domains).toEqual([]);
  });
});
