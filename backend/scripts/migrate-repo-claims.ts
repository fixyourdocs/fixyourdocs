/**
 * One-off, idempotent migration onto the repo-centric model:
 *   1. each `configured` integration → a Repos-table claim row;
 *   2. each verified DNS domain with no repo attached → attach the owner's repo.
 * Stored `pages:` rows are left dormant (Pages is now auto-derived). DRY-RUN by
 * default; set APPLY=1 to write. Table names + region come from env:
 *
 *   INTEGRATIONS_TABLE=<name> DOMAINS_TABLE=<name> REPOS_TABLE=<name> \
 *     AWS_REGION=<region> [APPLY=1] npx tsx backend/scripts/migrate-repo-claims.ts
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const INTEGRATIONS = process.env.INTEGRATIONS_TABLE;
const DOMAINS = process.env.DOMAINS_TABLE;
const REPOS = process.env.REPOS_TABLE;
const APPLY = process.env.APPLY === '1';

if (!INTEGRATIONS || !DOMAINS || !REPOS) {
  console.error('Set INTEGRATIONS_TABLE, DOMAINS_TABLE and REPOS_TABLE env vars.');
  process.exit(1);
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const repoKey = (owner: string, repo: string) => `${owner.toLowerCase()}/${repo.toLowerCase()}`;
const nowIso = () => new Date().toISOString();

async function scanAll(table: string): Promise<Record<string, any>[]> {
  const items: Record<string, any>[] = [];
  let ExclusiveStartKey: Record<string, any> | undefined;
  do {
    const res = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey }));
    items.push(...((res.Items as Record<string, any>[]) ?? []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function main() {
  console.log(`migrate-repo-claims — ${APPLY ? 'APPLY' : 'DRY-RUN'}`);

  const integrations = (await scanAll(INTEGRATIONS!)).filter(
    (i) => i.status === 'configured' && i.repoOwner && i.repoName && i.issueTemplate,
  );
  console.log(`configured integrations: ${integrations.length}`);

  // 1. integration → repo claim.
  let claimsCreated = 0;
  for (const i of integrations) {
    const key = repoKey(i.repoOwner, i.repoName);
    const item = {
      repo: key,
      userId: i.userId,
      status: 'verified',
      createdAt: nowIso(),
      verifiedAt: nowIso(),
      repoOwner: i.repoOwner,
      repoName: i.repoName,
      issueTemplate: i.issueTemplate,
    };
    console.log(`  repo claim ${key} (user ${i.userId})`);
    if (APPLY) {
      try {
        await ddb.send(new PutCommand({
          TableName: REPOS!,
          Item: item,
          ConditionExpression: 'attribute_not_exists(#r)',
          ExpressionAttributeNames: { '#r': 'repo' },
        }));
        claimsCreated += 1;
      } catch (err) {
        if ((err as { name?: string }).name !== 'ConditionalCheckFailedException') throw err;
        // Already migrated — idempotent skip.
      }
    }
  }

  // 2. verified DNS domain (no kind, no repo attached) → attach owner's repo.
  const repoByUser = new Map<string, { owner: string; repo: string }>();
  for (const i of integrations) repoByUser.set(i.userId, { owner: i.repoOwner, repo: i.repoName });

  const domains = (await scanAll(DOMAINS!)).filter(
    (d) => !d.kind && d.status === 'verified' && !d.repoOwner && repoByUser.has(d.userId),
  );
  console.log(`verified domains to attach: ${domains.length}`);
  let attached = 0;
  for (const d of domains) {
    const r = repoByUser.get(d.userId)!;
    console.log(`  attach ${d.domain} → ${r.owner}/${r.repo}`);
    if (APPLY) {
      await ddb.send(new UpdateCommand({
        TableName: DOMAINS!,
        Key: { domain: d.domain },
        UpdateExpression: 'SET repoOwner = :o, repoName = :r',
        ConditionExpression: 'attribute_exists(#d) AND attribute_not_exists(repoOwner)',
        ExpressionAttributeNames: { '#d': 'domain' },
        ExpressionAttributeValues: { ':o': r.owner, ':r': r.repo },
      }));
      attached += 1;
    }
  }

  console.log(`done — ${APPLY ? `${claimsCreated} claims created, ${attached} domains attached` : 'dry run, nothing written'}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
