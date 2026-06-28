/**
 * P1-16 one-off migration — fold existing single-repo integrations and verified
 * domains onto the repo-centric model.
 *
 *   1. Each `configured` integration (repoOwner/repoName/issueTemplate) → a
 *      `repo:<o>/<r>` claim row in the Domains table (carrying its template).
 *   2. Each verified DNS domain with no repo attached → `repoOwner/repoName`
 *      set to the owner's configured repo, so it points at that repo claim.
 *   3. GitHub Pages (P0-19 `pages:` rows) are left DORMANT: the resolver now
 *      auto-derives Pages from the repo claim, so stored Pages rows are
 *      redundant (harmless; the legacy fallback still reads them).
 *
 * Idempotent: re-running creates nothing new and re-attaches nothing already
 * attached. DRY-RUN by default — set APPLY=1 to actually write.
 *
 * Run from any host/role with read+write on both tables, with the table names
 * and region supplied via env:
 *
 *   INTEGRATIONS_TABLE=<name> DOMAINS_TABLE=<name> AWS_REGION=<region> \
 *     npx tsx backend/scripts/migrate-repo-claims.ts          # dry run
 *   ... APPLY=1 npx tsx backend/scripts/migrate-repo-claims.ts # apply
 *
 * No secrets or table ARNs are hard-coded — table names arrive via env.
 */
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, ScanCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';

const INTEGRATIONS = process.env.INTEGRATIONS_TABLE;
const DOMAINS = process.env.DOMAINS_TABLE;
const APPLY = process.env.APPLY === '1';

if (!INTEGRATIONS || !DOMAINS) {
  console.error('Set INTEGRATIONS_TABLE and DOMAINS_TABLE env vars.');
  process.exit(1);
}

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});

const repoClaimKey = (owner: string, repo: string) => `repo:${owner.toLowerCase()}/${repo.toLowerCase()}`;
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
    const key = repoClaimKey(i.repoOwner, i.repoName);
    const item = {
      domain: key,
      userId: i.userId,
      status: 'verified',
      challengeToken: '',
      createdAt: nowIso(),
      verifiedAt: nowIso(),
      kind: 'repo',
      repoOwner: i.repoOwner,
      repoName: i.repoName,
      issueTemplate: i.issueTemplate,
    };
    console.log(`  repo claim ${key} (user ${i.userId})`);
    if (APPLY) {
      try {
        await ddb.send(new PutCommand({
          TableName: DOMAINS!,
          Item: item,
          ConditionExpression: 'attribute_not_exists(#d)',
          ExpressionAttributeNames: { '#d': 'domain' },
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
