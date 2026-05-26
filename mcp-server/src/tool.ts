// Tool definition + handler for `file_doc_feedback`.
//
// Keeping the handler separate from the McpServer wiring makes both
// unit-testable in isolation and reusable from any other transport
// (e.g. an HTTP variant we might ship later).

import { Client, FixYourDocsError, buildReport } from "@fixyourdocs/sdk";
import { z } from "zod";

export const TOOL_NAME = "file_doc_feedback";

export const TOOL_DESCRIPTION =
  "File a structured documentation-feedback report to the FixYourDocs hub " +
  "(https://hub.fixyourdocs.io). Use this when you encounter docs that are " +
  "broken, incorrect, outdated, missing, unclear, or otherwise unhelpful " +
  "while following them. Each report is forwarded to a GitHub Issue on the " +
  "doc owner's repository when they have a FixYourDocs integration installed.";

// Mirror of the v0 `Report` envelope. Kept intentionally close to the wire
// schema so the description the model sees matches what it'll see in the
// protocol spec at https://docsfeedback.org.
export const inputSchemaShape = {
  doc_url: z
    .string()
    .url()
    .max(2048)
    .describe(
      "URL of the doc page that produced the problem (HTTPS, ≤ 2048 chars).",
    ),
  agent: z
    .object({
      name: z
        .string()
        .min(1)
        .max(64)
        .describe(
          "Lowercase kebab-case agent identifier, e.g. \"claude-code\", " +
            "\"cursor\", \"codex\". Matches /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.",
        ),
      version: z
        .string()
        .max(64)
        .optional()
        .describe("Optional agent version string, e.g. \"0.6.2\"."),
      vendor: z
        .string()
        .max(64)
        .optional()
        .describe("Optional vendor / publisher, e.g. \"Anthropic\"."),
    })
    .describe("Identity of the agent filing the report."),
  report: z
    .object({
      kind: z
        .enum(["broken", "incorrect", "outdated", "missing", "unclear", "other"])
        .describe("One of the six v0 report kinds."),
      summary: z
        .string()
        .min(1)
        .max(280)
        .describe("One-line description of the problem (≤ 280 chars)."),
      details: z
        .string()
        .max(8000)
        .optional()
        .describe(
          "Optional longer description, ideally with expected vs. observed.",
        ),
      suggested_fix: z
        .string()
        .max(4000)
        .optional()
        .describe("Optional concrete suggestion for fixing the doc."),
    })
    .describe("The report body itself."),
} as const;

export const inputSchema = z.object(inputSchemaShape);
export type FileDocFeedbackInput = z.infer<typeof inputSchema>;

export interface FileDocFeedbackResult {
  id: string;
  url: string;
}

export interface FileDocFeedbackOptions {
  /** Hub base URL. Defaults to https://hub.fixyourdocs.io. */
  hubUrl?: string;
  /** Optional `fetch` override (for tests). */
  fetch?: typeof fetch;
}

const DEFAULT_HUB_URL = "https://hub.fixyourdocs.io";

function normalizeHubUrl(hubUrl: string | undefined): string {
  return (hubUrl ?? DEFAULT_HUB_URL).replace(/\/$/, "");
}

/**
 * Pure tool handler — building the v0 wire-format `Report` via the SDK's
 * `buildReport` helper, sending it through `Client.send`, and returning a
 * stable `{ id, url }` shape regardless of whether the hub treats it as
 * new (201) or a deduplicated submission (200).
 */
export async function handleFileDocFeedback(
  input: FileDocFeedbackInput,
  options: FileDocFeedbackOptions = {},
): Promise<FileDocFeedbackResult> {
  const parsed = inputSchema.parse(input);
  const hubUrl = normalizeHubUrl(options.hubUrl);

  // `buildReport` enforces the v0 lexical constraints (agent-name pattern,
  // max lengths). On a violation it throws `FixYourDocsError`; the McpServer
  // wiring layer catches that and turns it into an MCP `isError: true`.
  const report = buildReport({
    docUrl: parsed.doc_url,
    summary: parsed.report.summary,
    kind: parsed.report.kind,
    agentName: parsed.agent.name,
    agentVersion: parsed.agent.version,
    agentVendor: parsed.agent.vendor,
    details: parsed.report.details,
    suggestedFix: parsed.report.suggested_fix,
  });

  const client = new Client({
    apiUrl: hubUrl,
    fetch: options.fetch,
    userAgent: "fixyourdocs-mcp-server/0.1.0",
  });
  const result = await client.send(report);

  return {
    id: result.id,
    url: `${hubUrl}/v1/reports/${result.id}`,
  };
}

// Re-exported so callers can pattern-match on the SDK error type without
// having to take a direct dep on `@fixyourdocs/sdk`.
export { FixYourDocsError };
