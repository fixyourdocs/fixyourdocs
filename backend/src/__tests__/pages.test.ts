import { describe, it, expect } from 'vitest';
import { isPagesHost, isPagesKey, decodePagesDeleteToken, pagesUrl } from '../lib/pages';

// Pages routing is auto-derived from the repo claim (see resolver.test.ts).
// These cover the remaining host/key guards + delete-token + public URL.
describe('Pages host/key guards', () => {
  it('isPagesHost is true for a real Pages host, false for the bare suffix', () => {
    expect(isPagesHost('acme.github.io')).toBe(true);
    expect(isPagesHost('github.io')).toBe(false);
    expect(isPagesHost('docs.acme.com')).toBe(false);
  });

  it('isPagesKey distinguishes a stored claim key from a real domain', () => {
    expect(isPagesKey('pages:acme.github.io/widgets/')).toBe(true);
    expect(isPagesKey('acme.com')).toBe(false);
  });

  it('decodePagesDeleteToken round-trips a base64url key', () => {
    const key = 'pages:acme.github.io/widgets/';
    expect(decodePagesDeleteToken(Buffer.from(key, 'utf8').toString('base64url'))).toBe(key);
  });

  it('pagesUrl renders the public URL', () => {
    expect(pagesUrl('acme.github.io', '/widgets/')).toBe('https://acme.github.io/widgets/');
  });
});
