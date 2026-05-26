import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';
import { PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { ddb, tables } from '../../lib/db';
import { fileReportSchema } from '../../lib/validation';
import { newId, nowIso } from '../../lib/ids';
import { publicError, publicJson } from '../../lib/response';
import { wrapPublic } from '../../lib/wrap';
import { computeDedupKey } from '../../lib/dedup';
import { checkAndConsume } from '../../lib/rate-limit';

const lambdaClient = new LambdaClient({});

export const handler: APIGatewayProxyHandlerV2 = wrapPublic(async (event) => {
  // Step 7 — per-IP token bucket on the public POST endpoint.
  const ip = event.requestContext.http.sourceIp;
  const allowed = await checkAndConsume(ip);
  if (!allowed) {
    return publicError('rate_limited', 'Too many requests', 429);
  }

  // Step 2 — parse + validate.
  let raw: unknown;
  if (!event.body) {
    return publicError('invalid_body', 'Missing request body', 400);
  }
  try {
    raw = JSON.parse(event.body);
  } catch {
    return publicError('invalid_json', 'Request body is not valid JSON', 400);
  }

  const parsed = fileReportSchema.safeParse(raw);
  if (!parsed.success) {
    return publicJson(400, {
      error: {
        code: 'schema_violation',
        message: 'Request does not match the v0 report schema',
        issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })),
      },
    });
  }
  const report = parsed.data;

  // Step 3 — dedup. Same (doc_url, summary, agent, day) collapses to one id.
  const dedupKey = computeDedupKey(report);
  const existing = await ddb.send(
    new QueryCommand({
      TableName: tables.reports,
      IndexName: 'dedup-index',
      KeyConditionExpression: 'dedupKey = :k',
      ExpressionAttributeValues: { ':k': dedupKey },
      Limit: 1,
    }),
  );
  if (existing.Items && existing.Items.length > 0) {
    const existingId = existing.Items[0]!.reportId as string;
    const existingCreatedAt = existing.Items[0]!.createdAt as string;
    // Protocol v0 §7.2: duplicates return 200 OK with the SAME id and the
    // SAME received_at as the original submission. The dedup-index GSI is
    // KEYS_ONLY but includes createdAt as the range key, so it's available
    // without a follow-up GetItem.
    return publicJson(200, {
      id: existingId,
      received_at: existingCreatedAt,
      protocol_version: '0',
      server_capabilities: [],
      deduplicated: true,
    });
  }

  // Persist.
  const reportId = newId();
  const createdAt = nowIso();
  await ddb.send(
    new PutCommand({
      TableName: tables.reports,
      Item: {
        reportId,
        dedupKey,
        createdAt,
        docUrl: report.doc_url,
        agentName: report.agent.name,
        kind: report.report.kind,
        summary: report.report.summary,
        details: report.report.details ?? null,
      },
      ConditionExpression: 'attribute_not_exists(reportId)',
    }),
  );

  // Step 6 (stub today, full impl in Step 6) — async-invoke the forwarder.
  // Fire-and-forget: we want the POST to return quickly; the forwarder is
  // idempotent on report_id and CloudWatch tracks invocation failures.
  const forwarderName = process.env.FORWARDER_FN_NAME;
  if (forwarderName) {
    try {
      await lambdaClient.send(
        new InvokeCommand({
          FunctionName: forwarderName,
          InvocationType: 'Event',
          Payload: Buffer.from(JSON.stringify({ report_id: reportId })),
        }),
      );
    } catch (err) {
      // Don't fail the POST if the async-invoke itself fails — the row is
      // persisted and an operator can replay from the reports table.
      console.error('forwarder_async_invoke_failed', { reportId, err: (err as Error).message });
    }
  }

  // Protocol v0 §7.2: 201 Created body MUST include id + received_at (RFC
  // 3339) + protocol_version + server_capabilities. createdAt is already
  // produced via new Date().toISOString() which is RFC 3339 compliant.
  return publicJson(201, {
    id: reportId,
    received_at: createdAt,
    protocol_version: '0',
    server_capabilities: [],
  });
});
