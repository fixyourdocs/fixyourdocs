## Licence
This repository is licensed under FSL-1.1-Apache-2.0. After 2 years (2028-05-22)
each release automatically converts to Apache 2.0 per the FSL transition clause.
See LICENSE for the full text and https://fsl.software for background.

# FixYourDocs

> A structured feedback channel between the AI agents that read your documentation and the humans who maintain it.

AI agents read documentation to help their users follow procedures. When they hit a gap, outdated section, contradiction, or dead end, today the signal is dropped: the user gets a worse answer and you never hear about it. **FixYourDocs** gives those agents a place to put the signal: they file a structured report through an open protocol, and the hub forwards it to a GitHub Issue on the docs owner's connected repo — so maintainers triage it with the tools they already use.

This repository contains the **reference implementation** of the hosted product running at [fixyourdocs.io](https://fixyourdocs.io) — SPA, REST API, and the MCP client package — alongside the [docsfeedback.org](https://docsfeedback.org) Starlight site that hosts the open spec. The production CDK pipeline lives in a separate private infrastructure repository. The wire protocol it implements is specified in the open at [docsfeedback.org](https://docsfeedback.org).

## Project layout (across the `fixyourdocs/` org)

| Repo | Purpose | Licence |
|---|---|---|
| [**fixyourdocs/fixyourdocs**](https://github.com/fixyourdocs/fixyourdocs) (this repo) | Hosted product (SPA + REST API + MCP package) and the `docsfeedback.org` Starlight site | FSL-1.1-Apache-2.0 |
| [fixyourdocs/protocol](https://github.com/fixyourdocs/protocol) | Open spec of the Docs Feedback Protocol — message shapes, JSON Schemas, versioning | Apache-2.0 (code) + CC-BY 4.0 (prose) |
| [fixyourdocs/sdk-python](https://github.com/fixyourdocs/sdk-python) | Reference Python SDK for the protocol | Apache-2.0 |
| [fixyourdocs/sdk-typescript](https://github.com/fixyourdocs/sdk-typescript) | Reference TypeScript SDK for the protocol | Apache-2.0 |
| [fixyourdocs/agents-md-snippet](https://github.com/fixyourdocs/agents-md-snippet) | Drop-in `AGENTS.md` / `CLAUDE.md` / `.cursorrules` block that teaches an agent to file reports | Apache-2.0 |
| [fixyourdocs/manifesto](https://github.com/fixyourdocs/manifesto) | The "why" — the case for an open protocol between agents and docs maintainers | Apache-2.0 (code) + CC-BY 4.0 (prose) |

If you want to **understand the protocol**, start at [fixyourdocs/protocol](https://github.com/fixyourdocs/protocol). If you want to **emit reports from an agent**, use one of the SDKs or drop in the [AGENTS.md snippet](https://github.com/fixyourdocs/agents-md-snippet). If you want to **run your own backend**, read on.

## What's in this repo

- [frontend/](frontend/) — Vite + React + Tailwind v4 SPA: landing page, sign-up / sign-in, GitHub App install + target-repo setup.
- [backend/](backend/) — REST API Lambdas (Node.js 20 / TypeScript). Public rate-limited `/v1/reports*` plus Cognito-protected `/v1/orgs/*` and `/v1/integrations/*`; an async-invoked forwarder Lambda turns each accepted report into a GitHub Issue.
- [mcp-server/](mcp-server/) — Client-side npm package (`@fixyourdocs/mcp-server`, run via `npx -y @fixyourdocs/mcp-server` over stdio) exposing a single `file_doc_feedback` tool. Calls `POST https://hub.fixyourdocs.io/v1/reports` to file a v0 report; the hub forwards it to a GitHub Issue on the maintainer's chosen repo.
- [docsfeedback-site/](docsfeedback-site/) — Starlight site for [docsfeedback.org](https://docsfeedback.org). Spec markdown and JSON schemas are synced from the [protocol repo](https://github.com/fixyourdocs/protocol) at build time.
- [e2e/](e2e/) — Playwright forwarder smoke test.
- [SPEC.md](SPEC.md) — V1 product specification for this implementation. (For the **protocol** spec, see the [protocol repo](https://github.com/fixyourdocs/protocol).)

## Quickstart (local dev)

Requires Node.js 20 and pnpm 10.

```sh
pnpm install
pnpm -r typecheck
pnpm --filter @fyd/frontend dev               # SPA on http://localhost:5173
pnpm --filter @fyd/docsfeedback-site dev      # docs site on http://localhost:4321
pnpm --filter @fyd/e2e test                   # Playwright suite
```

The frontend points at whatever `API_BASE_URL` you configure at runtime via `frontend/public/env.js` (not committed — generate it at deploy time from your stack outputs).

## Self-hosting

The production hosted variant runs on AWS Lambda + API Gateway HTTP API + DynamoDB + Cognito + CloudFront, deployed via AWS CDK v2. The CDK app itself is operated from a separate private infrastructure repository; a public reference template will follow once the hosted variant is stable.

Self-hosters writing their own CDK app today can match the contract by passing the following env vars through to the backend Lambdas:

| Variable | Required | Notes |
|---|---|---|
| `CDK_DEFAULT_ACCOUNT` (or `FYD_AWS_ACCOUNT`) | yes | Target AWS account ID. |
| `CDK_DEFAULT_REGION` (or `FYD_AWS_REGION`) | no | Defaults to `us-east-1`. Don't change unless you understand the CloudFront cert constraint. |
| `FYD_ROOT_DOMAIN` | no | Defaults to `fixyourdocs.io`. The SPA, API, and Cognito callback URLs derive from it. |
| `FYD_HOSTED_ZONE_ID` | yes | Route 53 hosted zone ID for `FYD_ROOT_DOMAIN`. |
| `FYD_OPS_ALERT_EMAIL` | yes | Subscribed to CloudWatch alarms + billing budget. |
| `FYD_GITHUB_REPO` | no | `org/repo` allowed to assume the OIDC deploy role. |
| `FYD_COGNITO_DOMAIN_PREFIX` | no | Cognito Hosted UI prefix. Defaults to `fyd-auth-${account}` so deployments don't collide (Cognito prefixes are globally unique per region). |
| `FYD_STACK_PREFIX` | no | Prefix applied to all stack names. |

## Using FixYourDocs from an agent

The agent-facing surface is the hub's `POST https://hub.fixyourdocs.io/v1/reports` endpoint. Reports are anonymous (rate-limited by IP) and conform to the v0 schema specified at [docsfeedback.org/spec/v0](https://docsfeedback.org) and in the [protocol repo](https://github.com/fixyourdocs/protocol).

Two ways to wire an agent to it:

- **Drop-in `AGENTS.md` block** — paste the snippet from [fixyourdocs/agents-md-snippet](https://github.com/fixyourdocs/agents-md-snippet) into your project's `AGENTS.md` / `CLAUDE.md` / `.cursorrules`. Works with any agent that reads those files; no MCP client required.
- **MCP client** — use one of the SDKs ([Python](https://github.com/fixyourdocs/sdk-python), [TypeScript](https://github.com/fixyourdocs/sdk-typescript)) or the helper in [`mcp-server/`](mcp-server/) to expose a `file_doc_feedback` tool to clients that speak MCP (Claude Desktop, Cursor, …).

## Contributing

PRs welcome. We use the standard [Developer Certificate of Origin](https://developercertificate.org/) — sign your commits with `git commit -s`. Issues against this repo should be about the **implementation**; issues against the [protocol](https://github.com/fixyourdocs/protocol) repo should be about the **wire format**.

A CLA is required for non-trivial contributions (see [fixyourdocs/.github](https://github.com/fixyourdocs/.github) for the text); the CLA-assistant bot will post a sign-off link on your first PR.

## Licence

FSL-1.1-Apache-2.0. The Functional Source License keeps the code source-available with a non-compete carve-out for two years, then automatically converts each release to Apache 2.0. See [LICENSE](LICENSE) and [fsl.software](https://fsl.software).

The **protocol** itself, the **SDKs**, and the **AGENTS.md snippet** ship under permissive licences (Apache 2.0 / CC-BY 4.0) so the open spec stays unencumbered regardless of what this repo does. See each repo's own LICENSE.
