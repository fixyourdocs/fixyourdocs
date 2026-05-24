---
title: Schemas
description: JSON Schemas for the v0 report wire format and the well-known discovery document.
---

The v0 wire format is normative as JSON Schema (draft 2020-12). The
prose in the [spec](/spec/v0/) is descriptive; when the two disagree,
the schema wins.

## Report schema

Validates the body of a `POST /v1/reports` request. See spec §4.

- Download: [`/schema/v0/report.schema.json`](/schema/v0/report.schema.json)
- Source: [`protocol/schema/v0/report.schema.json`](https://github.com/fixyourdocs/protocol/blob/main/schema/v0/report.schema.json)
- `$id`: `https://docsfeedback.org/schema/v0/report.schema.json`

Tools that resolve `$ref` against the canonical `$id` URL get the same
file served verbatim from this site.

### Validating an example with `ajv`

```sh
npx ajv-cli@5 validate \
  -s https://docsfeedback.org/schema/v0/report.schema.json \
  --spec=draft2020 --strict=false --all-errors \
  -d ./my-report.json
```

## Well-known schema

Validates the body of a `/.well-known/docs-feedback.json` discovery
document. See spec §5.

- Download: [`/schema/v0/well-known.schema.json`](/schema/v0/well-known.schema.json)
- Source: [`protocol/schema/v0/well-known.schema.json`](https://github.com/fixyourdocs/protocol/blob/main/schema/v0/well-known.schema.json)
- `$id`: `https://docsfeedback.org/schema/v0/well-known.schema.json`

A minimal opt-in document:

```json
{
  "protocol_version": "0",
  "opt_in": true,
  "endpoint": "https://hub.fixyourdocs.io/v1/reports/example-org"
}
```

A minimal opt-out:

```json
{
  "protocol_version": "0",
  "opt_in": false
}
```

## Licence

The schemas are licensed under
[Apache 2.0](https://github.com/fixyourdocs/protocol/blob/main/LICENSE).
