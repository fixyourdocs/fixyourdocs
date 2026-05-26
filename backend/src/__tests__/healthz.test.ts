import { describe, it, expect } from 'vitest';
import { handler } from '../handlers/healthz/healthz';

const fakeEvent = {
  requestContext: {
    requestId: 'test-req',
    http: { method: 'GET', path: '/healthz', sourceIp: '127.0.0.1' },
  },
} as any;

describe('GET /healthz', () => {
  it('returns 200 with { ok: true }', async () => {
    const res = (await (handler as any)(fakeEvent, {} as any, () => {})) as {
      statusCode: number;
      headers: Record<string, string>;
      body: string;
    };

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toBe('application/json');
    expect(JSON.parse(res.body)).toEqual({ ok: true });
  });
});
