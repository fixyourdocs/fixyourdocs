import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables } from './db';

// Per-IP token bucket for POST /v1/reports. The plan calls for 10 req/s
// sustained, 100 burst.
//
// Implemented as read-then-conditional-update because DynamoDB's
// UpdateExpression grammar does not support `*` (multiplication) — only
// `+` and `-`. So we compute `min(cap, prev + rate * elapsed)` on the
// application side and persist it with an optimistic-concurrency
// condition on `lastRefillAt`. If two requests race, one wins and the
// other fails closed (returns false → 429); the loser's tokens are not
// consumed.

const BURST_CAPACITY = 100;
const REFILL_PER_SEC = 10;
const TTL_SECONDS = 60;

export interface RateLimitOptions {
  capacity?: number;
  refillPerSec?: number;
  ttlSeconds?: number;
  now?: number;
  keyPrefix?: string; // defaults to 'ip'
}

export async function checkAndConsume(
  rawKey: string,
  opts: RateLimitOptions = {},
): Promise<boolean> {
  const capacity = opts.capacity ?? BURST_CAPACITY;
  const refillPerSec = opts.refillPerSec ?? REFILL_PER_SEC;
  const ttlSeconds = opts.ttlSeconds ?? TTL_SECONDS;
  const now = opts.now ?? Math.floor(Date.now() / 1000);
  const bucketKey = `${opts.keyPrefix ?? 'ip'}:${rawKey}`;

  const current = await ddb.send(
    new GetCommand({
      TableName: tables.rateLimit,
      Key: { bucketKey },
      ConsistentRead: true,
    }),
  );
  const prevTokens = (current.Item?.tokens as number | undefined) ?? capacity;
  const prevRefillAt = (current.Item?.lastRefillAt as number | undefined) ?? now;
  const elapsed = Math.max(0, now - prevRefillAt);
  const refilled = Math.min(capacity, prevTokens + refillPerSec * elapsed);

  if (refilled < 1) {
    return false;
  }

  try {
    await ddb.send(
      new UpdateCommand({
        TableName: tables.rateLimit,
        Key: { bucketKey },
        UpdateExpression:
          'SET tokens = :newTokens, lastRefillAt = :now, expiresAt = :exp',
        ConditionExpression:
          'attribute_not_exists(lastRefillAt) OR lastRefillAt = :prevRefillAt',
        ExpressionAttributeValues: {
          ':newTokens': refilled - 1,
          ':now': now,
          ':exp': now + ttlSeconds,
          ':prevRefillAt': prevRefillAt,
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
