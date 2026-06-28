import { describe, it, expect } from 'vitest';
import {
  parseRepoUrl,
  isRepoSourceHost,
  isRepoKey,
  repoClaimKey,
  decodeRepoDeleteToken,
  repoUrl,
} from '../lib/repos';

describe('parseRepoUrl — github.com source URLs', () => {
  it('parses a blob/HEAD file URL', () => {
    expect(parseRepoUrl('https://github.com/acme/widgets/blob/HEAD/README.md')).toEqual({
      owner: 'acme',
      repo: 'widgets',
      path: 'README.md',
    });
  });

  it('parses a nested blob path', () => {
    expect(parseRepoUrl('https://github.com/acme/widgets/blob/main/docs/guide/intro.md')).toMatchObject({
      owner: 'acme',
      repo: 'widgets',
      path: 'docs/guide/intro.md',
    });
  });

  it('parses a tree URL', () => {
    expect(parseRepoUrl('https://github.com/acme/widgets/tree/HEAD/docs')).toMatchObject({
      owner: 'acme',
      repo: 'widgets',
      path: 'docs',
    });
  });

  it('parses a bare repo-root URL (no file path)', () => {
    expect(parseRepoUrl('https://github.com/acme/widgets')).toEqual({ owner: 'acme', repo: 'widgets', path: '' });
    expect(parseRepoUrl('https://github.com/acme/widgets/')).toEqual({ owner: 'acme', repo: 'widgets', path: '' });
  });

  it('lower-cases owner and repo (GitHub is case-insensitive)', () => {
    expect(parseRepoUrl('https://github.com/Acme/Widgets/blob/HEAD/X.md')).toMatchObject({
      owner: 'acme',
      repo: 'widgets',
    });
  });

  it('ignores ?plain=1 and the #Lnn fragment', () => {
    expect(parseRepoUrl('https://github.com/acme/widgets/blob/HEAD/README.md?plain=1#L10')).toMatchObject({
      owner: 'acme',
      repo: 'widgets',
      path: 'README.md',
    });
  });

  it('parses raw.githubusercontent.com', () => {
    expect(parseRepoUrl('https://raw.githubusercontent.com/acme/widgets/HEAD/README.md')).toEqual({
      owner: 'acme',
      repo: 'widgets',
      path: 'README.md',
    });
  });
});

describe('parseRepoUrl — rejections', () => {
  it.each([
    ['non-file route /issues', 'https://github.com/acme/widgets/issues/3'],
    ['non-file route /pull', 'https://github.com/acme/widgets/pull/5'],
    ['non-file route /wiki', 'https://github.com/acme/widgets/wiki/Home'],
    ['non-file route /releases', 'https://github.com/acme/widgets/releases'],
    ['a gist host', 'https://gist.github.com/acme/deadbeef'],
    ['owner only, no repo', 'https://github.com/acme'],
    ['a non-GitHub host', 'https://gitlab.com/acme/widgets/blob/HEAD/x'],
    ['an invalid owner with a space', 'https://github.com/ac me/widgets'],
    ['not a URL', 'not a url'],
  ])('rejects %s', (_label, url) => {
    expect(parseRepoUrl(url)).toBeNull();
  });
});

describe('repo claim key + host/key guards', () => {
  it('builds a lower-cased synthetic key', () => {
    expect(repoClaimKey('Acme', 'Widgets')).toBe('repo:acme/widgets');
  });

  it('isRepoSourceHost is true for github.com and raw, false otherwise', () => {
    expect(isRepoSourceHost('github.com')).toBe(true);
    expect(isRepoSourceHost('raw.githubusercontent.com')).toBe(true);
    expect(isRepoSourceHost('gist.github.com')).toBe(false);
    expect(isRepoSourceHost('acme.github.io')).toBe(false);
  });

  it('isRepoKey distinguishes a repo claim key from a domain / pages key', () => {
    expect(isRepoKey('repo:acme/widgets')).toBe(true);
    expect(isRepoKey('pages:acme.github.io/widgets/')).toBe(false);
    expect(isRepoKey('acme.com')).toBe(false);
  });

  it('base64url delete token round-trips the synthetic key', () => {
    const key = repoClaimKey('acme', 'widgets');
    const token = Buffer.from(key, 'utf8').toString('base64url');
    expect(decodeRepoDeleteToken(token)).toBe(key);
    expect(token).not.toContain('/'); // path-safe for the {domain} route param
  });

  it('repoUrl renders the public GitHub URL', () => {
    expect(repoUrl('acme', 'widgets')).toBe('https://github.com/acme/widgets');
  });
});
