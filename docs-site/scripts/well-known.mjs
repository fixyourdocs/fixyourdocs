#!/usr/bin/env node
// Generate public/.well-known/docs-feedback.json — the Docs Feedback Protocol
// v0 discovery document for docs.fixyourdocs.io. This is the docs site
// dogfooding the protocol: it advertises that it accepts reports and where to
// send them. Served verbatim at https://docs.fixyourdocs.io/.well-known/docs-feedback.json
//
// Shape per https://docsfeedback.org/schema/v0/well-known.schema.json
// (protocol_version + opt_in required; endpoint required when opt_in is true).
//
// The committed copy is the source of truth for CI; re-run `pnpm sync` to
// regenerate it. The target repo + `docs:` Issue label are Hub-side
// integration config (D20), not well-known fields, so they do not appear here.

import { writeFile, mkdir } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dst = join(pkgRoot, 'public', '.well-known', 'docs-feedback.json');

const wellKnown = {
  protocol_version: '0',
  opt_in: true,
  endpoint: 'https://hub.fixyourdocs.io/v1/reports',
  doc_domains: ['docs.fixyourdocs.io'],
  contact: 'mailto:hello@fixyourdocs.io',
};

await mkdir(dirname(dst), { recursive: true });
await writeFile(dst, JSON.stringify(wellKnown, null, 2) + '\n');
console.log(`wrote ${dst}`);
