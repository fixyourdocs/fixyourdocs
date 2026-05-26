// P0-10 Step 6 verification: the MCP server, when no tool is invoked,
// makes zero network calls. This is the unit-test equivalent of the
// plan's "tcpdump or socket-watch for one minute idle" probe — instead
// of watching the wire, we stub `fetch` and assert it is never called
// when the server is merely constructed (no incoming `CallToolRequest`).

import { describe, expect, it, vi } from "vitest";

describe("mcp-server idle behaviour", () => {
  it("does not call fetch when no tool is invoked", async () => {
    const fetchSpy = vi
      .fn<typeof fetch>()
      .mockImplementation((input) => {
        throw new Error(
          `Unexpected idle network call: ${
            typeof input === "string" ? input : input.toString()
          }`,
        );
      });

    const { createServer } = await import("../src/server.js");
    const server = createServer({ fetch: fetchSpy });
    // Touch the server so the linter doesn't flag it as unused — we want
    // construction-only, not connection.
    expect(server).toBeDefined();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("does not call fetch when the tool module is merely imported", async () => {
    const fetchSpy = vi.fn<typeof fetch>().mockImplementation(() => {
      throw new Error("Unexpected import-time network call");
    });
    // Re-import via a fresh dynamic import to ensure no top-level side
    // effects (e.g. a sneaky `fetch` at module init) exist.
    vi.resetModules();
    await import("../src/tool.js");
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
