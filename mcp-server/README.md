# `@fixyourdocs/mcp-server`

Model Context Protocol (MCP) server that exposes a single tool —
`file_doc_feedback` — so any MCP client (Claude Desktop, Cursor, Codex,
Gemini CLI, …) can file a structured documentation-feedback report to
the FixYourDocs hub at `hub.fixyourdocs.io` when it encounters
docs that are broken, incorrect, outdated, missing, unclear, or
otherwise unhelpful.

Reports are forwarded to a GitHub Issue on the doc owner's repository
when they have a FixYourDocs integration installed. No phone-home, no
telemetry — the server only contacts the hub when an agent explicitly
calls the tool.

- **Spec:** [Docs Feedback Protocol v0](https://docsfeedback.org)
- **SDK:** [`@fixyourdocs/sdk`](https://www.npmjs.com/package/@fixyourdocs/sdk)
- **Issues / contributions:** <https://github.com/fixyourdocs/fixyourdocs>

## Install

The server is designed to be run via `npx`, so you typically don't
install it directly — your MCP client launches it on demand:

```sh
npx -y @fixyourdocs/mcp-server
```

It speaks the standard MCP stdio transport. There is nothing to
configure unless you want to point at a different hub (see
[Environment variables](#environment-variables) below).

## Client configuration

Each MCP client has its own config file, but the shape is the same: a
named server entry with `command` + `args`.

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json`
(macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```jsonc
{
  "mcpServers": {
    "fixyourdocs": {
      "command": "npx",
      "args": ["-y", "@fixyourdocs/mcp-server"]
    }
  }
}
```

Restart Claude Desktop. The `file_doc_feedback` tool should appear in
the tool list.

### Cursor

Edit `~/.cursor/mcp.json` (or your workspace's `.cursor/mcp.json`):

```jsonc
{
  "mcpServers": {
    "fixyourdocs": {
      "command": "npx",
      "args": ["-y", "@fixyourdocs/mcp-server"]
    }
  }
}
```

### Codex / OpenAI Codex CLI

Edit `~/.codex/config.toml`:

```toml
[mcp_servers.fixyourdocs]
command = "npx"
args = ["-y", "@fixyourdocs/mcp-server"]
```

### `mcp-inspector` (for verification)

```sh
npx @modelcontextprotocol/inspector npx -y @fixyourdocs/mcp-server
```

The inspector UI lists `file_doc_feedback`, accepts a fixture report,
and shows the `{ id, url }` returned by the hub.

## Tool: `file_doc_feedback`

### Input

Mirrors the v0 spec's
[`Report`](https://docsfeedback.org/spec/v0/) envelope:

| Field                     | Type        | Required | Notes                                                                                  |
| ------------------------- | ----------- | -------- | -------------------------------------------------------------------------------------- |
| `doc_url`                 | string      | yes      | URL of the doc page that produced the problem. Max 2048 chars.                         |
| `agent.name`              | string      | yes      | Lowercase kebab-case identifier, e.g. `claude-code`, `cursor`, `codex`. Max 64 chars.  |
| `agent.version`           | string      | no       | Optional agent version string.                                                         |
| `agent.vendor`            | string      | no       | Optional vendor / publisher, e.g. `Anthropic`.                                         |
| `report.kind`             | enum        | yes      | One of: `broken`, `incorrect`, `outdated`, `missing`, `unclear`, `other`.              |
| `report.summary`          | string      | yes      | One-line description, ≤ 280 chars.                                                     |
| `report.details`          | string      | no       | Optional longer description. ≤ 8000 chars.                                             |
| `report.suggested_fix`    | string      | no       | Optional concrete suggestion. ≤ 4000 chars.                                            |

### Output

```jsonc
{
  "id": "01ABCDEF0123456789ABCDEFGH",
  "url": "https://hub.fixyourdocs.io/v1/reports/01ABCDEF0123456789ABCDEFGH"
}
```

`id` is a ULID returned by the hub. `url` is the canonical retrieval
URL for the report.

### Behaviour

- The server validates the input against the v0 lexical constraints
  (URL parsing, agent-name pattern, summary length) before contacting
  the hub. Validation errors are returned as MCP `isError: true`
  results with a human-readable explanation.
- On a `201 Created` (new submission) or `200 OK` (idempotent
  duplicate), the tool returns `{ id, url }` regardless — agents
  don't need to distinguish, the hub will not double-file the issue.
- On `429 rate_limited`, `5xx`, or any network error, the tool
  surfaces the error verbatim. Clients should treat this as transient
  and retry with the same payload (the hub deduplicates on body
  content).

## Environment variables

| Variable                | Default                          | Purpose                                                  |
| ----------------------- | -------------------------------- | -------------------------------------------------------- |
| `FIXYOURDOCS_HUB_URL`   | `https://hub.fixyourdocs.io`     | Override the hub base URL. Useful for tests / self-host. |

## Privacy

- **No telemetry, no phone-home.** The server makes outbound network
  calls **only** when an agent explicitly invokes the tool. There
  is no analytics call, no version-check ping, no diagnostic
  upload.
- The report payload contains only the fields the agent supplies
  (doc URL, agent identity, kind, summary, optional details and
  suggested fix). No process environment, file paths, or system
  identifiers are appended.

## License

Apache-2.0. See [`LICENSE`](./LICENSE).
