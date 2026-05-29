// Executable entry-point. Published as the `@fixyourdocs/mcp-server` npm
// package's `bin`, so `npx @fixyourdocs/mcp-server` Just Works for MCP
// client configurations (Claude Desktop, Cursor, Codex, …).
//
// Reads two optional environment variables:
//   FIXYOURDOCS_HUB_URL  Override the hub base URL. Defaults to
//                        https://hub.fixyourdocs.io. Useful for tests
//                        and self-hosted hubs.

import { runServer } from "./server.js";

const hubUrl = process.env.FIXYOURDOCS_HUB_URL;

runServer({ hubUrl }).catch((err: unknown) => {
  const message = err instanceof Error ? err.stack ?? err.message : String(err);
  // stderr only — stdout is the MCP transport channel.
  process.stderr.write(`fixyourdocs-mcp-server: fatal: ${message}\n`);
  process.exit(1);
});
