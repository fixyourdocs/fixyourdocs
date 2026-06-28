import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/db', () => ({
  ddb: { send: vi.fn() },
  tables: { reports: 'r', integrations: 'i', rateLimit: 'rl', domains: 'd' },
}));

import { ddb } from '../lib/db';
import { resolveTargetForReport } from '../lib/integrations';
import { repoClaimKey } from '../lib/repos';
import { pagesClaimKey } from '../lib/pages';

const sendMock = ddb.send as unknown as ReturnType<typeof vi.fn>;

// Dispatch ddb.send by the key it asks for: claim/domain rows live under their
// `domain` PK; the integration row is keyed by `userId`.
function route(rows: Record<string, unknown>, integrations: Record<string, unknown> = {}) {
  sendMock.mockImplementation((cmd: any) => {
    const key = cmd?.input?.Key ?? {};
    if (typeof key.domain === 'string') return Promise.resolve({ Item: rows[key.domain] });
    if (typeof key.userId === 'string') return Promise.resolve({ Item: integrations[key.userId] });
    return Promise.resolve({});
  });
}

const repoClaim = (owner: string, repo: string, userId = 'u1') => ({
  domain: repoClaimKey(owner, repo),
  userId,
  status: 'verified',
  kind: 'repo',
  repoOwner: owner,
  repoName: repo,
  issueTemplate: 't',
});

const integration = (userId = 'u1') => ({ userId, installationId: 42, status: 'configured' });

const target = (owner: string, repo: string, userId = 'u1') => ({
  userId,
  installationId: 42,
  repoOwner: owner,
  repoName: repo,
  issueTemplate: 't',
});

describe('resolveTargetForReport — repo-file URLs', () => {
  beforeEach(() => sendMock.mockReset());

  it('routes a blob/HEAD URL to its repo claim', async () => {
    route({ [repoClaimKey('acme', 'widgets')]: repoClaim('Acme', 'Widgets') }, { u1: integration() });
    const res = await resolveTargetForReport('https://github.com/Acme/Widgets/blob/HEAD/README.md');
    expect(res).toEqual(target('Acme', 'Widgets'));
  });

  it('is case-insensitive: UPPER-cased owner/repo hit the lower-cased claim key', async () => {
    route({ [repoClaimKey('acme', 'widgets')]: repoClaim('Acme', 'Widgets') }, { u1: integration() });
    const res = await resolveTargetForReport('https://github.com/ACME/WIDGETS/blob/HEAD/docs/x.md');
    expect(res?.repoName).toBe('Widgets');
  });

  it('routes a raw.githubusercontent.com URL to the same repo claim', async () => {
    route({ [repoClaimKey('acme', 'widgets')]: repoClaim('Acme', 'Widgets') }, { u1: integration() });
    const res = await resolveTargetForReport('https://raw.githubusercontent.com/acme/widgets/HEAD/README.md');
    expect(res).toEqual(target('Acme', 'Widgets'));
  });

  it('returns null for an unclaimed repo', async () => {
    route({}, { u1: integration() });
    expect(await resolveTargetForReport('https://github.com/nobody/repo/blob/HEAD/README.md')).toBeNull();
  });

  it('returns null (no DB call) for a non-file GitHub route like /issues', async () => {
    route({});
    expect(await resolveTargetForReport('https://github.com/acme/widgets/issues/3')).toBeNull();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('returns null when the claim exists but its owner lost the installation', async () => {
    route({ [repoClaimKey('acme', 'widgets')]: repoClaim('Acme', 'Widgets') }, { u1: { userId: 'u1', status: 'installed' } });
    expect(await resolveTargetForReport('https://github.com/acme/widgets/blob/HEAD/x')).toBeNull();
  });
});

describe('resolveTargetForReport — GitHub Pages URLs (auto-derived)', () => {
  beforeEach(() => sendMock.mockReset());

  it('derives the publishing repo from a project-Pages URL with NO stored Pages row', async () => {
    route({ [repoClaimKey('acme', 'widgets')]: repoClaim('Acme', 'Widgets') }, { u1: integration() });
    const res = await resolveTargetForReport('https://acme.github.io/widgets/guide');
    expect(res).toEqual(target('Acme', 'Widgets'));
  });

  it('derives the user/org-Pages repo (<user>/<user>.github.io)', async () => {
    route({ [repoClaimKey('acme', 'acme.github.io')]: repoClaim('acme', 'acme.github.io') }, { u1: integration() });
    const res = await resolveTargetForReport('https://acme.github.io/');
    expect(res?.repoName).toBe('acme.github.io');
  });

  it('falls back to a legacy stored Pages claim when no repo claim matches', async () => {
    route(
      { [pagesClaimKey('acme.github.io', '/widgets/')]: { userId: 'u1', status: 'verified' } },
      { u1: { userId: 'u1', installationId: 42, status: 'configured', repoOwner: 'Acme', repoName: 'Widgets', issueTemplate: 't' } },
    );
    const res = await resolveTargetForReport('https://acme.github.io/widgets/page');
    expect(res).toEqual(target('Acme', 'Widgets'));
  });

  it('returns null for an unclaimed Pages path', async () => {
    route({}, { u1: integration() });
    expect(await resolveTargetForReport('https://acme.github.io/widgets/page')).toBeNull();
  });
});

describe('resolveTargetForReport — attached custom domains', () => {
  beforeEach(() => sendMock.mockReset());

  it('routes a verified domain that points at a specific repo', async () => {
    route(
      {
        'docs.acme.com': { domain: 'docs.acme.com', userId: 'u1', status: 'verified', repoOwner: 'Acme', repoName: 'Docs' },
        [repoClaimKey('acme', 'docs')]: repoClaim('Acme', 'Docs'),
      },
      { u1: integration() },
    );
    const res = await resolveTargetForReport('https://docs.acme.com/guide');
    expect(res).toEqual(target('Acme', 'Docs'));
  });

  it('falls back to the owner legacy single repo for a domain with no repo attached', async () => {
    route(
      { 'acme.com': { domain: 'acme.com', userId: 'u1', status: 'verified' } },
      { u1: { userId: 'u1', installationId: 42, status: 'configured', repoOwner: 'Acme', repoName: 'Site', issueTemplate: 't' } },
    );
    const res = await resolveTargetForReport('https://acme.com/docs');
    expect(res).toEqual(target('Acme', 'Site'));
  });

  it('returns null for an unparseable doc_url with no DB call', async () => {
    route({});
    expect(await resolveTargetForReport('not a url')).toBeNull();
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('returns null when no candidate domain is verified', async () => {
    route({}, { u1: integration() });
    expect(await resolveTargetForReport('https://docs.nobody.com/x')).toBeNull();
  });
});
