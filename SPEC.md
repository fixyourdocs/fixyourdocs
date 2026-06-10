# FixYourDocs — Reference Implementation Spec (V1)

> **Scope of this document.** This spec describes the **hosted product** in this repo: what it does, what's in V1, and the architectural decisions that shape the code. It is *not* the wire-protocol spec — for the open Docs Feedback Protocol (message shapes, JSON Schemas, versioning), see [github.com/fixyourdocs/protocol](https://github.com/fixyourdocs/protocol) and [docsfeedback.org](https://docsfeedback.org).

## 1. Product

AI agents read documentation to help their users follow procedures. When they hit a gap, outdated section, contradiction, or dead end, they file a structured report via the Docs Feedback Protocol. The Hub is a **thin report forwarder**: it accepts reports, deduplicates them, and forwards each unique report as a GitHub Issue — to the repo of the maintainer who has **verified ownership** of the report's doc URL (a domain via DNS-TXT, or a GitHub Pages site via the GitHub App on the publishing repo). No verified owner for that doc → no Issue.

V1 is intentionally narrow: no public dashboard, no public read API, no vendor directory, no replies-and-status workflow. Maintainers triage in their existing GitHub Issues UI; agents post structured reports through the existing protocol.

### Users

- **Documentation maintainers** — sign up to the Hub, install the GitHub App on a repo, verify ownership of their docs (a DNS-TXT challenge for a domain, or — for docs on GitHub Pages — a repo-scoped claim through the GitHub App), and point the Hub at that repo. From then on, the Hub turns each report whose doc URL is on one of their verified domains or claimed Pages paths into a GitHub Issue on that repo.
- **AI agents (anonymous)** — call `POST /v1/reports` with no authentication, file reports against any doc URL. No registration, no rate-limit beyond IP token bucket. Domain ownership is the *maintainer's* concern, never the agent's: an agent claims nothing, and a report only routes if some maintainer has verified that doc URL's host.

### Value

- For maintainers: a feedback channel from the population of agents reading their docs, surfaced in the tool they already triage in (GitHub Issues).
- For agents: a place to put the "this instruction is wrong" signal instead of dropping it.
- For users: doc quality improves as agents' structured reports get triaged.

## 2. V1 Scope

### In

- `POST /v1/reports` — accept a v0 report (unauthenticated, rate-limited).
- Cognito user sign-up / sign-in for maintainers (SRP-based, in-app, no Hosted UI):
  - **Email + password** — v0 must-have.
  - **GitHub OAuth federation** — v0 nice-to-have (deferrable to v0.1).
- GitHub App install flow (`/v1/integrations/github/install` + callback).
- Per-maintainer integration config (`POST /v1/orgs/me/integrations/github`) — set target repo + Issue template.
- Domain / GitHub Pages claim + verification (`POST /v1/orgs/me/domains`, `POST /v1/orgs/me/domains/:domain/verify`) — a maintainer proves they own a docs domain (DNS-TXT), or a GitHub Pages site (the same route accepts a `*.github.io` URL and verifies it against the GitHub App on the publishing repo — no DNS). This is the routing key (see §5).
- Forwarder Lambda — async-invoked on accepted report; resolves the report's `doc_url` to the maintainer who verified that domain (or a parent of it) or claimed that GitHub Pages path (longest-prefix wins); mints a GitHub App installation token; posts an Issue on their target repo. No verified owner → no Issue. Idempotent on `report_id`.

### Out (V2+)

- Public read API for reports (reports live as GitHub Issues, viewed in the GitHub UI).
- Hosted MCP endpoint — the MCP server is a client-side npm package shipped by P0-10.
- Public vendor directory.
- Org dashboard with reply / status transitions.
- Team invitations, RBAC.
- Webhooks / Slack / Linear / Jira sinks.
- Paid tiers, billing.
- Diff/patch suggestions from agents.
- Search across reports.

### Non-goals (V1)

- High-throughput ingestion (assume < 10 reports/sec peak).
- Multi-region.
- Soft deletes / audit log.
- Internationalisation.

## 3. Architecture (one line)

CloudFront + S3 SPA → API Gateway HTTP API → Lambda (Node.js 20 / TypeScript) → DynamoDB on-demand, plus a forwarder Lambda async-invoked on accepted reports that posts to GitHub Issues via a GitHub App installation token. Cognito for human auth. DNS via Route 53. Everything deployed via AWS CDK from GitHub Actions using OIDC. Region: **us-east-1** (single region; CloudFront cert constraint).

```
Agent  ────► hub.fixyourdocs.io ──► API Gateway ──► POST /v1/reports Lambda ──► DynamoDB (Reports)
                                                                        │
                                                                        └─async─► Forwarder Lambda ──► GitHub Issues API
                                                                                   │  resolve doc_url host →
                                                                                   └► DynamoDB (Domains → Integrations)
                                                                                      verified owner's repo, else no-op

Maintainer ──► fixyourdocs.io ──► CloudFront ──► S3 (SPA)
                                                    │
                                                    └──► Cognito (SRP) sign-up / sign-in
                                                    └──► hub.fixyourdocs.io /v1/integrations/github/*

JWT authoriser (Cognito) protects /v1/orgs/* and /v1/integrations/*.
/v1/reports* is unauthenticated, rate-limited only.
```

## 4. Domains (production deployment)

| Hostname | Purpose | Backed by |
|---|---|---|
| `fixyourdocs.io` | Marketing + SPA (sign-up + GitHub-install repo picker) | CloudFront → S3 |
| `hub.fixyourdocs.io` | Hub API (single endpoint surface) | API Gateway HTTP API |
| `docsfeedback.org` | Protocol home (open spec, JSON schemas) | Static site, separate stack |

Self-hosted deployments derive these hostnames from `FYD_ROOT_DOMAIN` (see [README.md](README.md#self-hosting)).

## 5. Key decisions (locked for V1)

| Question | Decision | Why |
|---|---|---|
| Report sink | GitHub Issues via GitHub App installation token, posted by an async-invoked forwarder Lambda | Maintainers already triage in GitHub; no new UI to build at v0 |
| Agent auth on `POST /v1/reports` | None — rate-limited only | Lowest friction; reports are public-by-design (they become GitHub Issues) |
| Report routing | The report's `doc_url` is matched against domains maintainers have **DNS-TXT-verified** (most-specific verified owner wins) or **GitHub Pages paths** they've claimed via the App (longest claimed prefix wins); the owner's `configured` repo gets the Issue. No verified match → no Issue | `doc_url` already carries the host + path (no protocol change needed); DNS-TXT or App-installation proves ownership, so nobody can route reports into a repo they don't control |
| Frontend stack | Vite + React SPA, S3 + CloudFront via CDK | Fully CDK-managed, no Amplify lock-in |
| Human auth | Cognito user pool, in-app SRP via `amazon-cognito-identity-js`. Two sign-in paths into the same user pool: email + password (v0 must-have) and GitHub OAuth federation (v0 nice-to-have) | Native AWS, low ops; SRP keeps passwords client-side. GitHub OAuth gives maintainers who already use GitHub a one-click path without granting any third-party app extra access |
| GitHub integration vs GitHub OAuth | Separate flows. Every maintainer (email-signup or GitHub-OAuth-signup) completes the GitHub App install once. The GitHub App + the GitHub OAuth login app can be the same registered app | `installations:write` and `read:user` are independent scopes; reusing one app simplifies setup |
| DB | DynamoDB on-demand, multi-table (`Reports`, `Integrations`, `Domains`, `RateLimit`) | Safest at low volume, simple to evolve |
| Dedup | `dedup_key = sha256(doc_url + summary + agent + day_bucket)` GSI on `Reports`; conditional write returns existing id | Avoids duplicate Issues from agents retrying |
| Rate limiting | Handler-level via `RateLimit` DynamoDB table (per-IP token bucket) + Lambda reserved concurrency cap on `/v1/reports*` | WAFv2 does not support API Gateway HTTP APIs (v2). WAF still applied to CloudFront |
| IaC | AWS CDK v2 (TypeScript) | One language across infra + backend |
| CI/CD | GitHub Actions with OIDC role | No long-lived AWS keys in GitHub |
| Licence | Apache-2.0 in this phase; re-licence to FSL-1.1-Apache-2.0 when paywall lands (P4-01) | Source-available; non-compete carve-out for 2 years; auto-converts to Apache 2.0 |

The wire-protocol decisions (envelope shape, status vocabulary, version negotiation) are in the [protocol repo](https://github.com/fixyourdocs/protocol).

## 6. Repo layout

```
fixyourdocs/
├── SPEC.md                     # this file
├── README.md
├── LICENSE                     # Apache-2.0 (re-licenced to FSL on paywall)
├── backend/                    # API Lambda handlers (5 endpoint handlers + forwarder)
├── mcp-server/                 # client-side npm package (no Lambda runtime); shipped by P0-10
├── frontend/                   # Vite + React SPA: landing + sign-up/sign-in + GitHub install
├── e2e/                        # Playwright forwarder smoke test
└── .github/workflows/ci.yml    # typecheck + frontend build
```

The production deploy pipeline (CDK app + `deploy.yml`) is operated
from a separate private infrastructure repository and is not part of
this OSS distribution. Self-hosters can replicate the stack from the
AWS services listed in [§5 Key decisions](#5-key-decisions-locked-for-v1);
a public reference template will follow once the hosted variant is
stable.

## 7. Success criteria for V1

1. A new maintainer can sign up via email + password (or GitHub OAuth), install the GitHub App on a repo they own, verify ownership of their docs domain (DNS-TXT), point the Hub at that repo, and choose an Issue template — all from `fixyourdocs.io`.
2. An MCP client (Claude Desktop, Cursor, the [TypeScript](https://github.com/fixyourdocs/sdk-typescript) or [Python](https://github.com/fixyourdocs/sdk-python) SDK) that POSTs a v0 report to `https://hub.fixyourdocs.io/v1/reports` gets back a `201 { id }`.
3. Within 10 seconds, a report whose `doc_url` is on the maintainer's verified domain appears as a new Issue on their target repo, with the body rendered from the Issue template; a report on an unverified host produces no Issue.
4. Posting the same report twice returns the same id and creates exactly one Issue (dedup).
5. The whole stack deploys clean from a fresh `cdk deploy --all` on an empty AWS account, given only the env vars listed in [README.md](README.md#self-hosting).
6. CI builds + typechecks on every push to `main`.

## 8. Out-of-scope risks acknowledged

- **Spam in V1:** mitigated by IP rate limit + per-maintainer rate cap on the Issues forwarder; no captcha. Maintainers control their own repo and can close spammy Issues with GitHub's existing tools.
- **No abuse reporting UI:** maintainers escalate to `hello@fixyourdocs.io`; abuse reports against the Hub itself land in the same inbox.
- **No content moderation:** report bodies are user-supplied text; the GitHub Issue body is markdown-rendered by GitHub's existing sanitiser.
- **One AWS region:** us-east-1 is hardcoded by the CloudFront ACM cert constraint, not by Cognito or DynamoDB itself; multi-region is V2+.

## 9. Relationship to the open protocol

This implementation is one possible backend for the [Docs Feedback Protocol](https://github.com/fixyourdocs/protocol). The protocol is intentionally minimal and permissively licensed so that:

- Other implementations can exist (self-hosted, on-premise, alternative sinks like Linear, Jira, Discord).
- The SDKs ([Python](https://github.com/fixyourdocs/sdk-python), [TypeScript](https://github.com/fixyourdocs/sdk-typescript)) and the [AGENTS.md snippet](https://github.com/fixyourdocs/agents-md-snippet) can be used against any conforming backend.
- The on-the-wire format is stable independent of any one vendor.

A change to message shapes or status vocabulary is a protocol change and belongs in the protocol repo. A change to how reports are stored, forwarded, or rate-limited is an implementation change and belongs here.

## 10. Contributing

See [README.md § Contributing](README.md#contributing). PRs need DCO sign-off; non-trivial PRs need a CLA signature (the CLA-assistant bot posts a link on first PR).
