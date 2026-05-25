import { describe, it, before, after } from 'node:test';
import { strict as assert } from 'node:assert';

let json: typeof import('./response.js').json;
let ok: typeof import('./response.js').ok;
let created: typeof import('./response.js').created;
let noContent: typeof import('./response.js').noContent;
let errorResponse: typeof import('./response.js').errorResponse;
let publicOk: typeof import('./response.js').publicOk;
let publicError: typeof import('./response.js').publicError;

const ORIGINAL_ALLOWED = process.env.ALLOWED_ORIGINS;

before(async () => {
  // response.ts captures process.env at import time. Stage two known origins.
  process.env.ALLOWED_ORIGINS = 'https://fixyourdocs.io,https://app.fixyourdocs.io';
  const mod = await import('./response.js');
  json = mod.json;
  ok = mod.ok;
  created = mod.created;
  noContent = mod.noContent;
  errorResponse = mod.errorResponse;
  publicOk = mod.publicOk;
  publicError = mod.publicError;
});

after(() => {
  if (ORIGINAL_ALLOWED === undefined) delete process.env.ALLOWED_ORIGINS;
  else process.env.ALLOWED_ORIGINS = ORIGINAL_ALLOWED;
});

const headers = (r: ReturnType<typeof ok>) => (r as { headers: Record<string, string> }).headers;

describe('authenticated response helpers', () => {
  it('json stamps statusCode, content-type, and a JSON body', () => {
    const r = json(200, { hello: 'world' });
    assert.equal((r as any).statusCode, 200);
    assert.equal(headers(r)['content-type'], 'application/json');
    assert.equal((r as any).body, '{"hello":"world"}');
  });

  it('echoes a whitelisted Origin', () => {
    const r = ok({}, 'https://app.fixyourdocs.io');
    assert.equal(headers(r)['access-control-allow-origin'], 'https://app.fixyourdocs.io');
    assert.equal(headers(r).vary, 'Origin');
    assert.equal(headers(r)['access-control-allow-credentials'], 'true');
  });

  it('falls back to first allowed origin for an unknown Origin', () => {
    const r = ok({}, 'https://evil.example.com');
    assert.equal(headers(r)['access-control-allow-origin'], 'https://fixyourdocs.io');
  });

  it('created returns 201', () => {
    assert.equal((created({ id: 'x' }) as any).statusCode, 201);
  });

  it('noContent returns 204 with empty body', () => {
    const r = noContent();
    assert.equal((r as any).statusCode, 204);
    assert.equal((r as any).body, '');
  });

  it('errorResponse shapes { error: { code, message } }', () => {
    const r = errorResponse('not_found', 'no such org', 404);
    assert.equal((r as any).statusCode, 404);
    const body = JSON.parse((r as any).body);
    assert.deepEqual(body, { error: { code: 'not_found', message: 'no such org' } });
  });
});

describe('public response helpers', () => {
  it('publicOk uses wildcard CORS + 30s cache', () => {
    const r = publicOk([{ slug: 'acme' }]);
    assert.equal(headers(r)['access-control-allow-origin'], '*');
    assert.equal(headers(r)['cache-control'], 'public, max-age=30');
  });

  it('publicError shapes the public-API error envelope', () => {
    const r = publicError('rate_limited', 'too many requests', 429);
    assert.equal((r as any).statusCode, 429);
    const body = JSON.parse((r as any).body);
    assert.deepEqual(body, { error: { code: 'rate_limited', message: 'too many requests' } });
  });
});
