import { describe, expect, it, vi } from "vitest";

import { handleFileDocFeedback, type FileDocFeedbackInput } from "../src/tool.js";

const validInput: FileDocFeedbackInput = {
  doc_url: "https://docs.example.com/getting-started",
  agent: { name: "claude-code" },
  report: {
    kind: "outdated",
    summary: "Step 3 references --legacy-mode but the CLI rejects it.",
  },
};

function v0Response(id: string): Response {
  return new Response(
    JSON.stringify({
      id,
      received_at: "2026-05-26T20:00:00.000Z",
      protocol_version: "0",
      server_capabilities: [],
    }),
    { status: 201, headers: { "content-type": "application/json" } },
  );
}

// With `@fixyourdocs/sdk` >= 0.3.0 the client runs `.well-known` opt-out
// discovery against the doc_url host *before* the POST, so the mock fetch must
// answer the discovery GET too. A 404 means "no opt-out document" -> proceed.
function discoveryAwareFetch(reportResponse: () => Response) {
  return vi.fn<typeof fetch>(async (input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.includes("/.well-known/docs-feedback.json")) {
      return new Response("", { status: 404 });
    }
    return reportResponse();
  });
}

describe("handleFileDocFeedback", () => {
  it("posts to {hubUrl}/v1/reports and returns { id }", async () => {
    const fakeFetch = discoveryAwareFetch(() =>
      v0Response("01ABCDEF0123456789ABCDEFGH"),
    );

    const result = await handleFileDocFeedback(validInput, {
      hubUrl: "https://hub.example.com",
      fetch: fakeFetch,
    });

    expect(result).toEqual({
      id: "01ABCDEF0123456789ABCDEFGH",
    });

    // Discovery GET for the doc host happens first; then the report POST.
    expect(
      fakeFetch.mock.calls.some(([u]) =>
        String(u).includes(
          "https://docs.example.com/.well-known/docs-feedback.json",
        ),
      ),
    ).toBe(true);
    const post = fakeFetch.mock.calls.find(([u]) =>
      String(u).endsWith("/v1/reports"),
    );
    expect(post?.[0]).toBe("https://hub.example.com/v1/reports");
    const body = JSON.parse((post![1] as RequestInit).body as string);
    expect(body.protocol_version).toBe("0");
    expect(body.doc_url).toBe(validInput.doc_url);
    expect(body.agent.name).toBe("claude-code");
    expect(body.report.kind).toBe("outdated");
  });

  it("defaults hubUrl to https://hub.fixyourdocs.io", async () => {
    const fakeFetch = discoveryAwareFetch(() =>
      v0Response("01TESTDEFAULTHUBURL00000000"),
    );

    const result = await handleFileDocFeedback(validInput, { fetch: fakeFetch });
    expect(result.id).toBe("01TESTDEFAULTHUBURL00000000");
    const post = fakeFetch.mock.calls.find(([u]) =>
      String(u).endsWith("/v1/reports"),
    );
    expect(post?.[0]).toBe("https://hub.fixyourdocs.io/v1/reports");
  });

  it("trims a trailing slash from a configured hubUrl", async () => {
    const fakeFetch = discoveryAwareFetch(() =>
      v0Response("01TRIMTRAILINGSLASH000000000"),
    );

    await handleFileDocFeedback(validInput, {
      hubUrl: "https://hub.example.com/",
      fetch: fakeFetch,
    });
    const post = fakeFetch.mock.calls.find(([u]) =>
      String(u).endsWith("/v1/reports"),
    );
    expect(post?.[0]).toBe("https://hub.example.com/v1/reports");
  });

  it("refuses a non-public doc_url before any network call (inherited privacy guard)", async () => {
    const fakeFetch = vi.fn<typeof fetch>();

    await expect(
      handleFileDocFeedback(
        { ...validInput, doc_url: "https://localhost/getting-started" },
        { fetch: fakeFetch },
      ),
    ).rejects.toThrow();

    // The SDK privacy guard (inherited via Client.send) rejects the non-public
    // host before any discovery GET or report POST is attempted.
    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("rejects an agent name that violates the v0 lexical pattern", async () => {
    const fakeFetch = vi.fn<typeof fetch>().mockResolvedValue(
      v0Response("never-reached"),
    );

    await expect(
      handleFileDocFeedback(
        { ...validInput, agent: { name: "Claude Code" } },
        { fetch: fakeFetch },
      ),
    ).rejects.toThrow(/agentName/);

    expect(fakeFetch).not.toHaveBeenCalled();
  });

  it("rejects a non-URL doc_url at the zod boundary", async () => {
    const fakeFetch = vi.fn<typeof fetch>();
    await expect(
      handleFileDocFeedback(
        { ...validInput, doc_url: "not a url" } as FileDocFeedbackInput,
        { fetch: fakeFetch },
      ),
    ).rejects.toThrow();
    expect(fakeFetch).not.toHaveBeenCalled();
  });
});
