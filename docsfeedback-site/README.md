# docsfeedback-site

Source for [docsfeedback.org](https://docsfeedback.org) — the canonical
home of the Docs Feedback Protocol. Built with
[Starlight](https://starlight.astro.build).

The protocol spec is authored in
[`fixyourdocs/protocol`](https://github.com/fixyourdocs/protocol). A small
sync step copies the markdown from `protocol/spec/v0/` and JSON schemas
from `protocol/schema/v0/` into this package at build time; copies are
checked in so CI builds without needing the `protocol` working copy
alongside.

## Commands

Run from the monorepo root:

| Command | What it does |
| --- | --- |
| `pnpm --filter @fyd/docsfeedback-site dev` | Starlight dev server at `http://localhost:4321` |
| `pnpm --filter @fyd/docsfeedback-site sync` | Re-copy spec markdown + schema JSON from `../protocol/` |
| `pnpm --filter @fyd/docsfeedback-site build` | Production build to `dist/` (runs `sync` first via `prebuild`) |
| `pnpm --filter @fyd/docsfeedback-site preview` | Preview the production build locally |

## Layout

```
docsfeedback-site/
├── astro.config.mjs
├── package.json
├── public/
│   └── schema/v0/             ← synced JSON schemas, served verbatim at /schema/v0/
├── scripts/
│   └── sync-spec.mjs          ← copies spec + schemas from ../../protocol/
└── src/
    ├── content.config.ts
    └── content/
        └── docs/
            ├── index.mdx                ← landing
            ├── implementations.mdx
            ├── contributing.mdx
            └── spec/v0/
                ├── index.md             ← synced
                ├── examples.md          ← synced
                └── schemas.md           ← hand-written explanation
```

## Deploy

The site ships to AWS via the `FydDocsfeedbackStack` in
[`infra/`](../infra/). Deploy is currently manual; see the runbook in
the private `control` repo for the exact commands.

## Licence

The site renderer (this package) inherits the monorepo licence
(`FSL-1.1-Apache-2.0`). The spec prose synced from `protocol/spec/v0/`
is licensed under CC BY 4.0; the JSON schemas synced from
`protocol/schema/v0/` are licensed under Apache 2.0. See the
[protocol repo](https://github.com/fixyourdocs/protocol) for the full
text.
