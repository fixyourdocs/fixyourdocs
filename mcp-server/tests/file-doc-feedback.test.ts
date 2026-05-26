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

describe("handleFileDocFeedback", () => {
  it("posts to {hubUrl}/v1/reports and returns { id, url }", async () => {
    const fakeFetch = vi.fn<typeof fetch>().mockResolvedValue(
      v0Response("01ABCDEF0123456789ABCDEFGH"),
    );

    const result = await handleFileDocFeedback(validInput, {
      hubUrl: "https://hub.example.com",
      fetch: fakeFetch,
    });

    expect(result).toEqual({
      id: "01ABCDEF0123456789ABCDEFGH",
      url: "https://hub.example.com/v1/reports/01ABCDEF0123456789ABCDEFGH",
    });

    expect(fakeFetch).toHaveBeenCalledOnce();
    const [calledUrl, calledInit] = fakeFetch.mock.calls[0]!;
    expect(calledUrl).toBe("https://hub.example.com/v1/reports");
    const body = JSON.parse((calledInit as RequestInit).body as string);
    expect(body.protocol_version).toBe("0");
    expect(body.doc_url).toBe(validInput.doc_url);
    expect(body.agent.name).toBe("claude-code");
    expect(body.report.kind).toBe("outdated");
  });

  it("defaults hubUrl to https://hub.fixyourdocs.io", async () => {
    const fakeFetch = vi.fn<typeof fetch>().mockResolvedValue(
      v0Response("01TESTDEFAULTHUBURL00000000"),
    );

    const result = await handleFileDocFeedback(validInput, { fetch: fakeFetch });
    expect(result.url).toBe(
      "https://hub.fixyourdocs.io/v1/reports/01TESTDEFAULTHUBURL00000000",
    );
    expect(fakeFetch.mock.calls[0]?.[0]).toBe(
      "https://hub.fixyourdocs.io/v1/reports",
    );
  });

  it("trims a trailing slash from a configured hubUrl", async () => {
    const fakeFetch = vi.fn<typeof fetch>().mockResolvedValue(
      v0Response("01TRIMTRAILINGSLASH000000000"),
    );

    await handleFileDocFeedback(validInput, {
      hubUrl: "https://hub.example.com/",
      fetch: fakeFetch,
    });
    expect(fakeFetch.mock.calls[0]?.[0]).toBe(
      "https://hub.example.com/v1/reports",
    );
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
