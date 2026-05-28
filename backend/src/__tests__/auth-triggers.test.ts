import { describe, it, expect, beforeEach, vi } from 'vitest';

// create-auth-challenge reads/deletes the pin from DynamoDB; mock the client.
vi.mock('../lib/db', () => ({
  ddb: { send: vi.fn() },
  tables: { oauthState: 'oauth-state' },
}));

import { ddb } from '../lib/db';
import { handler as define } from '../handlers/auth-triggers/define-auth-challenge';
import { handler as create } from '../handlers/auth-triggers/create-auth-challenge';
import { handler as verify } from '../handlers/auth-triggers/verify-auth-challenge-response';

const sendMock = ddb.send as unknown as ReturnType<typeof vi.fn>;
const run = (h: unknown, event: unknown) => (h as any)(event, {} as any, () => {});

const HEX64 = /^[0-9a-f]{64}$/;

describe('define-auth-challenge (C1 fail closed)', () => {
  const make = (session: unknown[]) => ({ request: { session }, response: {} }) as any;

  it('first call (no session) asks for one CUSTOM_CHALLENGE', async () => {
    const e = await run(define, make([]));
    expect(e.response.challengeName).toBe('CUSTOM_CHALLENGE');
    expect(e.response.issueTokens).toBe(false);
    expect(e.response.failAuthentication).toBe(false);
  });

  it('issues tokens after exactly one correct CUSTOM_CHALLENGE', async () => {
    const e = await run(define, make([{ challengeName: 'CUSTOM_CHALLENGE', challengeResult: true }]));
    expect(e.response.issueTokens).toBe(true);
    expect(e.response.failAuthentication).toBe(false);
  });

  it('fails on a wrong answer', async () => {
    const e = await run(define, make([{ challengeName: 'CUSTOM_CHALLENGE', challengeResult: false }]));
    expect(e.response.issueTokens).toBe(false);
    expect(e.response.failAuthentication).toBe(true);
  });

  it('fails when more than one attempt is seen (no retries)', async () => {
    const e = await run(define, make([
      { challengeName: 'CUSTOM_CHALLENGE', challengeResult: false },
      { challengeName: 'CUSTOM_CHALLENGE', challengeResult: true },
    ]));
    expect(e.response.issueTokens).toBe(false);
    expect(e.response.failAuthentication).toBe(true);
  });
});

describe('verify-auth-challenge-response (C1 constant-time)', () => {
  const make = (pin: string | undefined, answer: string) =>
    ({ request: { privateChallengeParameters: { pin }, challengeAnswer: answer }, response: {} }) as any;

  it('accepts an exact match', async () => {
    const e = await run(verify, make('abc123', 'abc123'));
    expect(e.response.answerCorrect).toBe(true);
  });

  it('rejects a mismatch', async () => {
    const e = await run(verify, make('abc123', 'abc124'));
    expect(e.response.answerCorrect).toBe(false);
  });

  it('rejects an empty/missing pin', async () => {
    const e = await run(verify, make(undefined, 'abc123'));
    expect(e.response.answerCorrect).toBe(false);
  });

  it('rejects an empty answer', async () => {
    const e = await run(verify, make('abc123', ''));
    expect(e.response.answerCorrect).toBe(false);
  });

  it('rejects on a length mismatch', async () => {
    const e = await run(verify, make('abc', 'abcd'));
    expect(e.response.answerCorrect).toBe(false);
  });
});

describe('create-auth-challenge (C1 fail closed)', () => {
  const make = (userName: string | undefined = 'user-uuid-1') =>
    ({ userName, request: {}, response: {} }) as any;

  beforeEach(() => sendMock.mockReset());

  it('emits an unsatisfiable random pin when there is no userName', async () => {
    const e = await run(create, make(''));
    expect(e.response.privateChallengeParameters.pin).toMatch(HEX64);
    expect(sendMock).not.toHaveBeenCalled();
  });

  it('emits the seeded pin on a valid row and consumes it', async () => {
    sendMock.mockResolvedValueOnce({ Attributes: { auth_pin: 'realpin', ttl: Math.floor(Date.now() / 1000) + 100 } });
    const e = await run(create, make());
    expect(e.response.privateChallengeParameters.pin).toBe('realpin');
    expect(sendMock).toHaveBeenCalledTimes(1); // delete-on-read, keyed by event.userName
  });

  it('fails closed (random pin) when the row is missing', async () => {
    sendMock.mockResolvedValueOnce({});
    const e = await run(create, make());
    expect(e.response.privateChallengeParameters.pin).toMatch(HEX64);
    expect(e.response.privateChallengeParameters.pin).not.toBe('realpin');
  });

  it('fails closed (random pin) when the row is expired', async () => {
    sendMock.mockResolvedValueOnce({ Attributes: { auth_pin: 'realpin', ttl: Math.floor(Date.now() / 1000) - 1 } });
    const e = await run(create, make());
    expect(e.response.privateChallengeParameters.pin).toMatch(HEX64);
    expect(e.response.privateChallengeParameters.pin).not.toBe('realpin');
  });
});
