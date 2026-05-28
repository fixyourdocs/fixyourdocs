import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/db', () => ({
  ddb: { send: vi.fn() },
  tables: { reports: 'r', integrations: 'i', rateLimit: 'rl', domains: 'd' },
}));

import { ddb } from '../lib/db';
import { resolveIntegrationForReport } from '../lib/integrations';

const sendMock = ddb.send as unknown as ReturnType<typeof vi.fn>;

const configured = (userId: string) => ({
  Item: {
    userId,
    status: 'configured',
    installationId: 1,
    repoOwner: 'o',
    repoName: 'r',
    issueTemplate: '{summary}',
  },
});

describe('resolveIntegrationForReport (6c routing policy)', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('routes a subdomain of a verified domain to the owner configured integration', async () => {
    sendMock
      .mockResolvedValueOnce({}) // domains: docs.example.com — miss
      .mockResolvedValueOnce({ Item: { domain: 'example.com', userId: 'user-1', status: 'verified' } })
      .mockResolvedValueOnce(configured('user-1')); // integrations: user-1

    const res = await resolveIntegrationForReport('https://docs.example.com/sso');
    expect(res).toMatchObject({ userId: 'user-1', status: 'configured', repoName: 'r' });
  });

  it('returns null when no candidate domain is verified', async () => {
    sendMock.mockResolvedValue({}); // every getDomain misses
    const res = await resolveIntegrationForReport('https://docs.nobody.com/x');
    expect(res).toBeNull();
  });

  it('returns null when the verified owner has not configured a repo (status installed)', async () => {
    sendMock
      .mockResolvedValueOnce({ Item: { domain: 'acme.io', userId: 'user-2', status: 'verified' } })
      .mockResolvedValueOnce({ Item: { userId: 'user-2', status: 'installed' } });
    const res = await resolveIntegrationForReport('https://acme.io/docs');
    expect(res).toBeNull();
  });

  it('the most-specific verified owner wins over a parent domain', async () => {
    sendMock
      .mockResolvedValueOnce({ Item: { domain: 'docs.example.com', userId: 'sub-owner', status: 'verified' } })
      .mockResolvedValueOnce(configured('sub-owner'));
    const res = await resolveIntegrationForReport('https://docs.example.com/x');
    expect(res).toMatchObject({ userId: 'sub-owner' });
    expect(sendMock).toHaveBeenCalledTimes(2); // never queried example.com
  });

  it('returns null on an unparseable doc_url (no DB call)', async () => {
    const res = await resolveIntegrationForReport('not a url');
    expect(res).toBeNull();
    expect(sendMock).not.toHaveBeenCalled();
  });
});
