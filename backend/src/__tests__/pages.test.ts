import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/db', () => ({
  ddb: { send: vi.fn() },
  tables: { reports: 'r', integrations: 'i', rateLimit: 'rl', domains: 'd' },
}));

import { ddb } from '../lib/db';
import {
  resolvePagesClaim,
  pagesCandidatePrefixes,
  pagesClaimKey,
  isPagesHost,
  isPagesKey,
} from '../lib/pages';
import { resolveIntegrationForReport } from '../lib/integrations';
import { handler as claimHandler } from '../handlers/orgs/claim-domain';
import { HttpError } from '../lib/auth';

const sendMock = ddb.send as unknown as ReturnType<typeof vi.fn>;

function claimError(input: string): string | null {
  try {
    resolvePagesClaim(input);
    return null;
  } catch (e) {
    return (e as HttpError).code;
  }
}

// ---------------------------------------------------------------------------
// Step 1 — resolve the publishing repo from a *.github.io URL.
// ---------------------------------------------------------------------------
describe('resolvePagesClaim (P0-19 Step 1)', () => {
  it('maps project Pages to <user>/<repo> with a /<repo>/ prefix', () => {
    expect(resolvePagesClaim('https://acme.github.io/widgets/guide')).toEqual({
      host: 'acme.github.io',
      repoOwner: 'acme',
      repoName: 'widgets',
      pathPrefix: '/widgets/',
    });
  });

  it('maps user/org Pages to <user>/<user>.github.io with a / prefix', () => {
    expect(resolvePagesClaim('https://acme.github.io/')).toEqual({
      host: 'acme.github.io',
      repoOwner: 'acme',
      repoName: 'acme.github.io',
      pathPrefix: '/',
    });
  });

  it('accepts a scheme-less host and an exact-root URL', () => {
    expect(resolvePagesClaim('acme.github.io')).toMatchObject({ pathPrefix: '/', repoName: 'acme.github.io' });
    expect(resolvePagesClaim('acme.github.io/widgets')).toMatchObject({ pathPrefix: '/widgets/' });
  });

  it('rejects the bare public suffix (no owner)', () => {
    expect(claimError('https://github.io/widgets/')).toBe('not_github_pages');
  });

  it('rejects a multi-label / CNAME-style host that maps to no single repo', () => {
    expect(claimError('https://docs.acme.github.io/')).toBe('not_github_pages');
  });

  it('rejects a non-github.io host', () => {
    expect(claimError('https://docs.acme.com/')).toBe('not_github_pages');
  });

  it('rejects an invalid repository segment', () => {
    expect(claimError('https://acme.github.io/has spaces/')).toBe('invalid_pages_url');
  });
});

describe('pagesCandidatePrefixes (longest-first)', () => {
  it('tries the project-Pages prefix before the user/org root', () => {
    expect(pagesCandidatePrefixes('/widgets/guide/intro')).toEqual(['/widgets/', '/']);
  });
  it('returns only the root for a path-less URL', () => {
    expect(pagesCandidatePrefixes('/')).toEqual(['/']);
  });
});

describe('Pages host/key guards', () => {
  it('isPagesHost is true for a real Pages host, false for the bare suffix', () => {
    expect(isPagesHost('acme.github.io')).toBe(true);
    expect(isPagesHost('github.io')).toBe(false);
    expect(isPagesHost('docs.acme.com')).toBe(false);
  });
  it('isPagesKey distinguishes synthetic claim keys from real domains', () => {
    expect(isPagesKey('pages:acme.github.io/widgets/')).toBe(true);
    expect(isPagesKey('acme.com')).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Step 3 — routing: longest claimed path-prefix wins, no cross-repo mis-route.
// ---------------------------------------------------------------------------
describe('resolveIntegrationForReport — GitHub Pages routing (P0-19 Step 3)', () => {
  const CONFIGURED = {
    userId: 'u1',
    installationId: 1,
    repoOwner: 'acme',
    repoName: 'widgets',
    issueTemplate: 't',
    status: 'configured',
  };

  beforeEach(() => sendMock.mockReset());

  // Route ddb.send by the key it asks for: Pages claim rows live under their
  // synthetic key; the integration is keyed by userId.
  function routeBy(rows: Record<string, unknown>, integration: unknown) {
    sendMock.mockImplementation((cmd: any) => {
      const key = cmd?.input?.Key ?? {};
      if (typeof key.domain === 'string') return Promise.resolve({ Item: rows[key.domain] });
      if (typeof key.userId === 'string') return Promise.resolve({ Item: integration });
      return Promise.resolve({});
    });
  }

  it('routes a project-Pages report to the claimed owner integration', async () => {
    routeBy(
      { [pagesClaimKey('acme.github.io', '/widgets/')]: { userId: 'u1', status: 'verified' } },
      CONFIGURED,
    );
    const integ = await resolveIntegrationForReport('https://acme.github.io/widgets/page');
    expect(integ).toEqual(CONFIGURED);
  });

  it('longest-prefix wins: /widgets/ beats a bare / claim', async () => {
    routeBy(
      {
        [pagesClaimKey('acme.github.io', '/widgets/')]: { userId: 'u1', status: 'verified' },
        [pagesClaimKey('acme.github.io', '/')]: { userId: 'other', status: 'verified' },
      },
      CONFIGURED,
    );
    const integ = await resolveIntegrationForReport('https://acme.github.io/widgets/page');
    expect(integ?.userId).toBe('u1');
  });

  it('does NOT mis-route a different repo path under the same <user>.github.io', async () => {
    // Only /widgets/ is claimed; a report under /other/ must not match it.
    routeBy(
      { [pagesClaimKey('acme.github.io', '/widgets/')]: { userId: 'u1', status: 'verified' } },
      CONFIGURED,
    );
    const integ = await resolveIntegrationForReport('https://acme.github.io/other/page');
    expect(integ).toBeNull();
  });

  it('returns null when the matched owner has no configured integration', async () => {
    routeBy(
      { [pagesClaimKey('acme.github.io', '/widgets/')]: { userId: 'u1', status: 'verified' } },
      { ...CONFIGURED, status: 'installed' },
    );
    expect(await resolveIntegrationForReport('https://acme.github.io/widgets/x')).toBeNull();
  });

  it('a custom domain still routes via DNS (candidateDomains), not the Pages path', async () => {
    sendMock.mockImplementation((cmd: any) => {
      const key = cmd?.input?.Key ?? {};
      if (key.domain === 'docs.acme.com') return Promise.resolve({ Item: { userId: 'u1', status: 'verified' } });
      if (key.domain) return Promise.resolve({}); // acme.com etc.
      if (key.userId) return Promise.resolve({ Item: CONFIGURED });
      return Promise.resolve({});
    });
    const integ = await resolveIntegrationForReport('https://docs.acme.com/guide');
    expect(integ).toEqual(CONFIGURED);
  });
});

// ---------------------------------------------------------------------------
// Step 2 — claim + verify endpoint (Pages branch of POST /v1/orgs/me/domains).
// ---------------------------------------------------------------------------
describe('POST /v1/orgs/me/domains — Pages claim (P0-19 Step 2)', () => {
  beforeEach(() => sendMock.mockReset());

  function authEvent(sub: string, domain: string): any {
    return {
      requestContext: {
        requestId: 't',
        http: { method: 'POST', path: '/x', sourceIp: '1.2.3.4' },
        authorizer: { jwt: { claims: { sub } } },
      },
      headers: {},
      body: JSON.stringify({ domain }),
    };
  }
  const call = (ev: unknown) => (claimHandler as any)(ev, {} as any, () => {});

  const CONFIGURED = { userId: 'u1', status: 'configured', repoOwner: 'acme', repoName: 'widgets' };

  it('verifies inline when the publishing repo matches the configured integration', async () => {
    sendMock
      .mockResolvedValueOnce({ Item: CONFIGURED }) // getIntegration
      .mockResolvedValueOnce({}); // PutCommand
    const res = await call(authEvent('u1', 'https://acme.github.io/widgets/'));
    expect(res.statusCode).toBe(201);
    const body = JSON.parse(res.body);
    expect(body).toMatchObject({ kind: 'pages', status: 'verified', repo: 'acme/widgets' });
    expect(body.pages_url).toBe('https://acme.github.io/widgets/');
    const put = sendMock.mock.calls[1][0].input;
    expect(put.Item.domain).toBe('pages:acme.github.io/widgets/');
    expect(put.Item.status).toBe('verified');
    expect(put.Item.kind).toBe('pages');
    expect(put.ConditionExpression).toContain('attribute_not_exists');
  });

  it('409 integration_required when the repo is not configured yet', async () => {
    sendMock.mockResolvedValueOnce({ Item: { userId: 'u1', status: 'installed' } });
    const res = await call(authEvent('u1', 'https://acme.github.io/widgets/'));
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe('integration_required');
  });

  it('403 repo_mismatch when the Pages site is published by a different repo', async () => {
    sendMock.mockResolvedValueOnce({ Item: { ...CONFIGURED, repoName: 'docs' } });
    const res = await call(authEvent('u1', 'https://acme.github.io/widgets/'));
    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body).error.code).toBe('repo_mismatch');
    // No write happened.
    expect(sendMock).toHaveBeenCalledTimes(1);
  });

  it('idempotent re-claim by the same owner returns 201, not a conflict', async () => {
    sendMock
      .mockResolvedValueOnce({ Item: CONFIGURED }) // getIntegration
      .mockRejectedValueOnce(Object.assign(new Error('cond'), { name: 'ConditionalCheckFailedException' }))
      .mockResolvedValueOnce({ Item: { domain: 'pages:acme.github.io/widgets/', userId: 'u1' } }); // getDomain
    const res = await call(authEvent('u1', 'https://acme.github.io/widgets/'));
    expect(res.statusCode).toBe(201);
    expect(JSON.parse(res.body).kind).toBe('pages');
  });

  it('409 pages_taken when another user already owns the prefix', async () => {
    sendMock
      .mockResolvedValueOnce({ Item: CONFIGURED })
      .mockRejectedValueOnce(Object.assign(new Error('cond'), { name: 'ConditionalCheckFailedException' }))
      .mockResolvedValueOnce({ Item: { domain: 'pages:acme.github.io/widgets/', userId: 'someone-else' } });
    const res = await call(authEvent('u1', 'https://acme.github.io/widgets/'));
    expect(res.statusCode).toBe(409);
    expect(JSON.parse(res.body).error.code).toBe('pages_taken');
  });
});
