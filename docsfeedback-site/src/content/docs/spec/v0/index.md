---
title: Docs Feedback Protocol — v0
description: Wire format and HTTP transport for AI agents to file structured reports against documentation pages.
---
**Status:** draft (`v0.1.1`).
**Editors:** the FixYourDocs project.
**Repository:** <https://github.com/fixyourdocs/protocol>.
**Canonical URL:** <https://docsfeedback.org/spec/v0>.

This document specifies version 0 of the Docs Feedback Protocol: a wire
format and minimal HTTP transport for AI agents to file structured
reports against documentation pages when the docs break the agent's
task. Reports flow from a *client* (an agent or a tool acting on its
behalf) to a *receiving endpoint* (the docs-publishing organisation or
a hub acting for it).

The keywords **MUST**, **MUST NOT**, **REQUIRED**, **SHALL**, **SHALL
NOT**, **SHOULD**, **SHOULD NOT**, **RECOMMENDED**, **MAY**, and
**OPTIONAL** in this document are to be interpreted as described in
[BCP 14](https://www.rfc-editor.org/info/bcp14)
([RFC 2119](https://www.rfc-editor.org/rfc/rfc2119),
[RFC 8174](https://www.rfc-editor.org/rfc/rfc8174)) when, and only
when, they appear in all capitals.

## 1. Motivation

When an AI coding agent attempts a task and the documentation it
consults is wrong, stale, broken, or ambiguous, today the failure mode
is silent: the agent retries, falls back to guessing, fails the task,
or fabricates. The maintainer of the documentation never learns that
the agent stumbled, and the failure repeats forever across every agent
that consults the same page.

v0 standardises one narrow exchange: an agent submits a structured
report about a documentation page. The receiving organisation MAY then
triage that report into their normal docs workflow. v0 deliberately
does not standardise the triage workflow, server-to-server fan-out, or
authentication beyond opaque bearer tokens.

## 2. Scope

v0 specifies:

- The JSON body of a single report (§3, §4).
- Discovery: how an organisation advertises that it accepts reports
  (§5).
- Idempotency / dedup semantics (§6).
- The HTTP request/response contract for `POST /v1/reports` (§7).
- Versioning and capability-negotiation rules so v1 can extend without
  breaking v0 clients (§8).

v0 explicitly does NOT specify:

- Authentication mechanisms beyond opaque bearer tokens.
- Server-to-server federation or fan-out across endpoints.
- Maintainer acknowledgement state machines beyond "received".
- Bulk-submission endpoints.
- Long-polling or webhook callbacks to the client.

These are reserved for a future v0.x or v1.

## 3. Terminology

- **Agent.** A software process, typically AI-driven, that produces
  reports about documentation it has consulted.
- **Client.** The process that holds the credentials and performs the
  HTTP request. The client is usually the agent itself; it MAY be a
  separate tool acting on the agent's behalf (e.g. an MCP server or
  CLI).
- **Doc URL.** The HTTPS URL of the documentation page the report is
  about.
- **Receiving organisation.** The party that publishes the doc URL.
- **Endpoint.** An HTTPS URL that accepts `POST /v1/reports` on behalf
  of one or more receiving organisations.
- **Hub.** A multi-tenant endpoint operated by a third party that
  forwards or stores reports for receiving organisations.

## 4. Report wire format

### 4.1 Top-level shape

A report is a single JSON object validated against
[`schema/v0/report.schema.json`](https://github.com/fixyourdocs/protocol/blob/main/schema/v0/report.schema.json).
The schema is normative; this prose is descriptive.

Required top-level fields:

| Field | Type | Notes |
|---|---|---|
| `protocol_version` | string | MUST be exactly `"0"` in v0. |
| `doc_url` | string (URI) | The documentation page the report is about. |
| `agent` | object | See §4.2. |
| `report` | object | See §4.4. |

Optional top-level fields:

| Field | Type | Notes |
|---|---|---|
| `task_context` | object | What the agent was trying to do. §4.5. |
| `idempotency_key` | string | Dedup key. §6. |
| `submitted_at` | string (RFC 3339) | Agent's clock at submission. |
| `locale` | string (BCP-47) | Language of the report body; defaults to `en`. |
| `client_capabilities` | array of string | Capability tokens. §8. |

`additionalProperties: false` applies at every level. A v0 server
MUST reject unknown top-level fields with `400`; this is a deliberate
constraint to keep v0 small. Forward-compatible additions land via
`client_capabilities` (§8) or under a `v0.x` minor schema.

`$comment` is reserved at the top level for tooling-only annotations
(SPDX headers in stored fixtures, debugging notes in transit). Servers
SHOULD ignore it and MUST NOT treat it as part of the report
semantics. Clients SHOULD NOT depend on it being preserved end-to-end.

### 4.2 Agent identification

```json
{
  "agent": {
    "name": "claude-code",
    "version": "1.4.2",
    "vendor": "Anthropic"
  }
}
```

`agent.name` is REQUIRED and SHOULD be a stable, lowercase,
kebab-case identifier (regex: `^[a-z0-9]([a-z0-9-]*[a-z0-9])?$`,
max 64 chars). Agents SHOULD NOT change their `name` across releases.

`agent.version` is OPTIONAL and free-form. Servers MUST NOT parse it
as semver; it is for logging and triage only.

`agent.vendor` is OPTIONAL and human-readable.

A server MAY reject submissions from `agent.name` values it does not
recognise with `422`. v0 does not provide a registry of agent names;
agents and servers coordinate out of band.

### 4.3 Doc URL canonicalisation

The client SHOULD submit `doc_url` as it actually observed the page,
including query string. The client SHOULD NOT pre-canonicalise.

For dedup, indexing, and policy enforcement, the server MUST apply
the following canonicalisation:

1. Lowercase the scheme and host.
2. If the scheme is not `https`, reject with `400` (the protocol is
   HTTPS-only in v0).
3. Remove the fragment.
4. Remove these query parameters if present: any whose name matches
   `^utm_`, `^mc_`, or is one of `gclid`, `fbclid`, `ref`, `ref_src`,
   `ref_url`.
5. If the path is `/`, leave the trailing slash; otherwise remove a
   single trailing slash if present.
6. Percent-decode any over-encoded unreserved characters per
   [RFC 3986 §6.2.2.2](https://www.rfc-editor.org/rfc/rfc3986#section-6.2.2.2).

The canonical form is internal to the server. Servers MUST store and
echo back the original `doc_url` as submitted.

### 4.4 The `report` body

```json
{
  "report": {
    "kind": "incorrect",
    "summary": "ListBuckets returns 403 with the IAM policy from the quickstart.",
    "details": "The quickstart at …",
    "evidence": [
      { "kind": "error_message", "text": "AccessDenied: …" },
      { "kind": "expected",      "text": "Listing buckets succeeds." }
    ],
    "suggested_fix": "Add `s3:ListAllMyBuckets` to the quickstart policy."
  }
}
```

`report.kind` is REQUIRED. v0 defines exactly six values, designed to
be exhaustive without overlapping:

- `broken` — the documented procedure does not run at all (link 404s,
  command errors out with the exact inputs given, snippet does not
  compile).
- `incorrect` — the procedure runs but produces a different result
  than the docs describe.
- `outdated` — the docs describe a previous version's behaviour; the
  current version differs.
- `missing` — required information is not present where the reader
  expects it.
- `unclear` — the information is present but ambiguous enough that the
  agent could not act on it without guessing.
- `other` — anything that does not fit the above. Agents SHOULD prefer
  one of the specific kinds; `other` SHOULD include `report.details`.

`report.summary` is REQUIRED, plain text, max 500 characters. It is
the headline the receiving organisation triages from.

`report.details`, `report.evidence`, and `report.suggested_fix` are
OPTIONAL. `evidence.kind` is an enum (see schema) chosen to be useful
to a maintainer without requiring NLP on the body. Free-form prose is
CommonMark.

Clients MUST NOT include credentials, end-user PII, or proprietary
source code from outside the documented project in any report field.
Servers SHOULD apply a coarse secret-scanner pass on `details`,
`evidence`, and `task_context.transcript_excerpt` and reject with `422`
on hits.

### 4.5 Task context

```json
{
  "task_context": {
    "task_summary": "Wire S3 uploads into the demo app.",
    "transcript_excerpt": "…"
  }
}
```

OPTIONAL. If present, it explains what the agent was trying to do when
the doc failed it. `transcript_excerpt` is for maintainer context only
and MUST be redacted by the client.

## 5. Discovery: opt-in and opt-out

v0 uses HTTPS-published discovery documents to signal that an
organisation accepts (or refuses) reports about their docs. Clients
MUST honour opt-out.

### 5.1 Well-known document

A receiving organisation MAY publish a JSON document at
`/.well-known/docs-feedback.json` on each host that serves their
documentation, validated against
[`schema/v0/well-known.schema.json`](https://github.com/fixyourdocs/protocol/blob/main/schema/v0/well-known.schema.json).

Example (opt-in):

```json
{
  "protocol_version": "0",
  "opt_in": true,
  "endpoint": "https://hub.fixyourdocs.io/v1/reports/example-org",
  "accepts": ["broken", "incorrect", "outdated", "missing", "unclear"],
  "policy_url": "https://example.com/docs-feedback-policy",
  "contact": "mailto:docs@example.com"
}
```

Example (opt-out):

```json
{
  "protocol_version": "0",
  "opt_in": false,
  "since": "2026-06-01T00:00:00Z"
}
```

### 5.2 Resolving the endpoint

Given a `doc_url`, a v0 client MUST resolve the endpoint as follows:

1. Fetch `https://<host>/.well-known/docs-feedback.json` over HTTPS.
   Follow at most three redirects.
2. If the document is present and `opt_in` is `true`, use the
   `endpoint` field.
3. If the document is present and `opt_in` is `false`, the client
   MUST NOT submit a report. The opt-out is binding.
4. If the document is absent (404) or invalid, the client MAY fall
   back to a configured default hub. Submitting to a default hub
   without a published opt-in is allowed in v0; the hub is responsible
   for storing the report dormantly until the receiving organisation
   claims the domain or for refusing it.
5. Network errors at discovery SHOULD be treated as "absent".

Discovery results MAY be cached for up to 24 hours, keyed by host. A
client that caches MUST honour an `opt_in: false` cache hit even after
the underlying document changes, until the cache entry expires.

### 5.3 In-page hint (informational)

Pages MAY include an HTML meta tag as a hint for clients that have
already loaded the page:

```html
<meta name="docs-feedback" content="https://hub.fixyourdocs.io/v1/reports/example-org">
<meta name="docs-feedback" content="opted-out">
```

The well-known document is authoritative; the meta tag is a
convenience.

### 5.4 Consumer-side clients

A client may report on docs it merely *consulted* while doing unrelated
work — a third-party library, API, framework, or hosted docs site the
agent read but does not own — rather than on the docs of the project it
is installed in. This "report-anywhere" usage carries the **same**
obligations as any other v0 client, plus two that matter more because
the client is now pointed at the open internet on a user's behalf:

1. **Opt-out is still binding.** A consumer-side client MUST run §5.2
   discovery against the `doc_url` host and MUST NOT submit when the
   host publishes `opt_in: false`, exactly as in §5.2 step 3. The
   `doc_url` host — not the project the client runs in — is the host
   whose opt-out governs.
2. **Privacy guard before egress.** Because the report leaves the user's
   machine for a third party, the client MUST honour §9 and §10
   strictly: it MUST NOT transmit the user's own project's private
   source, internal URLs, secrets, or transcript excerpts, and it
   SHOULD refuse outright to report a `doc_url` that is not a public
   `https://` page (e.g. `localhost`, loopback, RFC 1918 / link-local
   addresses, or `*.internal` / `*.local` hosts) — such a URL is by
   construction not third-party public documentation. The consent of
   the human the agent acts for SHOULD be obtained before sending.

These are clarifications of existing §5.2, §9, and §10 obligations for
the consumer-side case; they do not change the wire format.

## 6. Idempotency

Every report has an idempotency key. The key MAY come from:

1. The `Idempotency-Key` HTTP request header.
2. The `idempotency_key` body field.
3. A server-computed default.

Precedence: header > body. If both are present and they differ, the
server MUST honour the header and ignore the body field.

If neither is supplied, the server MUST compute the default as:

```
sha256(
  canonical_doc_url + "\n" +
  agent.name + "\n" +
  report.summary
)
```

truncated to the first 16 hex characters, prefixed with `auto:`. This
deduplicates at the granularity of "same agent, same canonical doc
page, same summary line."

The server MUST treat a repeat submission with the same idempotency
key (within a window of at least 7 days) as a duplicate. Duplicates
MUST be answered with `200 OK` and the body of the original
acknowledgement. Clients MUST be prepared for either `200` or `201`
on apparently new submissions, because parallel retries may race.

Idempotency keys are ASCII-printable strings, 1–128 characters, case-sensitive.

## 7. HTTP transport

### 7.1 Request

```
POST /v1/reports HTTP/1.1
Host: hub.example.org
Content-Type: application/json; charset=utf-8
X-Docs-Feedback-Protocol-Version: 0
Idempotency-Key: <opaque>            ; OPTIONAL
Authorization: Bearer <opaque-token> ; OPTIONAL
```

`Content-Type` MUST be `application/json` with optional `charset=utf-8`.
`X-Docs-Feedback-Protocol-Version` MUST be sent and MUST equal the
top-level `protocol_version` body field. Mismatch is `400`.

`Authorization` is OPTIONAL in v0. When present, the token is opaque
to the protocol. The server decides whether anonymous submissions are
accepted; if it requires auth, it MUST respond with `401` to anonymous
requests.

### 7.2 Successful response

`201 Created` for a new submission, `200 OK` for a duplicate:

```json
{
  "id": "rep_01HZA4F8PD9YQF1XGM3KQ8E5VR",
  "received_at": "2026-06-06T12:34:56Z",
  "protocol_version": "0",
  "server_capabilities": []
}
```

`id` is server-generated, opaque, stable for the lifetime of the
submission, and MUST be returned on duplicates as well. `received_at`
is RFC 3339. `server_capabilities` is an array of strings; v0 servers
MAY return `[]`. See §8.

### 7.3 Error responses

| Status | When | Body shape |
|---|---|---|
| `400` | Body is not valid JSON, fails schema validation, has unknown top-level fields, or the version header disagrees with the body. | `{ "error": "validation_error", "details": [{ "path": "…", "message": "…" }] }` |
| `401` | Auth required and missing/invalid. | `{ "error": "auth_required" }` |
| `404` | Endpoint URL does not correspond to a known receiving organisation. | `{ "error": "not_found" }` |
| `410` | The receiving organisation has opted out since this client last cached. | `{ "error": "opted_out", "since": "<rfc3339>" }` |
| `413` | Body exceeds the server's size limit. | `{ "error": "payload_too_large", "max_bytes": <int> }` |
| `415` | Content-Type was not JSON. | `{ "error": "unsupported_media_type" }` |
| `422` | Body validated but server rejected on policy (e.g. unknown agent.name, secrets in evidence, doc_url not on accepted host). | `{ "error": "policy_rejected", "reason": "<string>" }` |
| `429` | Rate-limited. The server SHOULD set `Retry-After`. | `{ "error": "rate_limited" }` |
| `503` | Temporary outage. | `{ "error": "unavailable" }` |

All error bodies MUST be valid JSON and SHOULD include an `error`
string from the table above. Clients MUST NOT rely on `details` shape
beyond "array of objects with stringy `path` and `message`."

### 7.4 Request size

v0 servers MUST accept bodies up to 32 KiB. Larger bodies MAY be
rejected with `413`. Clients SHOULD keep bodies under 16 KiB in
practice; long `transcript_excerpt` payloads are the most common cause
of bloat.

## 8. Versioning and capability negotiation

v0 is the first stable wire format. Its evolution rules:

1. **Major version in the URL and body.** The HTTP path is `/v1/...`,
   the body field is `protocol_version: "0"`. A future v1 lives at
   `/v2/...` with `protocol_version: "1"`. A v1 server MUST accept v0
   bodies at `/v1/reports`.
2. **Schema additions are opt-in via capabilities.** Optional fields
   added in v0.x or v1 SHALL be gated on a capability token in
   `client_capabilities` (sent by the client) and
   `server_capabilities` (returned by the server). A v0 server that
   does not understand a capability token MUST ignore it.
3. **No silent renames.** Field renames or removals require a new
   major version.
4. **Enums grow forward, not sideways.** Future versions MAY add
   values to `report.kind` and `evidence.kind`. A v0 server MUST
   reject unknown enum values with `400` (because `additionalProperties:
   false` and the explicit enum), so clients targeting v0 MUST stick
   to the v0 enum.

Capability tokens are lowercase, dot/underscore/dash separated, max 64
characters. The token registry is maintained alongside the schema in
this repository.

## 9. Security considerations

- **HTTPS only.** Endpoints, the well-known document, and any redirect
  hops MUST be HTTPS.
- **No credentials in payloads.** Clients MUST strip secrets before
  including any agent transcript or error message.
- **Opt-out is binding.** A client that ignores an `opt_in: false`
  signal is non-conformant.
- **Rate limiting.** Servers SHOULD apply per-`agent.name` and
  per-source-IP rate limits and respond with `429` + `Retry-After`.
- **Trust model.** v0 does not verify that the submitting agent is who
  it claims to be. `agent.name` is self-declared. Servers requiring
  attribution MUST layer auth on top.
- **Data minimisation.** Clients SHOULD include only the smallest
  excerpt of transcript that explains the failure.

## 10. Privacy considerations

- **End-user content.** Agents act on behalf of human users. The
  user's prompts, code, and other artefacts MUST NOT be transmitted
  in a report.
- **Identifiers.** v0 carries no end-user identifier. `agent` carries
  no individual identifier. Hubs MAY associate reports with maintainer
  accounts; that association is out of scope here.
- **Retention.** Receiving organisations and hubs SHOULD publish a
  retention policy at the URL named in their well-known document's
  `policy_url`.

## 11. Examples

See [`examples/`](/spec/v0/examples/) for three canonical examples:

- [`minimum-required.json`](/spec/v0/examples/#minimum-required-json) — the
  smallest valid v0 report.
- [`golden-path.json`](/spec/v0/examples/#golden-path-json) — a typical report
  with evidence and a suggested fix.
- [`full.json`](/spec/v0/examples/#full-json) — every optional field populated.

The known-bad [`invalid.json`](/spec/v0/examples/#invalid-json) is included as a
negative test for tooling.

## 12. Conformance

A client is v0-conformant if:

- Every body it submits validates against
  [`schema/v0/report.schema.json`](https://github.com/fixyourdocs/protocol/blob/main/schema/v0/report.schema.json).
- It honours opt-out signals per §5.
- It includes `X-Docs-Feedback-Protocol-Version: 0` on every request.

A server is v0-conformant if:

- It accepts every body that validates against the schema, except as
  permitted by `422` policy rejection.
- It applies the precedence rules in §6 for idempotency.
- It rejects unknown top-level fields with `400`.
- It returns the response shape in §7.2 on success.

## 13. References

Normative:

- [RFC 2119](https://www.rfc-editor.org/rfc/rfc2119) — Key words for
  use in RFCs to Indicate Requirement Levels.
- [RFC 3339](https://www.rfc-editor.org/rfc/rfc3339) — Date and Time
  on the Internet: Timestamps.
- [RFC 3986](https://www.rfc-editor.org/rfc/rfc3986) — Uniform
  Resource Identifier (URI): Generic Syntax.
- [RFC 8174](https://www.rfc-editor.org/rfc/rfc8174) — Ambiguity of
  Uppercase vs Lowercase in RFC 2119 Key Words.
- [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259) — JSON.
- [BCP 47](https://www.rfc-editor.org/info/bcp47) — Tags for
  Identifying Languages.
- [JSON Schema 2020-12](https://json-schema.org/draft/2020-12/schema).
- [CommonMark 0.30](https://spec.commonmark.org/0.30/).

Informative:

- IETF draft on the Idempotency-Key HTTP header,
  <https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/>.

## 14. Licence

The prose in this document is licensed under
[CC BY 4.0](https://github.com/fixyourdocs/protocol/blob/main/LICENSE.spec). Code samples and the JSON Schema
artefacts under [`schema/`](https://github.com/fixyourdocs/protocol/tree/main/schema) are licensed under
[Apache 2.0](https://github.com/fixyourdocs/protocol/blob/main/LICENSE). See the repository
[LICENSE](https://github.com/fixyourdocs/protocol/blob/main/LICENSE) and [LICENSE.spec](https://github.com/fixyourdocs/protocol/blob/main/LICENSE.spec) files
for the full text.
