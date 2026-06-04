import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createHmac } from 'node:crypto';

vi.mock('../lib/db', () => ({
  ddb: { send: vi.fn() },
  tables: { reports: 'r', integrations: 'i', rateLimit: 'rl', domains: 'd', oauthState: 'os', githubLinks: 'gl' },
}));
vi.mock('../lib/rate-limit', () => ({ checkAndConsume: vi.fn().mockResolvedValue(true) }));
vi.mock('../lib/ssm', () => ({ getParam: vi.fn() }));

import { ddb } from '../lib/db';
import { checkAndConsume } from '../lib/rate-limit';
import { getParam } from '../lib/ssm';
import { handler } from '../handlers/webhooks/github';

const sendMock = ddb.send as unknown as ReturnType<typeof vi.fn>;
const rateMock = checkAndConsume as unknown as ReturnType<typeof vi.fn>;
const paramMock = getParam as unknown as ReturnType<typeof vi.fn>;

const SECRET = 'whsec_test';

function sign(body: string): string {
  return `sha256=${createHmac('sha256', SECRET).update(Buffer.from(body, 'utf8')).digest('hex')}`;
}

function webhookEvent(body: string, opts: { sig?: string; event?: string } = {}): any {
  return {
    requestContext: { requestId: 't', http: { method: 'POST', path: '/v1/webhooks/github', sourceIp: '1.2.3.4' } },
    headers: {
      'x-github-event': opts.event ?? 'installation',
      ...(opts.sig === null ? {} : { 'x-hub-signature-256': opts.sig ?? sign(body) }),
    },
    body,
    isBase64Encoded: false,
  };
}
async function call(ev: any): Promise<any> {
  return (handler as any)(ev, {} as any, () => {});
}

beforeEach(() => {
  sendMock.mockReset();
  rateMock.mockReset().mockResolvedValue(true);
  paramMock.mockReset().mockResolvedValue(SECRET);
  process.env.GITHUB_WEBHOOK_SECRET_PARAM = '/fyd/hub/github-webhook/secret';
});

describe('POST /v1/webhooks/github', () => {
  it('valid installation.deleted → drops the matching integration row via the GSI', async () => {
    const body = JSON.stringify({ action: 'deleted', installation: { id: 4242 } });
    sendMock
      .mockResolvedValueOnce({ Items: [{ userId: 'user-1', installationId: 4242 }] }) // GSI Query
      .mockResolvedValueOnce({}); // Delete

    const res = await call(webhookEvent(body));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, reconciled: 1 });
    const q = sendMock.mock.calls[0][0].input;
    expect(q.IndexName).toBe('installationId-index');
    expect(q.ExpressionAttributeValues).toEqual({ ':iid': 4242 });
    expect(sendMock.mock.calls[1][0].input).toMatchObject({ TableName: 'i', Key: { userId: 'user-1' } });
  });

  it('bad signature → 401 before any DB access or body parse', async () => {
    const body = JSON.stringify({ action: 'deleted', installation: { id: 4242 } });
    const res = await call(webhookEvent(body, { sig: 'sha256=deadbeef' }));
    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body).error.code).toBe('bad_signature');
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('missing signature header → 401', async () => {
    const body = JSON.stringify({ action: 'deleted', installation: { id: 1 } });
    const res = await call(webhookEvent(body, { sig: null as any }));
    expect(res.statusCode).toBe(401);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('unrelated event (installation.created) → 200 no-op', async () => {
    const body = JSON.stringify({ action: 'created', installation: { id: 4242 } });
    const res = await call(webhookEvent(body));
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, ignored: true });
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('rate-limited → 429', async () => {
    rateMock.mockResolvedValueOnce(false);
    const res = await call(webhookEvent('{}'));
    expect(res.statusCode).toBe(429);
    expect(sendMock).not.toHaveBeenCalled();
  });
});
