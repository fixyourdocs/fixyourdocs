import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';

import { HttpError } from './auth.js';
import { wrapAuth, wrapPublic } from './wrap.js';

const event = () => ({ headers: { origin: 'https://fixyourdocs.io' }, requestContext: {} }) as any;
const ctx = {} as any;
const cb = (() => {}) as any;

describe('wrapAuth', () => {
  it('passes through successful results', async () => {
    const wrapped = wrapAuth((async () => ({ statusCode: 200, body: 'ok' })) as any);
    const r = await (wrapped as any)(event(), ctx, cb);
    assert.equal(r.statusCode, 200);
  });

  it('converts HttpError into the structured authed error response', async () => {
    const wrapped = wrapAuth((async () => {
      throw new HttpError(404, 'not_found', 'no such org');
    }) as any);
    const r: any = await (wrapped as any)(event(), ctx, cb);
    assert.equal(r.statusCode, 404);
    const body = JSON.parse(r.body);
    assert.deepEqual(body, { error: { code: 'not_found', message: 'no such org' } });
  });

  it('converts unknown errors into a 500 internal_error', async () => {
    const wrapped = wrapAuth((async () => {
      throw new Error('boom');
    }) as any);
    const r: any = await (wrapped as any)(event(), ctx, cb);
    assert.equal(r.statusCode, 500);
    const body = JSON.parse(r.body);
    assert.equal(body.error.code, 'internal_error');
  });
});

describe('wrapPublic', () => {
  it('passes through successful results', async () => {
    const wrapped = wrapPublic((async () => ({ statusCode: 200, body: 'ok' })) as any);
    const r = await (wrapped as any)(event(), ctx, cb);
    assert.equal(r.statusCode, 200);
  });

  it('converts HttpError into the public error envelope', async () => {
    const wrapped = wrapPublic((async () => {
      throw new HttpError(429, 'rate_limited', 'too many requests');
    }) as any);
    const r: any = await (wrapped as any)(event(), ctx, cb);
    assert.equal(r.statusCode, 429);
    const body = JSON.parse(r.body);
    assert.deepEqual(body, { error: { code: 'rate_limited', message: 'too many requests' } });
  });

  it('converts unknown errors into a public 500 internal_error', async () => {
    const wrapped = wrapPublic((async () => {
      throw new Error('boom');
    }) as any);
    const r: any = await (wrapped as any)(event(), ctx, cb);
    assert.equal(r.statusCode, 500);
    const body = JSON.parse(r.body);
    assert.equal(body.error.code, 'internal_error');
  });
});
