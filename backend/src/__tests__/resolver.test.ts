import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/db', () => ({
  ddb: { send: vi.fn() },
  tables: { reports: 'r', integrations: 'i', rateLimit: 'rl', domains: 'd', repos: 'repos' },
}));

import { ddb } from '../lib/db';
import { resolveTargetForReport } from '../lib/integrations';

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

// A verified repo claim, and the owner's integration (where installationId lives).
const repoClaim = (userId = 'user-1') => ({
  Item: {
    repo: 'acme/widgets', userId, status: 'verified',
    repoOwner: 'acme', repoName: 'widgets', issueTemplate: 'repo-template {summary}',
  },
});
const integration = (userId = 'user-1', installationId = 42) => ({
  Item: { userId, status: 'configured', installationId, repoOwner: 'o', repoName: 'r', issueTemplate: '{summary}' },
});

describe('resolveTargetForReport (repo-centric routing)', () => {
  beforeEach(() => sendMock.mockReset());

  it('routes a *.github.io URL with NO stored Pages row via the repo claim', async () => {
    sendMock
      .mockResolvedValueOnce(repoClaim()) // repos: acme/widgets — verified
      .mockResolvedValueOnce(integration()); // integrations: owner → installationId
    const res = await resolveTargetForReport('https://acme.github.io/widgets/guide');
    expect(res).toEqual({
      userId: 'user-1', installationId: 42,
      repoOwner: 'acme', repoName: 'widgets', issueTemplate: 'repo-template {summary}',
    });
  });

  it('routes a blob/HEAD repo-file URL to its repo claim', async () => {
    sendMock.mockResolvedValueOnce(repoClaim()).mockResolvedValueOnce(integration());
    const res = await resolveTargetForReport('https://github.com/acme/widgets/blob/HEAD/README.md');
    expect(res).toMatchObject({ repoOwner: 'acme', repoName: 'widgets', installationId: 42 });
  });

  it('routes a custom domain to its attached repo', async () => {
    sendMock
      .mockResolvedValueOnce({ Item: { domain: 'docs.acme.com', userId: 'user-1', status: 'verified', repoOwner: 'acme', repoName: 'widgets' } })
      .mockResolvedValueOnce(repoClaim())
      .mockResolvedValueOnce(integration());
    const res = await resolveTargetForReport('https://docs.acme.com/guide');
    expect(res).toMatchObject({ repoOwner: 'acme', repoName: 'widgets', installationId: 42 });
  });

  it('returns null for an unclaimed repo-file URL', async () => {
    sendMock.mockResolvedValueOnce({}); // repos: miss
    const res = await resolveTargetForReport('https://github.com/nobody/none/blob/HEAD/x.md');
    expect(res).toBeNull();
  });

  it('legacy fallback: a verified domain with no attached repo routes to the owner single repo', async () => {
    sendMock
      .mockResolvedValueOnce({ Item: { domain: 'acme.io', userId: 'user-9', status: 'verified' } }) // no repoOwner
      .mockResolvedValueOnce(configured('user-9'));
    const res = await resolveTargetForReport('https://acme.io/docs');
    expect(res).toMatchObject({ userId: 'user-9', repoOwner: 'o', repoName: 'r' });
  });

  it('returns null on an unparseable doc_url (no DB call)', async () => {
    const res = await resolveTargetForReport('not a url');
    expect(res).toBeNull();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('the most-specific verified domain wins over a parent (legacy fallback)', async () => {
    sendMock
      .mockResolvedValueOnce({ Item: { domain: 'docs.example.com', userId: 'sub-owner', status: 'verified' } })
      .mockResolvedValueOnce(configured('sub-owner'));
    const res = await resolveTargetForReport('https://docs.example.com/x');
    expect(res).toMatchObject({ userId: 'sub-owner', repoName: 'r' });
    expect(sendMock).toHaveBeenCalledTimes(2); // never queried example.com
  });
});
