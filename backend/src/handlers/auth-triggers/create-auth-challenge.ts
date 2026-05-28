import { randomBytes } from 'node:crypto';
import type { CreateAuthChallengeTriggerHandler } from 'aws-lambda';
import { DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables } from '../../lib/db';
import { pinKey } from '../../lib/oauth-state';

// Issues the CUSTOM_CHALLENGE pin for the "Sign in with GitHub" path (P3-08).
//
// The real pin was written to `OAuthState` by auth/callback.ts — keyed by
// (cognito username, flow_id) — immediately before AdminInitiateAuth.
//
// Fail closed (finding C1): if there is no valid, unexpired pin row, set an
// unguessable random pin that is NEVER shared with anyone, so the challenge is
// unanswerable and the attempt fails. Never emit an empty or absent pin.
export const handler: CreateAuthChallengeTriggerHandler = async (event) => {
  event.response.publicChallengeParameters = {};
  event.response.challengeMetadata = 'GITHUB_OAUTH';

  const unsatisfiable = () => {
    event.response.privateChallengeParameters = { pin: randomBytes(32).toString('hex') };
    return event;
  };

  const flowId = event.request.clientMetadata?.flow_id;
  if (!flowId) return unsatisfiable();

  // Consume the pin delete-on-read so it can never be replayed.
  const consumed = await ddb.send(
    new DeleteCommand({
      TableName: tables.oauthState,
      Key: { pk: pinKey(event.userName, flowId) },
      ReturnValues: 'ALL_OLD',
    }),
  );
  const row = consumed.Attributes;
  const pin = row?.auth_pin as string | undefined;
  const now = Math.floor(Date.now() / 1000);
  const expired = typeof row?.ttl === 'number' && row.ttl <= now;
  if (!row || !pin || expired) return unsatisfiable();

  event.response.privateChallengeParameters = { pin };
  return event;
};
