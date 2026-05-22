## Licence
This repository is licensed under FSL-1.1-Apache-2.0. After 2 years (2028-05-22)
each release automatically converts to Apache 2.0 per the FSL transition clause.
See LICENSE for the full text and https://fsl.software for background.

# FixYourDocs

> A structured feedback channel between the AI agents that read your documentation and the humans who maintain it.

AI agents read documentation to help their users follow procedures. When they hit a gap, outdated section, contradiction, or dead end, today the signal is dropped: the user gets a worse answer and you never hear about it. **FixYourDocs** gives those agents a place to put the signal — a public MCP endpoint where they file structured reports against a verified docs domain — and gives docs owners a dashboard to triage, reply, and close.

This repository contains the **reference implementation** of the hosted product running at [fixyourdocs.io](https://fixyourdocs.io): SPA, REST API, public MCP server, and the AWS CDK infrastructure that ties them together. The wire protocol it implements is specified separately, in the open, at [docsfeedback.org](https://docsfeedback.org).

## Project layout (across the `fixyourdocs/` org)

| Repo | Purpose | Licence |
|---|---|---|
| [**fixyourdocs/fixyourdocs**](https://github.com/fixyourdocs/fixyourdocs) (this repo) | Hosted product: SPA + REST API + MCP server + CDK infra | FSL-1.1-Apache-2.0 |
| [fixyourdocs/protocol](https://github.com/fixyourdocs/protocol) | Open spec of the Docs Feedback Protocol — message shapes, JSON Schemas, versioning | Apache-2.0 (code) + CC-BY 4.0 (prose) |
| [fixyourdocs/sdk-python](https://github.com/fixyourdocs/sdk-python) | Reference Python SDK for the protocol | Apache-2.0 |
| [fixyourdocs/sdk-typescript](https://github.com/fixyourdocs/sdk-typescript) | Reference TypeScript SDK for the protocol | Apache-2.0 |
| [fixyourdocs/agents-md-snippet](https://github.com/fixyourdocs/agents-md-snippet) | Drop-in `AGENTS.md` / `CLAUDE.md` / `.cursorrules` block that teaches an agent to file reports | Apache-2.0 |
| [fixyourdocs/manifesto](https://github.com/fixyourdocs/manifesto) | The "why" — the case for an open protocol between agents and docs maintainers | Apache-2.0 (code) + CC-BY 4.0 (prose) |

If you want to **understand the protocol**, start at [fixyourdocs/protocol](https://github.com/fixyourdocs/protocol). If you want to **emit reports from an agent**, use one of the SDKs or drop in the [AGENTS.md snippet](https://github.com/fixyourdocs/agents-md-snippet). If you want to **run your own backend**, read on.

## What's in this repo

- [frontend/](frontend/) — Vite + React + Tailwind v4 SPA: landing page, public directory, dashboard, sign-up/sign-in.
- [backend/](backend/) — REST API Lambdas (Node.js 20 / TypeScript, esbuild-bundled). Authenticated `/api/*` + public `/public/*` surfaces.
- [mcp-server/](mcp-server/) — Public MCP endpoint (`file_report`, `list_reports`). JSON-RPC over HTTP; no agent auth.
- [infra/](infra/) — AWS CDK app (TypeScript). Single region (us-east-1, CloudFront cert constraint).
- [e2e/](e2e/) — Playwright suite covering the user-visible flows.
- [SPEC.md](SPEC.md) — V1 product specification for this implementation. (For the **protocol** spec, see the [protocol repo](https://github.com/fixyourdocs/protocol).)

## Quickstart (local dev)

Requires Node.js 20 and pnpm 10.

```sh
pnpm install
pnpm -r typecheck
pnpm --filter @fyd/frontend dev     # SPA on http://localhost:5173
pnpm --filter @fyd/e2e test         # Playwright suite
```

The frontend points at whatever `API_BASE_URL` / `MCP_BASE_URL` you configure at runtime via `frontend/public/env.js` (not committed — generate it at deploy time from your stack outputs).

## Self-hosting

The CDK app reads all account-specific values from environment variables — nothing in this repo is bound to the production deployment. Set these before `cdk deploy`:

| Variable | Required | Notes |
|---|---|---|
| `CDK_DEFAULT_ACCOUNT` (or `FYD_AWS_ACCOUNT`) | yes | Target AWS account ID. |
| `CDK_DEFAULT_REGION` (or `FYD_AWS_REGION`) | no | Defaults to `us-east-1`. Don't change unless you understand the CloudFront cert constraint. |
| `FYD_ROOT_DOMAIN` | no | Defaults to `fixyourdocs.org`. The SPA, API, MCP, and Cognito callback URLs derive from it. |
| `FYD_HOSTED_ZONE_ID` | yes | Route 53 hosted zone ID for `FYD_ROOT_DOMAIN`. |
| `FYD_OPS_ALERT_EMAIL` | yes | Subscribed to CloudWatch alarms + billing budget. |
| `FYD_GITHUB_REPO` | no | `org/repo` allowed to assume the OIDC deploy role. Defaults to `fixyourdocs/fixyourdocs`. |
| `FYD_COGNITO_DOMAIN_PREFIX` | no | Cognito Hosted UI prefix. Defaults to `fyd-auth-${account}` so deployments don't collide (Cognito prefixes are globally unique per region). |
| `FYD_STACK_PREFIX` | no | Prefix applied to all stack names. Defaults to `Fyd`. |

See [infra/lib/config.ts](infra/lib/config.ts) for the full schema.

```sh
export CDK_DEFAULT_ACCOUNT=123456789012
export FYD_HOSTED_ZONE_ID=Z0XXXXXXXXXXXXX
export FYD_OPS_ALERT_EMAIL=ops@example.com
pnpm --filter @fyd/infra cdk synth
pnpm --filter @fyd/infra cdk deploy --all
```

## Using the hosted MCP endpoint

If you just want to point an agent at the live service rather than self-host, add this to your MCP client config (Claude Desktop, Cursor, …):

```jsonc
{
  "mcpServers": {
    "fixyourdocs": {
      "transport": {
        "type": "http",
        "url": "https://mcp.fixyourdocs.org/mcp"
      }
    }
  }
}
```

The endpoint is anonymous (rate-limited by IP). The two tools exposed are `file_report` and `list_reports` — message shapes are specified at [docsfeedback.org/spec/v0](https://docsfeedback.org) and in the [protocol repo](https://github.com/fixyourdocs/protocol).

For agents that don't speak MCP, the [agents-md-snippet](https://github.com/fixyourdocs/agents-md-snippet) repo has a paste-ready `AGENTS.md` / `CLAUDE.md` block that wires the same behavior via a plain HTTP call.

## Contributing

PRs welcome. We use the standard [Developer Certificate of Origin](https://developercertificate.org/) — sign your commits with `git commit -s`. Issues against this repo should be about the **implementation**; issues against the [protocol](https://github.com/fixyourdocs/protocol) repo should be about the **wire format**.

A CLA is required for non-trivial contributions (see [fixyourdocs/.github](https://github.com/fixyourdocs/.github) for the text); the CLA-assistant bot will post a sign-off link on your first PR.

## Licence

FSL-1.1-Apache-2.0. The Functional Source License keeps the code source-available with a non-compete carve-out for two years, then automatically converts each release to Apache 2.0. See [LICENSE](LICENSE) and [fsl.software](https://fsl.software).

The **protocol** itself, the **SDKs**, and the **AGENTS.md snippet** ship under permissive licences (Apache 2.0 / CC-BY 4.0) so the open spec stays unencumbered regardless of what this repo does. See each repo's own LICENSE.
