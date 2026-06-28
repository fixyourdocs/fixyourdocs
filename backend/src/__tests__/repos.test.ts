import { describe, it, expect } from 'vitest';
import { parseRepoUrl, repoKey, isRepoSourceHost, repoUrl } from '../lib/repos';

describe('parseRepoUrl', () => {
  it('parses a blob file URL', () => {
    expect(parseRepoUrl('https://github.com/acme/widgets/blob/HEAD/docs/guide.md')).toEqual({
      owner: 'acme',
      repo: 'widgets',
      path: 'docs/guide.md',
    });
  });

  it('parses a tree URL', () => {
    expect(parseRepoUrl('https://github.com/acme/widgets/tree/main/docs')).toEqual({
      owner: 'acme',
      repo: 'widgets',
      path: 'docs',
    });
  });

  it('parses a github.com /raw URL', () => {
    expect(parseRepoUrl('https://github.com/acme/widgets/raw/HEAD/README.md')).toEqual({
      owner: 'acme',
      repo: 'widgets',
      path: 'README.md',
    });
  });

  it('parses a repo-root URL (no sub-route)', () => {
    expect(parseRepoUrl('https://github.com/acme/widgets')).toEqual({
      owner: 'acme',
      repo: 'widgets',
      path: '',
    });
  });

  it('parses a raw.githubusercontent.com URL', () => {
    expect(parseRepoUrl('https://raw.githubusercontent.com/acme/widgets/HEAD/docs/x.md')).toEqual({
      owner: 'acme',
      repo: 'widgets',
      path: 'docs/x.md',
    });
  });

  it('ignores ?plain=1 query', () => {
    expect(parseRepoUrl('https://github.com/acme/widgets/blob/HEAD/x.md?plain=1')).toMatchObject({
      owner: 'acme',
      repo: 'widgets',
      path: 'x.md',
    });
  });

  it('ignores a #L10 fragment', () => {
    expect(parseRepoUrl('https://github.com/acme/widgets/blob/HEAD/x.md#L10')).toMatchObject({
      owner: 'acme',
      repo: 'widgets',
    });
  });

  it('lower-cases owner and repo', () => {
    expect(parseRepoUrl('https://GitHub.com/ACME/Widgets/blob/HEAD/x.md')).toMatchObject({
      owner: 'acme',
      repo: 'widgets',
    });
  });

  it.each([
    ['an /issues sub-route', 'https://github.com/acme/widgets/issues/3'],
    ['a /pull sub-route', 'https://github.com/acme/widgets/pull/9'],
    ['a /wiki sub-route', 'https://github.com/acme/widgets/wiki/Home'],
    ['the gist host', 'https://gist.github.com/acme/deadbeef'],
    ['a non-GitHub host', 'https://example.com/acme/widgets/blob/HEAD/x.md'],
    ['a missing repo segment', 'https://github.com/acme'],
    ['a bad owner', 'https://github.com/-bad-/widgets/blob/HEAD/x.md'],
    ['an over-long repo', `https://github.com/acme/${'r'.repeat(101)}/blob/HEAD/x.md`],
    ['an unparseable url', 'not a url'],
  ])('rejects %s → null', (_label, url) => {
    expect(parseRepoUrl(url)).toBeNull();
  });
});

describe('repoKey / helpers', () => {
  it('repoKey lower-cases both halves', () => {
    expect(repoKey('ACME', 'Widgets')).toBe('acme/widgets');
  });

  it('isRepoSourceHost matches github.com and raw, case-insensitively', () => {
    expect(isRepoSourceHost('github.com')).toBe(true);
    expect(isRepoSourceHost('RAW.githubusercontent.com')).toBe(true);
    expect(isRepoSourceHost('gist.github.com')).toBe(false);
    expect(isRepoSourceHost('acme.github.io')).toBe(false);
  });

  it('repoUrl builds the canonical repo URL', () => {
    expect(repoUrl('acme', 'widgets')).toBe('https://github.com/acme/widgets');
  });
});
