import { timingSafeEqual } from 'node:crypto';
import type { VerifyAuthChallengeResponseTriggerHandler } from 'aws-lambda';

// Constant-time pin check for the "Sign in with GitHub" path (P3-08, finding C1).
export const handler: VerifyAuthChallengeResponseTriggerHandler = async (event) => {
  const expected = event.request.privateChallengeParameters?.pin;
  const answer = event.request.challengeAnswer;

  // Reject empties first — an empty/absent pin must never compare equal.
  if (!expected || !answer) {
    event.response.answerCorrect = false;
    return event;
  }

  const a = Buffer.from(expected);
  const b = Buffer.from(answer);
  // timingSafeEqual throws on unequal lengths, so length-gate first; the length
  // check is not itself secret (the pin length is fixed).
  event.response.answerCorrect = a.length === b.length && timingSafeEqual(a, b);
  return event;
};
