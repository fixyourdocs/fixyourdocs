// Key builders for the single `OAuthState` table. It holds three short-lived
// record types, distinguished by a prefix on the `pk` partition key:
//
//   state#<nonce>     CSRF state + browser-binding nonce (auth/start.ts),
//                     consumed delete-on-read by auth/callback.ts.
//   pin#<flowId>      one-time CUSTOM_AUTH pin, written by callback.ts and
//                     consumed delete-on-read by create-auth-challenge.ts.
//   handoff#<code>    Cognito tokens awaiting the SPA exchange, written by
//                     callback.ts and consumed delete-on-read by exchange.ts.
//
// The pin is keyed by `flow_id` ALONE (a ulid unique to this sign-in), NOT by
// username: Cognito resolves an alias USERNAME to the real (UUID) username
// before invoking the trigger, so `event.userName` in create-auth-challenge
// differs from the value the callback used — keying by flow_id sidesteps that
// entirely. flow_id is just a lookup key; the pin secret + fail-closed logic
// are what make the challenge safe.
export const stateKey = (nonce: string): string => `state#${nonce}`;
export const pinKey = (flowId: string): string => `pin#${flowId}`;
export const handoffKey = (code: string): string => `handoff#${code}`;
