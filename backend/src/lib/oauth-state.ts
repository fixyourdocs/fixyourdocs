// Key builders for the single `OAuthState` table. It holds three short-lived
// record types, distinguished by a prefix on the `pk` partition key:
//
//   state#<nonce>     CSRF state + browser-binding nonce (auth/start.ts),
//                     consumed delete-on-read by auth/callback.ts.
//   pin#<username>    one-time CUSTOM_AUTH pin, written by callback.ts and
//                     consumed delete-on-read by create-auth-challenge.ts.
//   handoff#<code>    Cognito tokens awaiting the SPA exchange, written by
//                     callback.ts and consumed delete-on-read by exchange.ts.
//
// The pin is keyed by the Cognito **username** (the real UUID, not the email
// alias). The callback passes that exact username as AdminInitiateAuth's
// USERNAME, so the CreateAuthChallenge trigger sees the same value in
// `event.userName`. We deliberately do NOT key by a flow_id carried in
// ClientMetadata: Cognito does not propagate AdminInitiateAuth ClientMetadata
// to the CreateAuthChallenge trigger, so it arrives empty there. The pin
// secret + fail-closed logic are the security boundary; the key is just a
// per-user lookup (single-use, delete-on-read, short TTL).
export const stateKey = (nonce: string): string => `state#${nonce}`;
export const pinKey = (username: string): string => `pin#${username}`;
export const handoffKey = (code: string): string => `handoff#${code}`;
