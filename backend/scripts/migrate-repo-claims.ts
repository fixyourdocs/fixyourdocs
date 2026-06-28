/**
 * One-off, idempotent migration onto the repo-centric model. Dry-run by default;
 * set APPLY=1 to write. Env-driven (no hard-coded region or table names) so it
 * runs against any operator's tables — this is the documented upgrade path.
 *
 *   INTEGRATIONS_TABLE=… DOMAINS_TABLE=… REPOS_TABLE=… AWS_REGION=… \
 *     [APPLY=1] npx tsx backend/scripts/migrate-repo-claims.ts
 *
 * It does two things:
 *   1. each `configured` integration → a verified Repos row;
 *   2. each verified DNS domain with no attached repo → attach the owner's repo.
 * Stored Pages claims are left dormant (Pages is auto-derived now). Conditional
 * writes make re-runs safe.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient, ScanCommand, PutCommand, UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { repoKey } from '../src/lib/repos';

const { INTEGRATIONS_TABLE, DOMAINS_TABLE, REPOS_TABLE } = process.env;
if (!INTEGRATIONS_TABLE || !DOMAINS_TABLE || !REPOS_TABLE) {
  console.error('Set INTEGRATIONS_TABLE, DOMAINS_TABLE and REPOS_TABLE env vars.');
  process.exit(1);
}
const apply = process.env.APPLY === '1';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const nowIso = () => new Date().toISOString();
const isCondFail = (e: unknown) => (e as { name?: string }).name === 'ConditionalCheckFailedException';

interface Row { [k: string]: unknown }

async function scanAll(table: string): Promise<Row[]> {
  const items: Row[] = [];
  let ExclusiveStartKey: Record<string, unknown> | undefined;
  do {
    const res = await ddb.send(new ScanCommand({ TableName: table, ExclusiveStartKey }));
    items.push(...((res.Items as Row[]) ?? []));
    ExclusiveStartKey = res.LastEvaluatedKey;
  } while (ExclusiveStartKey);
  return items;
}

async function main(): Promise<void> {
  console.log(apply ? 'APPLY — writing changes' : 'DRY RUN — no writes (set APPLY=1 to write)');

  const integrations = await scanAll(INTEGRATIONS_TABLE!);
  const byUser = new Map<string, Row>();
  for (const i of integrations) byUser.set(i.userId as string, i);

  // 1. integration → repo claim (skip if it already exists)
  let created = 0;
  let skipped = 0;
  for (const i of integrations) {
    if (i.status !== 'configured' || !i.repoOwner || !i.repoName || !i.issueTemplate) continue;
    const key = repoKey(i.repoOwner as string, i.repoName as string);
    if (!apply) {
      console.log(`repo + ${key} (user ${i.userId})`);
      created += 1;
      continue;
    }
    try {
      await ddb.send(new PutCommand({
        TableName: REPOS_TABLE,
        Item: {
          repo: key, userId: i.userId, status: 'verified', createdAt: nowIso(), verifiedAt: nowIso(),
          repoOwner: i.repoOwner, repoName: i.repoName, issueTemplate: i.issueTemplate,
        },
        ConditionExpression: 'attribute_not_exists(#r)',
        ExpressionAttributeNames: { '#r': 'repo' },
      }));
      created += 1;
    } catch (err) {
      if (isCondFail(err)) skipped += 1;
      else throw err;
    }
  }

  // 2. verified DNS domain with no repo → attach the owner's repo (skip Pages,
  // skip an already-attached domain)
  const domains = await scanAll(DOMAINS_TABLE!);
  let attached = 0;
  let domSkipped = 0;
  for (const d of domains) {
    if (d.status !== 'verified' || d.kind === 'pages' || String(d.domain).startsWith('pages:')) continue;
    if (d.repoOwner) { domSkipped += 1; continue; }
    const i = byUser.get(d.userId as string);
    if (!i?.repoOwner || !i?.repoName) { domSkipped += 1; continue; }
    if (!apply) {
      console.log(`attach ${d.domain} → ${i.repoOwner}/${i.repoName}`);
      attached += 1;
      continue;
    }
    try {
      await ddb.send(new UpdateCommand({
        TableName: DOMAINS_TABLE,
        Key: { domain: d.domain },
        UpdateExpression: 'SET repoOwner = :o, repoName = :r',
        ConditionExpression: 'attribute_exists(#d) AND attribute_not_exists(repoOwner)',
        ExpressionAttributeNames: { '#d': 'domain' },
        ExpressionAttributeValues: { ':o': i.repoOwner, ':r': i.repoName },
      }));
      attached += 1;
    } catch (err) {
      if (isCondFail(err)) domSkipped += 1;
      else throw err;
    }
  }

  console.log(`repos:   ${created} ${apply ? 'created' : 'to create'}, ${skipped} skipped (already exist)`);
  console.log(`domains: ${attached} ${apply ? 'attached' : 'to attach'}, ${domSkipped} skipped`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
