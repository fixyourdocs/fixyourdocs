// Wiring layer between the pure tool handler (`tool.ts`) and the
// @modelcontextprotocol/sdk transport. Split out from `cli.ts` so that
// `createServer()` is unit-testable without binding stdio.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import {
  TOOL_NAME,
  TOOL_DESCRIPTION,
  inputSchemaShape,
  handleFileDocFeedback,
  FixYourDocsError,
  type FileDocFeedbackInput,
} from "./tool.js";

export const SERVER_NAME = "fixyourdocs-mcp-server";
export const SERVER_VERSION = "0.1.0";

export interface CreateServerOptions {
  /** Hub base URL. Defaults to https://hub.fixyourdocs.io. */
  hubUrl?: string;
  /** Optional `fetch` override (for tests). */
  fetch?: typeof fetch;
}

/**
 * Creates an `McpServer` with the `file_doc_feedback` tool registered.
 * The server is **not** connected to any transport — call `runServer`
 * for the production stdio path, or pass to a test harness directly.
 */
export function createServer(options: CreateServerOptions = {}): McpServer {
  const server = new McpServer(
    { name: SERVER_NAME, version: SERVER_VERSION },
    { capabilities: { tools: {} } },
  );

  server.tool(
    TOOL_NAME,
    TOOL_DESCRIPTION,
    inputSchemaShape,
    async (args) => {
      try {
        const result = await handleFileDocFeedback(args as FileDocFeedbackInput, {
          hubUrl: options.hubUrl,
          fetch: options.fetch,
        });
        // Both `content` (text) and `structuredContent` (machine-readable):
        // clients that only render text still see the JSON, clients that
        // support structured content can read `{ id, url }` directly.
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(result),
            },
          ],
          structuredContent: result as unknown as Record<string, unknown>,
        };
      } catch (err) {
        const message =
          err instanceof FixYourDocsError
            ? err.message
            : err instanceof Error
              ? err.message
              : String(err);
        return {
          isError: true,
          content: [
            {
              type: "text" as const,
              text: `file_doc_feedback failed: ${message}`,
            },
          ],
        };
      }
    },
  );

  return server;
}

/**
 * Production entry-point: creates the server and binds it to stdio so MCP
 * clients (Claude Desktop, Cursor, Codex, `mcp-inspector`) can talk to it
 * over the standard `pipe-through-spawn` transport.
 */
export async function runServer(options: CreateServerOptions = {}): Promise<void> {
  const server = createServer(options);
  const transport = new StdioServerTransport();
  await server.connect(transport);
}
