import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/db', () => ({
  ddb: { send: vi.fn() },
  tables: { reports: 'r', integrations: 'i', rateLimit: 'rl', domains: 'd' },
}));

vi.mock('../lib/integrations', () => ({
  resolveTargetForReport: vi.fn(),
}));

vi.mock('../lib/github-app', () => ({
  installationToken: vi.fn(),
  createIssue: vi.fn(),
}));

vi.mock('../lib/rate-limit', () => ({
  checkAndConsume: vi.fn(),
}));

import { ddb } from '../lib/db';
import { resolveTargetForReport } from '../lib/integrations';
import { installationToken, createIssue } from '../lib/github-app';
import { checkAndConsume } from '../lib/rate-limit';
import { handler } from '../handlers/forwarder/forwarder';

const sendMock = ddb.send as unknown as ReturnType<typeof vi.fn>;
const resolveMock = resolveTargetForReport as unknown as ReturnType<typeof vi.fn>;
const tokenMock = installationToken as unknown as ReturnType<typeof vi.fn>;
const createIssueMock = createIssue as unknown as ReturnType<typeof vi.fn>;
const capMock = checkAndConsume as unknown as ReturnType<typeof vi.fn>;

// The forwarder consumes a ResolvedTarget: owner + installation + repo
// + template. (No `status` — that lives on the integration row, not the target.)
const TARGET = {
  userId: 'user-1',
  installationId: 42,
  repoOwner: 'o',
  repoName: 'docs-sandbox',
  issueTemplate: '**Docs feedback**\n\n{summary}\n\n{details}\n\nSource: {doc_url}',
};

const REPORT = {
  reportId: 'r-1',
  docUrl: 'https://docs.example.com/sso',
  agentName: 'claude-code',
  kind: 'outdated',
  summary: 'SSO steps are stale',
  details: 'Step 3 no longer exists',
};

function invoke(reportId = 'r-1') {
  return (handler as any)({ report_id: reportId }, {} as any, () => {});
}

beforeEach(() => {
  sendMock.mockReset();
  resolveMock.mockReset().mockResolvedValue(TARGET);
  tokenMock.mockReset().mockResolvedValue('ghs_test');
  createIssueMock.mockReset().mockResolvedValue({ number: 7, htmlUrl: 'https://github.com/o/r/issues/7' });
  capMock.mockReset().mockResolvedValue(true);
});

describe('forwarder', () => {
  it('happy path: posts exactly one Issue and records issueNumber + forwarded', async () => {
    sendMock
      .mockResolvedValueOnce({ Item: { ...REPORT } }) // Get report
      .mockResolvedValueOnce({}) // claim Update
      .mockResolvedValueOnce({}); // record forwarded Update

    const res = await invoke();

    expect(res).toEqual({ ok: true });
    expect(createIssueMock).toHaveBeenCalledTimes(1);
    expect(createIssueMock).toHaveBeenCalledWith(
      'ghs_test',
      'o',
      'docs-sandbox',
      expect.stringContaining('[docs]'),
      expect.stringContaining('SSO steps are stale'),
    );
    const record = sendMock.mock.calls[2][0].input;
    expect(record.ExpressionAttributeValues[':forwarded']).toBe('forwarded');
    expect(record.ExpressionAttributeValues[':n']).toBe(7);
    expect(record.ExpressionAttributeValues[':u']).toBe('https://github.com/o/r/issues/7');
    expect(record.UpdateExpression).toContain('REMOVE forwardLeaseAt');
  });

  it('no-ops when the report is already forwarded', async () => {
    sendMock.mockResolvedValueOnce({ Item: { ...REPORT, forwardStatus: 'forwarded' } });
    const res = await invoke();
    expect(res).toEqual({ ok: true, reason: 'already_forwarded' });
    expect(createIssueMock).not.toHaveBeenCalled();
  });

  it('returns report_not_found when the row is missing', async () => {
    sendMock.mockResolvedValueOnce({}); // no Item
    const res = await invoke();
    expect(res).toEqual({ ok: false, reason: 'report_not_found' });
    expect(createIssueMock).not.toHaveBeenCalled();
  });

  it('posts no Issue when nothing routes (no claim matches)', async () => {
    resolveMock.mockResolvedValueOnce(null);
    sendMock.mockResolvedValueOnce({ Item: { ...REPORT } }); // Get report
    const res = await invoke();
    expect(res).toEqual({ ok: false, reason: 'no_route' });
    expect(createIssueMock).not.toHaveBeenCalled();
  });

  it('defers (no Issue) when over the per-integration cap', async () => {
    capMock.mockResolvedValueOnce(false);
    sendMock
      .mockResolvedValueOnce({ Item: { ...REPORT } }) // Get report
      .mockResolvedValueOnce({}); // setStatus deferred
    const res = await invoke();
    expect(res).toEqual({ ok: false, reason: 'rate_capped' });
    expect(createIssueMock).not.toHaveBeenCalled();
    expect(sendMock.mock.calls[1][0].input.ExpressionAttributeValues[':s']).toBe('deferred');
  });

  it('marks failed and throws when createIssue returns null', async () => {
    createIssueMock.mockResolvedValueOnce(null);
    sendMock
      .mockResolvedValueOnce({ Item: { ...REPORT } }) // Get
      .mockResolvedValueOnce({}) // claim
      .mockResolvedValueOnce({}); // setStatus failed
    await expect(invoke()).rejects.toThrow(/issue_create_failed/);
    expect(sendMock.mock.calls[2][0].input.ExpressionAttributeValues[':s']).toBe('failed');
  });

  it('two concurrent invocations create exactly one Issue (idempotent claim)', async () => {
    let claimed = false;
    sendMock.mockImplementation((cmd: any) => {
      const input = cmd.input;
      // GetCommand on reports: no UpdateExpression.
      if (!input.UpdateExpression) {
        return Promise.resolve({ Item: { ...REPORT } });
      }
      // The idempotent claim sets forwardStatus = :forwarding.
      if (input.UpdateExpression.includes(':forwarding')) {
        if (claimed) {
          return Promise.reject(
            Object.assign(new Error('cond'), { name: 'ConditionalCheckFailedException' }),
          );
        }
        claimed = true;
        return Promise.resolve({});
      }
      // record-forwarded update.
      return Promise.resolve({});
    });

    const results = await Promise.all([invoke(), invoke()]);
    expect(results).toContainEqual({ ok: true });
    expect(results).toContainEqual({ ok: true, reason: 'claimed_elsewhere' });
    expect(createIssueMock).toHaveBeenCalledTimes(1);
  });
});
