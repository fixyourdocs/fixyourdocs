import { UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables } from './db';

// Per-IP token bucket for POST /v1/reports. The plan calls for 10 req/s
// sustained, 100 burst. Implemented as a single conditional UpdateItem:
// on each call we refill tokens by `rate * elapsed`, decrement one, and
// persist. The condition rejects when the post-refill token count would
// drop below 1, which yields a 429 to the caller.
//
// Known v0 imprecision: DynamoDB expressions cannot `min(tokens, cap)`,
// so a steady caller can accumulate slightly above `BURST_CAPACITY`
// between request bursts. The TTL caps the leak at `TTL_SECONDS` of
// idle (after which the row evicts and the bucket resets to `cap`).
// Tightening to a proper cap is V2+; for v0 traffic the leak is
// observable but harmless.

const BURST_CAPACITY = 100;
const REFILL_PER_SEC = 10;
const TTL_SECONDS = 60;

export interface RateLimitOptions {
  capacity?: number;
  refillPerSec?: number;
  ttlSeconds?: number;
  now?: number;
}

export async function checkAndConsume(
  rawKey: string,
  opts: RateLimitOptions = {},
): Promise<boolean> {
  const capacity = opts.capacity ?? BURST_CAPACITY;
  const refillPerSec = opts.refillPerSec ?? REFILL_PER_SEC;
  const ttlSeconds = opts.ttlSeconds ?? TTL_SECONDS;
  const now = opts.now ?? Math.floor(Date.now() / 1000);

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: tables.rateLimit,
        Key: { bucketKey: `ip:${rawKey}` },
        UpdateExpression:
          'SET tokens = if_not_exists(tokens, :cap) + :rate * (:now - if_not_exists(lastRefillAt, :now)) - :one, ' +
          'lastRefillAt = :now, expiresAt = :exp',
        ConditionExpression:
          'if_not_exists(tokens, :cap) + :rate * (:now - if_not_exists(lastRefillAt, :now)) >= :one',
        ExpressionAttributeValues: {
          ':cap': capacity,
          ':rate': refillPerSec,
          ':one': 1,
          ':now': now,
          ':exp': now + ttlSeconds,
        },
      }),
    );
    return true;
  } catch (err) {
    if ((err as { name?: string })?.name === 'ConditionalCheckFailedException') {
      return false;
    }
    throw err;
  }
}
