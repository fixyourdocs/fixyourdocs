import type { APIGatewayProxyHandlerV2, APIGatewayProxyResultV2 } from 'aws-lambda';
import { createHmac } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import {
  DynamoDBDocumentClient,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { SSMClient, GetParameterCommand } from '@aws-sdk/client-ssm';
import { ulid } from 'ulid';
import { z } from 'zod';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({}), {
  marshallOptions: { removeUndefinedValues: true },
});
const ssm = new SSMClient({});

const TABLES = {
  domains: process.env.DOMAINS_TABLE!,
  reports: process.env.REPORTS_TABLE!,
  rateLimit: process.env.RATE_LIMIT_TABLE!,
};
const ROOT_DOMAIN = process.env.ROOT_DOMAIN ?? 'fixyourdocs.org';
const APP_BASE_URL = process.env.APP_BASE_URL ?? `https://${ROOT_DOMAIN}`;
const IP_HASH_SALT_PARAM = process.env.IP_HASH_SALT_PARAM!;

const RATE_LIMIT_PER_HOUR = 10;

let cachedSalt: string | null = null;
async function getSalt(): Promise<string> {
  if (cachedSalt) return cachedSalt;
  const res = await ssm.send(
    new GetParameterCommand({ Name: IP_HASH_SALT_PARAM, WithDecryption: true }),
  );
  cachedSalt = res.Parameter?.Value ?? 'fallback-salt';
  return cachedSalt;
}

function hashIp(ip: string, salt: string): string {
  return createHmac('sha256', salt).update(ip).digest('hex').slice(0, 32);
}

const hostnameRegex = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
const domainSchema = z
  .string()
  .min(3)
  .max(253)
  .transform((s) => s.toLowerCase().trim().replace(/\.$/, ''))
  .refine((s) => hostnameRegex.test(s), 'invalid domain');

const issueTypes = ['gap', 'outdated', 'contradiction', 'dead_end', 'broken_link', 'other'] as const;
const fileReportSchema = z.object({
  domain: domainSchema,
  url: z.string().url().max(2048),
  issueType: z.enum(issueTypes),
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(4000),
  evidence: z.string().max(8000).optional(),
});

const listReportsSchema = z.object({
  domain: domainSchema,
  status: z.enum(['open', 'acknowledged', 'fixed', 'wontfix', 'duplicate']).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

function urlMatchesDomain(url: string, domain: string): boolean {
  try {
    const u = new URL(url);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return false;
    const host = u.hostname.toLowerCase();
    return host === domain || host.endsWith('.' + domain);
  } catch {
    return false;
  }
}

const SERVER_INFO = {
  name: 'fixyourdocs',
  version: '1.0.0',
  description: 'File and list documentation issues for any registered docs domain.',
};

const TOOLS = [
  {
    name: 'file_report',
    description:
      'File a documentation issue report. Use when docs are wrong, outdated, missing a step, contradictory, or lead to a dead end. Call list_reports first to avoid duplicates.',
    inputSchema: {
      type: 'object',
      required: ['domain', 'url', 'issueType', 'title', 'description'],
      properties: {
        domain: { type: 'string', description: 'The docs domain, e.g. docs.acme.com' },
        url: { type: 'string', format: 'uri', description: 'Specific page where the issue was hit' },
        issueType: { type: 'string', enum: issueTypes as unknown as string[] },
        title: { type: 'string', maxLength: 120 },
        description: { type: 'string', maxLength: 4000 },
        evidence: { type: 'string', maxLength: 8000 },
      },
      additionalProperties: false,
    },
  },
  {
    name: 'list_reports',
    description:
      'List reports already filed for a documentation domain. Call before file_report to avoid duplicates.',
    inputSchema: {
      type: 'object',
      required: ['domain'],
      properties: {
        domain: { type: 'string' },
        status: { type: 'string', enum: ['open', 'acknowledged', 'fixed', 'wontfix', 'duplicate'] },
        limit: { type: 'integer', minimum: 1, maximum: 50, default: 20 },
      },
      additionalProperties: false,
    },
  },
];

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: any;
}

function rpcResult(id: any, result: any) {
  return { jsonrpc: '2.0', id, result };
}

function rpcError(id: any, code: number, message: string, data?: any) {
  return { jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } };
}

function toolError(message: string, structuredContent?: any) {
  return {
    content: [{ type: 'text', text: message }],
    isError: true,
    ...(structuredContent ? { structuredContent } : {}),
  };
}

function toolOk(text: string, structuredContent?: any) {
  return {
    content: [{ type: 'text', text }],
    ...(structuredContent ? { structuredContent } : {}),
  };
}

async function checkRateLimit(ipHash: string, domain: string): Promise<boolean> {
  const bucket = Math.floor(Date.now() / 3600_000);
  const bucketKey = `mcp:file:${ipHash}:${domain}:${bucket}`;
  const expiresAt = Math.floor(Date.now() / 1000) + 2 * 3600;
  const res = await ddb.send(
    new UpdateCommand({
      TableName: TABLES.rateLimit,
      Key: { bucketKey },
      UpdateExpression: 'SET expiresAt = if_not_exists(expiresAt, :ex) ADD #c :one',
      ExpressionAttributeNames: { '#c': 'count' },
      ExpressionAttributeValues: { ':one': 1, ':ex': expiresAt },
      ReturnValues: 'ALL_NEW',
    }),
  );
  const count = Number(res.Attributes?.count ?? 1);
  return count <= RATE_LIMIT_PER_HOUR;
}

async function findRecentDuplicate(domain: string, url: string, issueType: string) {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const res = await ddb.send(
    new QueryCommand({
      TableName: TABLES.reports,
      IndexName: 'status-index',
      KeyConditionExpression: '#d = :d AND begins_with(statusCreatedAt, :s)',
      ExpressionAttributeNames: { '#d': 'domain' },
      ExpressionAttributeValues: { ':d': domain, ':s': 'open#' },
      ScanIndexForward: false,
      Limit: 50,
    }),
  );
  return (res.Items ?? []).find(
    (r) => r.url === url && r.issueType === issueType && r.createdAt >= since,
  );
}

async function handleFileReport(args: unknown, ipHash: string) {
  const parsed = fileReportSchema.safeParse(args);
  if (!parsed.success) {
    return toolError(`Invalid arguments: ${parsed.error.issues[0]?.message}`);
  }
  const input = parsed.data;

  if (!urlMatchesDomain(input.url, input.domain)) {
    return toolError(
      `url host does not match domain "${input.domain}". The url must be on that domain or a subdomain.`,
      { code: 'url_outside_domain' },
    );
  }

  const domRes = await ddb.send(new GetCommand({ TableName: TABLES.domains, Key: { domain: input.domain } }));
  if (!domRes.Item || domRes.Item.status !== 'verified') {
    return toolError(
      `Domain "${input.domain}" is not registered or verified on FixYourDocs. Nothing was filed. Visit ${APP_BASE_URL} for the owner to claim it.`,
      { code: 'domain_not_registered' },
    );
  }

  const allowed = await checkRateLimit(ipHash, input.domain);
  if (!allowed) {
    return toolError(
      `Rate limit exceeded: max ${RATE_LIMIT_PER_HOUR} reports per hour per source per domain. Try again later.`,
      { code: 'rate_limited' },
    );
  }

  const dup = await findRecentDuplicate(input.domain, input.url, input.issueType);
  if (dup) {
    return toolError(
      `A similar open report already exists (id: ${dup.reportId}). Consider adding evidence to that one instead.`,
      { code: 'duplicate_suspected', existingReportId: dup.reportId },
    );
  }

  const reportId = ulid();
  const createdAt = new Date().toISOString();
  await ddb.send(
    new PutCommand({
      TableName: TABLES.reports,
      Item: {
        domain: input.domain,
        reportId,
        orgId: domRes.Item.orgId,
        status: 'open',
        statusCreatedAt: `open#${createdAt}`,
        issueType: input.issueType,
        url: input.url,
        title: input.title,
        description: input.description,
        evidence: input.evidence,
        submitterIp: ipHash,
        createdAt,
        updatedAt: createdAt,
      },
    }),
  );

  const publicUrl = `${APP_BASE_URL}/r/${input.domain}/${reportId}`;
  return toolOk(
    `Filed report ${reportId} for ${input.domain}. View at ${publicUrl}`,
    { reportId, domain: input.domain, status: 'open', url: publicUrl },
  );
}

async function handleListReports(args: unknown) {
  const parsed = listReportsSchema.safeParse(args);
  if (!parsed.success) {
    return toolError(`Invalid arguments: ${parsed.error.issues[0]?.message}`);
  }
  const { domain, status, limit = 20 } = parsed.data;

  let res;
  if (status) {
    res = await ddb.send(
      new QueryCommand({
        TableName: TABLES.reports,
        IndexName: 'status-index',
        KeyConditionExpression: '#d = :d AND begins_with(statusCreatedAt, :s)',
        ExpressionAttributeNames: { '#d': 'domain' },
        ExpressionAttributeValues: { ':d': domain, ':s': `${status}#` },
        ScanIndexForward: false,
        Limit: limit,
      }),
    );
  } else {
    res = await ddb.send(
      new QueryCommand({
        TableName: TABLES.reports,
        KeyConditionExpression: '#d = :d',
        FilterExpression: '#s <> :spam',
        ExpressionAttributeNames: { '#d': 'domain', '#s': 'status' },
        ExpressionAttributeValues: { ':d': domain, ':spam': 'spam' },
        ScanIndexForward: false,
        Limit: limit,
      }),
    );
  }

  const reports = (res.Items ?? []).map((r) => ({
    reportId: r.reportId,
    status: r.status,
    issueType: r.issueType,
    url: r.url,
    title: r.title,
    createdAt: r.createdAt,
  }));

  return toolOk(`Found ${reports.length} report(s) for ${domain}.`, { domain, reports });
}

async function dispatch(req: JsonRpcRequest, sourceIp: string) {
  if (req.method === 'initialize') {
    return rpcResult(req.id, {
      protocolVersion: '2025-06-18',
      capabilities: { tools: { listChanged: false } },
      serverInfo: SERVER_INFO,
      instructions:
        'Use list_reports first to check for duplicates before calling file_report. Only file reports for issues you actually encountered while helping a user.',
    });
  }
  if (req.method === 'notifications/initialized') {
    return null; // notifications have no response
  }
  if (req.method === 'ping') {
    return rpcResult(req.id, {});
  }
  if (req.method === 'tools/list') {
    return rpcResult(req.id, { tools: TOOLS });
  }
  if (req.method === 'tools/call') {
    const { name, arguments: args } = req.params ?? {};
    const salt = await getSalt();
    const ipHash = hashIp(sourceIp, salt);
    if (name === 'file_report') return rpcResult(req.id, await handleFileReport(args, ipHash));
    if (name === 'list_reports') return rpcResult(req.id, await handleListReports(args));
    return rpcError(req.id, -32601, `Unknown tool: ${name}`);
  }
  return rpcError(req.id, -32601, `Unknown method: ${req.method}`);
}

const headers = {
  'content-type': 'application/json',
  'access-control-allow-origin': '*',
};

export const handler: APIGatewayProxyHandlerV2 = async (event): Promise<APIGatewayProxyResultV2> => {
  if (event.requestContext.http.method !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'method_not_allowed' }) };
  }
  const sourceIp = (event.requestContext.http.sourceIp ?? '0.0.0.0').toString();

  let body: any;
  try {
    body = event.body ? JSON.parse(event.body) : null;
  } catch {
    return { statusCode: 400, headers, body: JSON.stringify(rpcError(null, -32700, 'Parse error')) };
  }
  if (!body) {
    return { statusCode: 400, headers, body: JSON.stringify(rpcError(null, -32600, 'Empty body')) };
  }

  try {
    if (Array.isArray(body)) {
      const responses = (
        await Promise.all(body.map((r) => dispatch(r, sourceIp)))
      ).filter((r) => r != null);
      return { statusCode: 200, headers, body: JSON.stringify(responses) };
    }
    const response = await dispatch(body, sourceIp);
    if (response == null) return { statusCode: 202, headers, body: '' };
    return { statusCode: 200, headers, body: JSON.stringify(response) };
  } catch (err: any) {
    console.error('MCP error', err);
    return { statusCode: 500, headers, body: JSON.stringify(rpcError(body?.id ?? null, -32603, 'Internal error')) };
  }
};
