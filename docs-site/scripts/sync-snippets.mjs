#!/usr/bin/env node
// Sync code snippets and the canonical AGENTS.md block from sibling checkouts
// into this package, so doc code blocks don't drift from their source repos.
// Modelled on docsfeedback-site/scripts/sync-spec.mjs.
//
// Sources (sibling checkouts, one dir up from the monorepo):
//   ../../sdk-python/        ../../sdk-typescript/
//   ../../agents-md-snippet/ ../../protocol/
//
// What it does:
//   1. Copies fenced regions delimited by `>>> doc-snippet <name>` /
//      `<<< doc-snippet` markers (in any comment syntax) into
//      src/content/docs/v0/_snippets/<name>.md as a fenced code block.
//   2. Copies the canonical "## Documentation feedback" block from
//      agents-md-snippet/AGENTS.md into public/AGENTS.md (served at /AGENTS.md)
//      and docs-site/AGENTS.md (workspace-root dogfood).
//
// Resilience: if a sibling is not checked out, or a source file has no
// markers, the script SKIPS it with a warning and leaves the committed copies
// untouched. CI builds from the committed copies. Re-run locally with the
// siblings present to refresh (`pnpm sync`).

import { readFile, writeFile, mkdir, readdir, access } from 'node:fs/promises';
import { join, dirname, resolve, extname } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkgRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const siblingsRoot = resolve(pkgRoot, '..', '..');

const SNIPPET_DST = join(pkgRoot, 'src', 'content', 'docs', 'v0', '_snippets');

// repo dir -> language hint for the emitted fenced block
const SOURCES = [
  { dir: 'sdk-python', lang: 'python' },
  { dir: 'sdk-typescript', lang: 'ts' },
  { dir: 'agents-md-snippet', lang: 'markdown' },
  { dir: 'protocol', lang: 'json' },
];

const START = /(?:#|\/\/|<!--)\s*>>>\s*doc-snippet\s+([\w.-]+)/;
const END = /(?:#|\/\/)?\s*<<<\s*doc-snippet/;

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name === 'node_modules' || e.name === '.git' || e.name === 'dist') continue;
    const full = join(dir, e.name);
    if (e.isDirectory()) yield* walk(full);
    else if (['.md', '.py', '.ts', '.tsx', '.json', '.mjs'].includes(extname(e.name))) yield full;
  }
}

// Extract every `>>> doc-snippet <name>` … `<<<` region from a file.
function extractRegions(text) {
  const lines = text.split('\n');
  const out = [];
  let current = null;
  for (const line of lines) {
    if (current) {
      if (END.test(line)) {
        out.push({ name: current.name, body: current.body.join('\n').replace(/\n+$/, '') });
        current = null;
      } else {
        current.body.push(line);
      }
      continue;
    }
    const m = line.match(START);
    if (m) current = { name: m[1], body: [] };
  }
  return out;
}

async function syncSnippets() {
  let wrote = 0;
  for (const { dir, lang } of SOURCES) {
    const root = join(siblingsRoot, dir);
    if (!(await exists(root))) {
      console.warn(`[sync-snippets] skip: ${dir} not checked out (using committed copies)`);
      continue;
    }
    for await (const file of walk(root)) {
      const text = await readFile(file, 'utf8');
      for (const { name, body } of extractRegions(text)) {
        await mkdir(SNIPPET_DST, { recursive: true });
        const dst = join(SNIPPET_DST, `${name}.md`);
        const fenced = `\`\`\`${lang}\n${body}\n\`\`\`\n`;
        await writeFile(dst, fenced);
        console.log(`wrote ${dst} (from ${dir})`);
        wrote += 1;
      }
    }
  }
  if (wrote === 0) {
    console.warn(
      '[sync-snippets] no `>>> doc-snippet` markers found in any sibling; ' +
        'committed snippet copies are unchanged. (Add markers in the source ' +
        'repos to activate live sync — see README.)',
    );
  }
}

// Extract the canonical "## Documentation feedback" block from
// agents-md-snippet/AGENTS.md (everything from that heading to EOF).
async function syncAgentsBlock() {
  const src = join(siblingsRoot, 'agents-md-snippet', 'AGENTS.md');
  if (!(await exists(src))) {
    console.warn('[sync-snippets] skip: agents-md-snippet not checked out (AGENTS.md copies unchanged)');
    return;
  }
  const raw = await readFile(src, 'utf8');
  const idx = raw.indexOf('## Documentation feedback');
  if (idx === -1) {
    console.warn('[sync-snippets] could not find the canonical block in agents-md-snippet/AGENTS.md');
    return;
  }
  const block = raw.slice(idx).trimEnd() + '\n';

  const served =
    '# AGENTS.md — docs.fixyourdocs.io\n\n' +
    'This file is served verbatim at https://docs.fixyourdocs.io/AGENTS.md so ' +
    'that any AI agent reading these docs can report problems with them.\n\n' +
    block;
  await writeFile(join(pkgRoot, 'public', 'AGENTS.md'), served);
  console.log('wrote public/AGENTS.md');

  const repoDogfood =
    '# AGENTS.md\n\n' +
    'Source for [docs.fixyourdocs.io](https://docs.fixyourdocs.io). The block ' +
    'below is the canonical [Docs Feedback Protocol](https://docsfeedback.org) ' +
    'AGENTS.md block, dogfooded here like every other FixYourDocs repo.\n\n' +
    block;
  await writeFile(join(pkgRoot, 'AGENTS.md'), repoDogfood);
  console.log('wrote docs-site/AGENTS.md');
}

await syncSnippets();
await syncAgentsBlock();
