import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { HttpError, getOrigin, requireUser } from './auth.js';

const event = (overrides: Record<string, unknown> = {}) =>
  ({
    requestContext: { authorizer: { jwt: { claims: { sub: 'user-1', email: 'a@b.test' } } } },
    headers: {},
    ...overrides,
  }) as any;

describe('HttpError', () => {
  it('captures status + code + message', () => {
    const err = new HttpError(403, 'forbidden', 'no membership');
    assert.equal(err.status, 403);
    assert.equal(err.code, 'forbidden');
    assert.equal(err.message, 'no membership');
    assert.equal(err instanceof Error, true);
  });
});

describe('requireUser', () => {
  it('returns { sub, email } when claims present', () => {
    const user = requireUser(event());
    assert.deepEqual(user, { sub: 'user-1', email: 'a@b.test' });
  });

  it('omits email when not in claims', () => {
    const e = event({
      requestContext: { authorizer: { jwt: { claims: { sub: 'user-1' } } } },
    });
    const user = requireUser(e);
    assert.equal(user.sub, 'user-1');
    assert.equal(user.email, undefined);
  });

  it('throws HttpError(401) when authorizer claims are missing', () => {
    const e = event({ requestContext: {} });
    assert.throws(() => requireUser(e), (err: unknown) => err instanceof HttpError && (err as HttpError).status === 401);
  });

  it('throws HttpError(401) when sub claim is missing', () => {
    const e = event({
      requestContext: { authorizer: { jwt: { claims: { email: 'a@b.test' } } } },
    });
    assert.throws(() => requireUser(e), (err: unknown) => err instanceof HttpError && (err as HttpError).code === 'unauthorized');
  });
});

describe('getOrigin', () => {
  it('reads lowercase origin', () => {
    assert.equal(getOrigin({ headers: { origin: 'https://x.test' } }), 'https://x.test');
  });

  it('reads Capitalised Origin header (some clients send it)', () => {
    assert.equal(getOrigin({ headers: { Origin: 'https://x.test' } }), 'https://x.test');
  });

  it('returns undefined when no headers', () => {
    assert.equal(getOrigin({}), undefined);
  });
});
