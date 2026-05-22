import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables } from './db';
import { HttpError } from './auth';

export async function requireMembership(userId: string, orgId: string): Promise<{ role: string }> {
  const res = await ddb.send(
    new GetCommand({
      TableName: tables.memberships,
      Key: { userId, orgId },
    }),
  );
  if (!res.Item) throw new HttpError(403, 'forbidden', 'Not a member of this organization');
  return { role: res.Item.role as string };
}

export async function membershipsForUser(userId: string): Promise<Array<{ orgId: string; role: string; createdAt: string }>> {
  const { QueryCommand } = await import('@aws-sdk/lib-dynamodb');
  const res = await ddb.send(
    new QueryCommand({
      TableName: tables.memberships,
      KeyConditionExpression: 'userId = :u',
      ExpressionAttributeValues: { ':u': userId },
    }),
  );
  return (res.Items ?? []) as Array<{ orgId: string; role: string; createdAt: string }>;
}
