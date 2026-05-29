import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/db', () => ({
  ddb: { send: vi.fn() },
  tables: { reports: 'r', integrations: 'i', rateLimit: 'rl', domains: 'd' },
}));

vi.mock('node:dns/promises', () => ({
  resolveTxt: vi.fn(),
}));

import { resolveTxt } from 'node:dns/promises';
import {
  normalizeDomain,
  assertClaimable,
  candidateDomains,
  verifyTxt,
  challengeRecord,
  CHALLENGE_LABEL,
} from '../lib/domains';
import { HttpError } from '../lib/auth';

const resolveTxtMock = resolveTxt as unknown as ReturnType<typeof vi.fn>;

function claimErrorCode(domain: string): string | null {
  try {
    assertClaimable(domain);
    return null;
  } catch (e) {
    return (e as HttpError).code;
  }
}

describe('normalizeDomain', () => {
  it('lowercases, trims, and strips a trailing dot', () => {
    expect(normalizeDomain('  STRIPE.com. ')).toBe('stripe.com');
  });

  it('punycodes IDN labels and is idempotent', () => {
    const out = normalizeDomain('münchen.de');
    expect(out).toMatch(/^xn--[a-z0-9-]+\.de$/);
    expect(normalizeDomain(out)).toBe(out);
  });

  it('rejects a bare label with no dot', () => {
    expect(() => normalizeDomain('localhost')).toThrow(HttpError);
  });
});

describe('assertClaimable (S19)', () => {
  it('throws public_suffix on a bare TLD', () => {
    expect(claimErrorCode('com')).toBe('public_suffix');
  });

  it('throws public_suffix on a PRIVATE PSL suffix (github.io, pages.dev)', () => {
    expect(claimErrorCode('github.io')).toBe('public_suffix');
    expect(claimErrorCode('pages.dev')).toBe('public_suffix');
  });

  it('accepts a registrable domain and a subdomain of a private suffix', () => {
    expect(claimErrorCode('acme.io')).toBeNull();
    expect(claimErrorCode('user.github.io')).toBeNull();
  });
});

describe('candidateDomains (A19)', () => {
  it('walks most-specific down to the registrable domain', () => {
    expect(candidateDomains('docs.api.acme.io')).toEqual([
      'docs.api.acme.io',
      'api.acme.io',
      'acme.io',
    ]);
  });

  it('stops at a private-suffix boundary — never queries github.io', () => {
    expect(candidateDomains('docs.user.github.io')).toEqual([
      'docs.user.github.io',
      'user.github.io',
    ]);
  });

  it('returns [] for a bare public suffix', () => {
    expect(candidateDomains('com')).toEqual([]);
  });
});

describe('verifyTxt (S24)', () => {
  beforeEach(() => {
    resolveTxtMock.mockReset();
  });

  it('queries only the fixed challenge label and matches an exact token', async () => {
    resolveTxtMock.mockResolvedValueOnce([['fyd-verify=TESTTOKEN']]);
    await expect(verifyTxt('acme.io', 'TESTTOKEN')).resolves.toBe(true);
    expect(resolveTxtMock).toHaveBeenCalledWith('_fixyourdocs-challenge.acme.io');
  });

  it('joins multi-chunk TXT strings before comparing', async () => {
    resolveTxtMock.mockResolvedValueOnce([['fyd-verify=', 'TESTTOKEN']]);
    await expect(verifyTxt('acme.io', 'TESTTOKEN')).resolves.toBe(true);
  });

  it('returns false on a token mismatch', async () => {
    resolveTxtMock.mockResolvedValueOnce([['fyd-verify=WRONG']]);
    await expect(verifyTxt('acme.io', 'TESTTOKEN')).resolves.toBe(false);
  });

  it('returns false on NXDOMAIN / resolve error', async () => {
    resolveTxtMock.mockRejectedValueOnce(new Error('ENOTFOUND'));
    await expect(verifyTxt('acme.io', 'TESTTOKEN')).resolves.toBe(false);
  });
});

describe('challengeRecord', () => {
  it('builds the TXT record at the challenge label', () => {
    expect(challengeRecord('acme.io', 'TESTTOKEN')).toEqual({
      name: `${CHALLENGE_LABEL}.acme.io`,
      type: 'TXT',
      value: 'fyd-verify=TESTTOKEN',
    });
  });
});
