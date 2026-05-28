import type { DefineAuthChallengeTriggerHandler } from 'aws-lambda';

// CUSTOM_AUTH orchestration for the "Sign in with GitHub" path (P3-08).
//
// Fail closed (finding C1). The backend has already proven the user's
// identity through the GitHub OAuth dance and seeded a single-use pin, so the
// ONLY acceptable success is exactly one CUSTOM_CHALLENGE answered correctly.
// Anything else fails authentication with no retries — an anonymous
// InitiateAuth(CUSTOM_AUTH) for some username must never obtain tokens.
export const handler: DefineAuthChallengeTriggerHandler = async (event) => {
  const { session } = event.request;

  // First call: ask for the one custom challenge.
  if (session.length === 0) {
    event.response.issueTokens = false;
    event.response.failAuthentication = false;
    event.response.challengeName = 'CUSTOM_CHALLENGE';
    return event;
  }

  // Exactly one correctly-answered custom challenge → issue tokens.
  if (
    session.length === 1 &&
    session[0]?.challengeName === 'CUSTOM_CHALLENGE' &&
    session[0]?.challengeResult === true
  ) {
    event.response.issueTokens = true;
    event.response.failAuthentication = false;
    return event;
  }

  // Wrong answer, or more than one attempt seen → fail closed.
  event.response.issueTokens = false;
  event.response.failAuthentication = true;
  return event;
};
