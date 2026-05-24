---
title: v0 examples
description: Canonical example reports and a known-bad fixture for negative tests.
---

These JSON files are reference fixtures for the
[v0 wire format](/spec/v0/). They are governed by Apache 2.0
(see the repository-root [LICENSE](https://github.com/fixyourdocs/protocol/blob/main/LICENSE)); the SPDX header
on each file appears in the `$comment` field, which the schema permits
for tooling annotations.

| File | Purpose | Schema verdict |
|---|---|---|
| [`minimum-required.json`](#minimum-required-json) | Smallest valid v0 report. Exercises only required fields. | valid |
| [`golden-path.json`](#golden-path-json) | Typical agent submission with evidence and a suggested fix. | valid |
| [`full.json`](#full-json) | Every optional field populated. | valid |
| [`invalid.json`](#invalid-json) | Known-bad fixture for negative tests. `report.kind` is outside the v0 enum and an unknown top-level field `priority` is present. | invalid |

## Validating locally

From the repository root:

```sh
npx ajv-cli@5 validate \
  -s schema/v0/report.schema.json \
  --spec=draft2020 --strict=false --all-errors \
  -d 'spec/v0/examples/minimum-required.json' \
  -d 'spec/v0/examples/golden-path.json' \
  -d 'spec/v0/examples/full.json'

# Negative: this MUST fail.
npx ajv-cli@5 validate \
  -s schema/v0/report.schema.json \
  --spec=draft2020 --strict=false --all-errors \
  -d 'spec/v0/examples/invalid.json' \
  && { echo "expected invalid.json to fail"; exit 1; } || echo "invalid.json rejected — as expected"
```


## minimum-required.json {#minimum-required-json}

```json
{
  "$comment": "SPDX-License-Identifier: Apache-2.0 — smallest valid v0 report.",
  "protocol_version": "0",
  "doc_url": "https://docs.example.com/getting-started",
  "agent": {
    "name": "aider"
  },
  "report": {
    "kind": "missing",
    "summary": "The page does not document how to set the AIDER_API_KEY env var."
  }
}
```

## golden-path.json {#golden-path-json}

```json
{
  "$comment": "SPDX-License-Identifier: Apache-2.0 — typical report with evidence and a suggested fix.",
  "protocol_version": "0",
  "doc_url": "https://docs.example.com/s3/quickstart",
  "agent": {
    "name": "claude-code",
    "version": "1.4.2",
    "vendor": "Anthropic"
  },
  "report": {
    "kind": "incorrect",
    "summary": "ListBuckets returns AccessDenied with the IAM policy from the quickstart.",
    "details": "The quickstart's inline IAM policy grants only `s3:GetObject`. Calling `aws s3 ls` (which calls `s3:ListAllMyBuckets`) therefore fails with AccessDenied.",
    "evidence": [
      { "kind": "attempted_action", "text": "aws s3 ls" },
      { "kind": "error_message",    "text": "An error occurred (AccessDenied) when calling the ListBuckets operation" },
      { "kind": "expected",         "text": "Listing buckets succeeds after applying the quickstart IAM policy." }
    ],
    "suggested_fix": "Add `s3:ListAllMyBuckets` to the policy in step 3, or replace `aws s3 ls` with `aws s3 ls s3://<bucket>` in the verification step."
  },
  "task_context": {
    "task_summary": "Follow the S3 quickstart to upload a file from the demo app."
  },
  "submitted_at": "2026-06-06T12:34:56Z"
}
```

## full.json {#full-json}

```json
{
  "$comment": "SPDX-License-Identifier: Apache-2.0 — every optional v0 field populated.",
  "protocol_version": "0",
  "doc_url": "https://docs.example.com/api/widgets?lang=en",
  "agent": {
    "name": "cursor",
    "version": "0.45.1",
    "vendor": "Anysphere"
  },
  "report": {
    "kind": "outdated",
    "summary": "The `widgets.list()` example uses the v1 response shape; v2 wraps results in `data`.",
    "details": "The page still shows the v1 shape:\n\n```json\n[{\"id\": \"…\"}]\n```\n\nThe live API (v2, since 2025-09) returns:\n\n```json\n{\"data\": [{\"id\": \"…\"}], \"next_cursor\": null}\n```",
    "evidence": [
      { "kind": "observed",      "text": "{\"data\": [{\"id\": \"wid_42\"}], \"next_cursor\": null}" },
      { "kind": "expected",      "text": "[{\"id\": \"wid_42\"}]" },
      { "kind": "code_snippet",  "text": "const widgets = await client.widgets.list();\nwidgets.map(w => w.id); // TypeError" },
      { "kind": "quote",         "text": "\"widgets.list() returns an array of widget objects\"" }
    ],
    "suggested_fix": "Update the example to destructure `data` (and mention `next_cursor`):\n\n```js\nconst { data: widgets } = await client.widgets.list();\n```"
  },
  "task_context": {
    "task_summary": "Implement a Widgets listing screen following the docs example.",
    "transcript_excerpt": "I tried to call widgets.list() per the docs, but the returned value is an object, not an array, so .map crashed."
  },
  "idempotency_key": "01HZA4F8PD9YQF1XGM3KQ8E5VR",
  "submitted_at": "2026-06-06T12:35:11Z",
  "locale": "en",
  "client_capabilities": []
}
```

## invalid.json {#invalid-json}

```json
{
  "$comment": "SPDX-License-Identifier: Apache-2.0 — known-bad fixture; MUST be rejected (bad kind + unknown field).",
  "protocol_version": "0",
  "doc_url": "https://docs.example.com/getting-started",
  "agent": {
    "name": "aider"
  },
  "report": {
    "kind": "blocking",
    "summary": "Example used for tooling negative tests; do not submit to a live endpoint."
  },
  "priority": "high"
}
```
