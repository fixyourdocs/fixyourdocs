#!/usr/bin/env node
// Generate the two Docs Feedback Protocol dogfood files for docsfeedback.org,
// so the protocol home advertises that it accepts reports and agents can
// auto-discover it (mirrors what docs-site/scripts/{well-known,sync-snippets}.mjs
// do for docs.fixyourdocs.io):
//
//   1. public/.well-known/docs-feedback.json — the v0 discovery document.
//      Shape per ../public/schema/v0/well-known.schema.json (protocol_version +
//      opt_in required; endpoint required when opt_in is true). This is a
//      constant, generated unconditionally.
//   2. public/AGENTS.md — the canonical "## Documentation feedback" block,
//      synced verbatim from ../../agents-md-snippet/AGENTS.md so it can't drift
//      from the canonical wording.
//
// Both are served verbatim from public/ (at /.well-known/docs-feedback.json and
// /AGENTS.md). The committed copies are the source of truth for CI; re-run
// `pnpm sync` to refresh. If agents-md-snippet is not checked out alongside
// (expected in CI), the AGENTS.md sync no-ops with a warning and the committed
// copy is left untouched.

import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const siblingsRoot = resolve(pkgRoot, '..', '..');

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function writeWellKnown() {
  const wellKnown = {
    protocol_version: '0',
    opt_in: true,
    endpoint: 'https://hub.fixyourdocs.io/v1/reports',
    doc_domains: ['docsfeedback.org'],
    contact: 'mailto:hello@fixyourdocs.io',
  };
  const dst = join(pkgRoot, 'public', '.well-known', 'docs-feedback.json');
  await mkdir(dirname(dst), { recursive: true });
  await writeFile(dst, JSON.stringify(wellKnown, null, 2) + '\n');
  console.log(`wrote ${dst}`);
}

// Copy the canonical "## Documentation feedback" block (that heading to EOF)
// from agents-md-snippet/AGENTS.md into public/AGENTS.md.
async function syncAgentsBlock() {
  const src = join(siblingsRoot, 'agents-md-snippet', 'AGENTS.md');
  if (!(await exists(src))) {
    console.warn(
      '[dogfood] skip: agents-md-snippet not checked out (public/AGENTS.md unchanged)'
    );
    return;
  }
  const raw = await readFile(src, 'utf8');
  const idx = raw.indexOf('## Documentation feedback');
  if (idx === -1) {
    console.warn(
      '[dogfood] could not find the canonical block in agents-md-snippet/AGENTS.md'
    );
    return;
  }
  const block = raw.slice(idx).trimEnd() + '\n';
  const served =
    '# AGENTS.md — docsfeedback.org\n\n' +
    'This file is served verbatim at https://docsfeedback.org/AGENTS.md so ' +
    'that any AI agent reading these docs can report problems with them.\n\n' +
    block;
  await writeFile(join(pkgRoot, 'public', 'AGENTS.md'), served);
  console.log('wrote public/AGENTS.md');
}

await writeWellKnown();
await syncAgentsBlock();
