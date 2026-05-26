import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the DynamoDB doc client used by rate-limit.ts. The mock module is
// hoisted by vitest, so it must not capture any out-of-scope variables.
vi.mock('../lib/db', () => ({
  ddb: { send: vi.fn() },
  tables: { reports: 'r', integrations: 'i', rateLimit: 'rl' },
}));

import { ddb } from '../lib/db';
import { checkAndConsume } from '../lib/rate-limit';

const sendMock = ddb.send as unknown as ReturnType<typeof vi.fn>;

describe('checkAndConsume', () => {
  beforeEach(() => {
    sendMock.mockReset();
  });

  it('returns true on a successful UpdateCommand', async () => {
    sendMock.mockResolvedValueOnce({});
    const allowed = await checkAndConsume('1.2.3.4');
    expect(allowed).toBe(true);
    expect(sendMock).toHaveBeenCalledOnce();
  });

  it('returns false when the conditional check fails', async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error('cond fail'), { name: 'ConditionalCheckFailedException' }),
    );
    const allowed = await checkAndConsume('1.2.3.4');
    expect(allowed).toBe(false);
  });

  it('rethrows on unrelated errors', async () => {
    sendMock.mockRejectedValueOnce(
      Object.assign(new Error('boom'), { name: 'InternalServerError' }),
    );
    await expect(checkAndConsume('1.2.3.4')).rejects.toThrow(/boom/);
  });
});
