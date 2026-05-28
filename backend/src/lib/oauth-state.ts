// Key builders for the single `OAuthState` table. It holds three short-lived
// record types, distinguished by a prefix on the `pk` partition key:
//
//   state#<nonce>            CSRF state + browser-binding nonce (auth/start.ts),
//                            consumed delete-on-read by auth/callback.ts.
//   pin#<username>#<flowId>  one-time CUSTOM_AUTH pin, written by callback.ts
//                            and consumed delete-on-read by create-auth-challenge.ts.
//   handoff#<code>           Cognito tokens awaiting the SPA exchange, written by
//                            callback.ts and consumed delete-on-read by exchange.ts.
//
// create-auth-challenge.ts only knows (userName, flow_id) — never the `state`
// nonce — so the pin must be addressable by that pair, hence the prefixed
// single-table layout rather than a single `state`-keyed row.
export const stateKey = (nonce: string): string => `state#${nonce}`;
export const pinKey = (username: string, flowId: string): string => `pin#${username}#${flowId}`;
export const handoffKey = (code: string): string => `handoff#${code}`;
