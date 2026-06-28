import type { Handler } from 'aws-lambda';
import { GetCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, tables } from '../../lib/db';
import { nowIso } from '../../lib/ids';
import { resolveTargetForReport } from '../../lib/integrations';
import { installationToken, createIssue } from '../../lib/github-app';
import { renderIssue } from '../../lib/issue-template';
import { checkAndConsume } from '../../lib/rate-limit';

interface ForwarderEvent {
  report_id: string; // file-report.ts async-invokes with exactly this (6g)
}

const LEASE_SECONDS = 300;

async function setStatus(reportId: string, status: string): Promise<void> {
  await ddb.send(new UpdateCommand({
    TableName: tables.reports,
    Key: { reportId },
    UpdateExpression: 'SET forwardStatus = :s',
    ExpressionAttributeValues: { ':s': status },
  }));
}

// P0-08 Step 6. Turn an accepted report into a GitHub Issue on the repo owned
// by the maintainer who DNS-verified the doc_url's host. Idempotent on
// report_id; no verified domain → no Issue.
export const handler: Handler<ForwarderEvent, { ok: boolean; reason?: string }> = async (event) => {
  const { report_id } = event;

  // 1. Load the report (file-report stored docUrl/summary/details/kind/agentName).
  const got = await ddb.send(new GetCommand({ TableName: tables.reports, Key: { reportId: report_id } }));
  const report = got.Item;
  if (!report) {
    console.log('forward_skip', { report_id, reason: 'report_not_found' });
    return { ok: false, reason: 'report_not_found' };
  }
  if (report.forwardStatus === 'forwarded') return { ok: true, reason: 'already_forwarded' };

  // 2. Resolve the doc_url to the repo it's about. No claim → no Issue.
  const target = await resolveTargetForReport(report.docUrl as string);
  if (!target) {
    console.log('no_route', { report_id, docUrl: report.docUrl });
    return { ok: false, reason: 'no_route' };
  }

  // 3. Per-owner cap. Tunable; ~30 burst, ~12/min sustained.
  const underCap = await checkAndConsume(target.userId, {
    keyPrefix: 'integration', capacity: 30, refillPerSec: 0.2, ttlSeconds: 3600,
  });
  if (!underCap) {
    await setStatus(report_id, 'deferred');
    console.log('forward_deferred', { report_id, owner: target.userId });
    return { ok: false, reason: 'rate_capped' };
  }

  // 4. (6d) Idempotent claim. Wins iff unset, previously failed/deferred, or the
  // lease is stale. A concurrent invoke / async retry that loses → no-op.
  const now = Math.floor(Date.now() / 1000);
  try {
    await ddb.send(new UpdateCommand({
      TableName: tables.reports,
      Key: { reportId: report_id },
      UpdateExpression: 'SET forwardStatus = :forwarding, forwardLeaseAt = :now',
      ConditionExpression:
        'attribute_not_exists(forwardStatus) OR forwardStatus = :failed '
        + 'OR forwardStatus = :deferred OR forwardLeaseAt < :cutoff',
      ExpressionAttributeValues: {
        ':forwarding': 'forwarding', ':failed': 'failed', ':deferred': 'deferred',
        ':now': now, ':cutoff': now - LEASE_SECONDS,
      },
    }));
  } catch (err) {
    if ((err as { name?: string }).name === 'ConditionalCheckFailedException') {
      return { ok: true, reason: 'claimed_elsewhere' };
    }
    throw err;
  }

  // 5. (6e) Mint a repo-scoped token, render injection-safely, post the Issue.
  let token: string;
  try {
    token = await installationToken(target.installationId, target.repoName);
  } catch {
    await setStatus(report_id, 'failed');
    throw new Error('installation_token_failed'); // async retry + DLQ re-drive
  }

  const { title, body } = renderIssue(target.issueTemplate, {
    summary: report.summary as string,
    details: (report.details as string | null) ?? undefined,
    doc_url: report.docUrl as string,
    agent_name: report.agentName as string,
    report_kind: report.kind as string,
  });

  const issue = await createIssue(token, target.repoOwner, target.repoName, title, body);
  if (!issue) {
    // createIssue returns null on any non-2xx (incl. GitHub rate limit). v0
    // relies on the DLQ + retry to re-drive transient failures.
    await setStatus(report_id, 'failed');
    throw new Error('issue_create_failed');
  }

  await ddb.send(new UpdateCommand({
    TableName: tables.reports,
    Key: { reportId: report_id },
    UpdateExpression:
      'SET forwardStatus = :forwarded, issueNumber = :n, issueUrl = :u, forwardedAt = :t REMOVE forwardLeaseAt',
    ExpressionAttributeValues: {
      ':forwarded': 'forwarded', ':n': issue.number, ':u': issue.htmlUrl, ':t': nowIso(),
    },
  }));

  console.log('forwarded', { report_id, issue: issue.number, owner: target.userId });
  return { ok: true };
};
