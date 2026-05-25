// FixYourDocs MCP client-side helper.
//
// This package ships a single tool, `file_doc_feedback`, that an MCP
// server (or any agent) can call to POST a v0 docs-feedback report to
// `https://hub.fixyourdocs.io/v1/reports`. The Hub forwards each accepted
// report to a GitHub Issue on the maintainer's chosen repo.
//
// Until P0-10 publishes this to the MCP registry as a runnable server
// binary, this package exposes:
//   - `fileDocFeedback(input, config?)` -- the wire helper.
//   - `tool` -- the `name` + `description` + `inputSchema` triple that an
//     MCP server can register verbatim.

import { z } from 'zod';

const reportKindSchema = z.enum([
  'broken',
  'incorrect',
  'outdated',
  'missing',
  'unclear',
  'other',
]);

const inputSchema = z.object({
  doc_url: z.string().url().max(2048),
  agent: z.object({
    name: z.string().min(1).max(120),
  }),
  report: z.object({
    kind: reportKindSchema,
    summary: z.string().min(1).max(280),
    details: z.string().max(8000).optional(),
  }),
});

export type FileDocFeedbackInput = z.infer<typeof inputSchema>;

export interface FileDocFeedbackResult {
  id: string;
}

export interface ClientConfig {
  /** Hub base URL. Defaults to https://hub.fixyourdocs.io. */
  hubUrl?: string;
  /** Optional `fetch` override (e.g. for tests). */
  fetchImpl?: typeof fetch;
}

export class FileDocFeedbackError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'FileDocFeedbackError';
  }
}

export async function fileDocFeedback(
  input: FileDocFeedbackInput,
  config: ClientConfig = {},
): Promise<FileDocFeedbackResult> {
  const parsed = inputSchema.parse(input);
  const hubUrl = (config.hubUrl ?? 'https://hub.fixyourdocs.io').replace(/\/$/, '');
  const fetchFn = config.fetchImpl ?? fetch;
  const res = await fetchFn(`${hubUrl}/v1/reports`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ protocol_version: '0', ...parsed }),
  });
  const body: unknown = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = (body as { error?: { code?: string; message?: string } })?.error;
    throw new FileDocFeedbackError(
      res.status,
      err?.code ?? 'unknown',
      err?.message ?? res.statusText,
    );
  }
  return body as FileDocFeedbackResult;
}

export const tool = {
  name: 'file_doc_feedback',
  description:
    'File a structured documentation-feedback report to the FixYourDocs hub. ' +
    'Use when you encounter docs that are broken, incorrect, outdated, missing, ' +
    'unclear, or otherwise unhelpful while following them.',
  inputSchema: {
    type: 'object',
    properties: {
      doc_url: {
        type: 'string',
        format: 'uri',
        description: 'URL of the doc page that produced the problem.',
      },
      agent: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Agent name, e.g. "claude-code", "cursor", "devin".',
          },
        },
        required: ['name'],
      },
      report: {
        type: 'object',
        properties: {
          kind: {
            type: 'string',
            enum: ['broken', 'incorrect', 'outdated', 'missing', 'unclear', 'other'],
          },
          summary: {
            type: 'string',
            description: 'One-line description of the problem (<= 280 chars).',
          },
          details: {
            type: 'string',
            description: 'Optional longer description / expected vs actual.',
          },
        },
        required: ['kind', 'summary'],
      },
    },
    required: ['doc_url', 'agent', 'report'],
  },
} as const;
