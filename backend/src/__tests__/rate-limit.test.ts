import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../lib/db', () => ({
  ddb: { send: vi.fn() },
  tables: { reports: 'r', integrations: 'i', rateLimit: 'rl' },
}));

import { ddb } from '../lib/db';
import { checkAndConsume } from '../lib/rate-limit';

const sendMock = ddb.send as unknown as ReturnType<typeof vi.fn>;

const NOW = 1_000_000;

describe('checkAndConsume', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('returns true on a fresh bucket (no prior row) and writes the refilled-minus-one value', async () => {
    sendMock.mockResolvedValueOnce({ Item: undefined }); // GetCommand
    sendMock.mockResolvedValueOnce({}); // UpdateCommand

    const allowed = await checkAndConsume('1.2.3.4', { now: NOW });

    expect(allowed).toBe(true);
    expect(sendMock).toHaveBeenCalledTimes(2);

    const updateInput = sendMock.mock.calls[1][0].input;
    expect(updateInput.ExpressionAttributeValues[':newTokens']).toBe(99); // 100 - 1
    expect(updateInput.ExpressionAttributeValues[':now']).toBe(NOW);
  });

  it('returns false when the bucket is exhausted (no tokens after refill)', async () => {
    sendMock.mockResolvedValueOnce({
      Item: { bucketKey: 'ip:1.2.3.4', tokens: 0, lastRefillAt: NOW },
    });
    const allowed = await checkAndConsume('1.2.3.4', { now: NOW });
    expect(allowed).toBe(false);
    expect(sendMock).toHaveBeenCalledTimes(1); // bailed before UpdateCommand
  });

  it('refills proportionally to elapsed time, capped at capacity', async () => {
    // 10 seconds elapsed @ 10 tokens/sec → +100; capped at capacity 100.
    sendMock.mockResolvedValueOnce({
      Item: { bucketKey: 'ip:1.2.3.4', tokens: 50, lastRefillAt: NOW - 10 },
    });
    sendMock.mockResolvedValueOnce({});

    const allowed = await checkAndConsume('1.2.3.4', { now: NOW });
    expect(allowed).toBe(true);

    const updateInput = sendMock.mock.calls[1][0].input;
    // min(100, 50 + 10*10) - 1 = 99
    expect(updateInput.ExpressionAttributeValues[':newTokens']).toBe(99);
  });

  it('returns false when the conditional update fails (race)', async () => {
    sendMock.mockResolvedValueOnce({ Item: undefined });
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error('cond fail'), { name: 'ConditionalCheckFailedException' }),
    );
    const allowed = await checkAndConsume('1.2.3.4', { now: NOW });
    expect(allowed).toBe(false);
  });

  it('rethrows on unrelated errors', async () => {
    sendMock.mockResolvedValueOnce({ Item: undefined });
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error('boom'), { name: 'InternalServerError' }),
    );
    await expect(checkAndConsume('1.2.3.4', { now: NOW })).rejects.toThrow(/boom/);
  });

  it('never sends an UpdateExpression containing `*` (DynamoDB does not support multiplication)', async () => {
    // Regression: the original implementation used `:rate * (:now - lastRefillAt)`
    // which fails at DDB validation with "Invalid UpdateExpression: Syntax error;
    // token: \"*\", near: \":rate * (\"". Pin the expression text so this never
    // comes back via a "cleanup" refactor.
    sendMock.mockResolvedValueOnce({ Item: undefined });
    sendMock.mockResolvedValueOnce({});
    await checkAndConsume('1.2.3.4', { now: NOW });

    const updateInput = sendMock.mock.calls[1][0].input;
    expect(updateInput.UpdateExpression).not.toContain('*');
    expect(updateInput.ConditionExpression ?? '').not.toContain('*');
  });
});
