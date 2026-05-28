import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Mocks must be set up before importing the handler. The handler module
// instantiates `new LambdaClient({})` at module load time, so we need a
// stable mock for that too — otherwise the SDK reaches for AWS config at
// import time and crashes the test runner.

vi.mock('../lib/db', () => ({
  ddb: { send: vi.fn() },
  tables: { reports: 'r', integrations: 'i', rateLimit: 'rl' },
}));

vi.mock('../lib/rate-limit', () => ({
  checkAndConsume: vi.fn().mockResolvedValue(true),
}));

// `vi.mock` calls are hoisted to the top of the file. To share a fn between
// the mock factory and the test body, allocate it via `vi.hoisted`.
const { lambdaSendMock } = vi.hoisted(() => ({
  lambdaSendMock: vi.fn().mockResolvedValue({}),
}));

vi.mock('@aws-sdk/client-lambda', () => ({
  LambdaClient: vi.fn().mockImplementation(() => ({ send: lambdaSendMock })),
  InvokeCommand: vi.fn().mockImplementation((input: unknown) => ({ input })),
}));

import { ddb } from '../lib/db';
import { handler } from '../handlers/reports/file-report';

const sendMock = ddb.send as unknown as ReturnType<typeof vi.fn>;

const VALID_BODY = {
  protocol_version: '0',
  doc_url: 'https://docs.example.com/page',
  agent: { name: 'claude-code' },
  report: {
    kind: 'outdated',
    summary: 'Section 3 says X but the CLI rejects X',
  },
};

function makeEvent(body: unknown) {
  return {
    requestContext: {
      requestId: 'test-req',
      http: { method: 'POST', path: '/v1/reports', sourceIp: '1.2.3.4' },
    },
    body: JSON.stringify(body),
  } as any;
}

interface ApiResult {
  statusCode: number;
  headers: Record<string, string>;
  body: string;
}

async function invoke(body: unknown): Promise<ApiResult> {
  return (await (handler as any)(makeEvent(body), {} as any, () => {})) as ApiResult;
}

describe('POST /v1/reports response shape (protocol v0 §7.2)', () => {
  beforeEach(() => {
    sendMock.mockReset();
    lambdaSendMock.mockClear();
  });

  it('returns 201 with id + received_at + protocol_version + server_capabilities on a new submission', async () => {
    // dedup-index Query returns no rows → fresh submission.
    sendMock.mockResolvedValueOnce({ Items: [] });
    // PutCommand persists the new row.
    sendMock.mockResolvedValueOnce({});

    const res = await invoke(VALID_BODY);
    expect(res.statusCode).toBe(201);

    const body = JSON.parse(res.body) as {
      id: unknown;
      received_at: unknown;
      protocol_version: unknown;
      server_capabilities: unknown;
    };

    expect(typeof body.id).toBe('string');
    expect((body.id as string).length).toBeGreaterThan(0);

    expect(typeof body.received_at).toBe('string');
    // RFC 3339 / ISO 8601 with `Z` — must round-trip through Date.
    const parsed = new Date(body.received_at as string);
    expect(Number.isNaN(parsed.getTime())).toBe(false);
    expect(body.received_at).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})$/,
    );

    expect(body.protocol_version).toBe('0');
    expect(Array.isArray(body.server_capabilities)).toBe(true);
  });

  it('returns the SAME id AND the SAME received_at on an idempotent duplicate', async () => {
    // First call: dedup miss + persist.
    sendMock.mockResolvedValueOnce({ Items: [] });
    sendMock.mockResolvedValueOnce({});

    const first = await invoke(VALID_BODY);
    expect(first.statusCode).toBe(201);
    const firstBody = JSON.parse(first.body) as { id: string; received_at: string };

    // Second call: dedup hit. The GSI is KEYS_ONLY but projects reportId
    // (the table's primary key) and createdAt (the GSI range key), so the
    // handler reads both off the existing item.
    sendMock.mockResolvedValueOnce({
      Items: [
        {
          dedupKey: 'whatever',
          reportId: firstBody.id,
          createdAt: firstBody.received_at,
        },
      ],
    });

    const second = await invoke(VALID_BODY);
    expect(second.statusCode).toBe(200);

    const secondBody = JSON.parse(second.body) as {
      id: string;
      received_at: string;
      protocol_version: string;
      server_capabilities: unknown;
    };

    expect(secondBody.id).toBe(firstBody.id);
    expect(secondBody.received_at).toBe(firstBody.received_at);
    expect(secondBody.protocol_version).toBe('0');
    expect(Array.isArray(secondBody.server_capabilities)).toBe(true);
  });
});

describe('POST /v1/reports → forwarder hand-off (Step 6g contract)', () => {
  beforeEach(() => {
    sendMock.mockReset();
    lambdaSendMock.mockClear();
    process.env.FORWARDER_FN_NAME = 'fyd-forwarder';
  });

  afterEach(() => {
    delete process.env.FORWARDER_FN_NAME;
  });

  it('async-invokes the forwarder with a Payload of exactly { report_id }', async () => {
    sendMock.mockResolvedValueOnce({ Items: [] }); // dedup miss
    sendMock.mockResolvedValueOnce({}); // Put

    const res = await invoke(VALID_BODY);
    expect(res.statusCode).toBe(201);
    const newId = (JSON.parse(res.body) as { id: string }).id;

    expect(lambdaSendMock).toHaveBeenCalledTimes(1);
    const invokeInput = lambdaSendMock.mock.calls[0][0].input;
    expect(invokeInput.InvocationType).toBe('Event');
    const decoded = JSON.parse(Buffer.from(invokeInput.Payload as Buffer).toString('utf8'));
    expect(decoded).toEqual({ report_id: newId });
    // No stale user_id leaks into the event contract.
    expect(Object.keys(decoded)).toEqual(['report_id']);
  });
});
