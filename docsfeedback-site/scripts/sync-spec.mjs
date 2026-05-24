#!/usr/bin/env node
// Sync the v0 spec (markdown) and v0 JSON schemas from a sibling
// checkout of fixyourdocs/protocol into this package.
//
// - Reads from   ../../protocol/spec/v0/    and ../../protocol/schema/v0/
// - Writes spec markdown to  src/content/docs/spec/v0/
// - Writes schemas to        public/schema/v0/  (served verbatim under /schema/v0/)
//
// The synced files are committed to this repo so CI can build without
// the protocol working copy alongside. Re-run this script (or
// `pnpm sync`) whenever protocol/spec/v0/ changes upstream.
//
// If ../../protocol/ is not present, the script no-ops with a warning;
// the committed copies are used instead.

import { readFile, writeFile, mkdir, copyFile, access } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkgRoot = resolve(__dirname, '..');
const protocolRoot = resolve(pkgRoot, '..', '..', 'protocol');

const SPEC_SRC = join(protocolRoot, 'spec', 'v0');
const SCHEMA_SRC = join(protocolRoot, 'schema', 'v0');

const SPEC_DST = join(pkgRoot, 'src', 'content', 'docs', 'spec', 'v0');
const SCHEMA_DST = join(pkgRoot, 'public', 'schema', 'v0');

async function exists(path) {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

// Rewrite the relative links in the spec's README so they resolve once
// the prose is rendered at /spec/v0/.
//  - schema/v0/... and ../../schema/v0/... -> Github blob URL for now
//    (we serve the JSON locally too, but Starlight expects content
//     links, not asset links; keep the canonical reference clear)
//  - examples/...  -> /spec/v0/examples/   (rendered inline on that page)
//  - ../../LICENSE  -> Github blob URL
function rewriteSpecLinks(md) {
  let out = md;
  // (../../schema/v0/<file>) -> https://github.com/fixyourdocs/protocol/blob/main/schema/v0/<file>
  out = out.replace(
    /\]\(\.\.\/\.\.\/schema\/v0\/([^)\s]+)\)/g,
    '](https://github.com/fixyourdocs/protocol/blob/main/schema/v0/$1)'
  );
  // (../../LICENSE) and (../../LICENSE.spec) -> Github blob URL
  out = out.replace(
    /\]\(\.\.\/\.\.\/(LICENSE(?:\.spec)?)\)/g,
    '](https://github.com/fixyourdocs/protocol/blob/main/$1)'
  );
  // (../../schema/) -> Github tree URL for the schema directory
  out = out.replace(
    /\]\(\.\.\/\.\.\/schema\/\)/g,
    '](https://github.com/fixyourdocs/protocol/tree/main/schema)'
  );
  // (examples/<file>.json) -> fragment on the rendered examples page
  // (replace the dot in the filename with a dash to match the anchor we emit)
  out = out.replace(
    /\]\(examples\/([a-zA-Z0-9-]+)\.json\)/g,
    '](/spec/v0/examples/#$1-json)'
  );
  // (examples/) -> /spec/v0/examples/
  out = out.replace(/\]\(examples\/\)/g, '](/spec/v0/examples/)');
  return out;
}

// Rewrite the relative links in the protocol/spec/v0/examples/README.md so
// they resolve on the rendered /spec/v0/examples/ page.
function rewriteExamplesReadmeLinks(md) {
  let out = md;
  // (../README.md) -> /spec/v0/
  out = out.replace(/\]\(\.\.\/README\.md\)/g, '](/spec/v0/)');
  // (../../../LICENSE) -> Github blob URL
  out = out.replace(
    /\]\(\.\.\/\.\.\/\.\.\/LICENSE\)/g,
    '](https://github.com/fixyourdocs/protocol/blob/main/LICENSE)'
  );
  // (<filename>.json) -> fragment on this same page (e.g. minimum-required.json -> #minimum-required-json)
  out = out.replace(
    /\]\(([a-zA-Z0-9-]+)\.json\)/g,
    '](#$1-json)'
  );
  return out;
}

// Strip the first H1 from the body (Starlight renders the title from
// frontmatter; a duplicate H1 below it looks wrong).
function stripFirstH1(md) {
  return md.replace(/^#\s+.+\n+/, '');
}

// Strip any leading SPDX HTML comment line so it doesn't show in prose.
function stripSpdxComment(md) {
  return md.replace(/^<!--\s*SPDX-License-Identifier:[^\n]*-->\s*\n+/, '');
}

function frontmatter(title, description) {
  return [
    '---',
    `title: ${title}`,
    `description: ${description}`,
    '---',
    '',
  ].join('\n');
}

async function syncSpecOverview() {
  const src = join(SPEC_SRC, 'README.md');
  const raw = await readFile(src, 'utf8');
  const body = rewriteSpecLinks(stripFirstH1(stripSpdxComment(raw)));
  const out =
    frontmatter(
      'Docs Feedback Protocol — v0',
      'Wire format and HTTP transport for AI agents to file structured reports against documentation pages.'
    ) + body;
  const dst = join(SPEC_DST, 'index.md');
  await mkdir(dirname(dst), { recursive: true });
  await writeFile(dst, out);
  console.log(`wrote ${dst}`);
}

async function syncExamples() {
  const examplesDir = join(SPEC_SRC, 'examples');
  const readme = await readFile(join(examplesDir, 'README.md'), 'utf8');
  const readmeBody = rewriteExamplesReadmeLinks(
    stripFirstH1(stripSpdxComment(readme))
  );
  const filenames = ['minimum-required.json', 'golden-path.json', 'full.json', 'invalid.json'];
  const parts = [
    frontmatter(
      'v0 examples',
      'Canonical example reports and a known-bad fixture for negative tests.'
    ),
    readmeBody,
    '',
  ];
  for (const name of filenames) {
    const slug = name.replace(/\.json$/, '');
    const body = await readFile(join(examplesDir, name), 'utf8');
    parts.push(`## ${name} {#${slug}-json}`);
    parts.push('');
    parts.push('```json');
    parts.push(body.trimEnd());
    parts.push('```');
    parts.push('');
  }
  const dst = join(SPEC_DST, 'examples.md');
  await mkdir(dirname(dst), { recursive: true });
  await writeFile(dst, parts.join('\n'));
  console.log(`wrote ${dst}`);
}

async function syncSchemas() {
  await mkdir(SCHEMA_DST, { recursive: true });
  for (const name of ['report.schema.json', 'well-known.schema.json']) {
    const src = join(SCHEMA_SRC, name);
    const dst = join(SCHEMA_DST, name);
    await copyFile(src, dst);
    console.log(`wrote ${dst}`);
  }
}

async function main() {
  if (!(await exists(protocolRoot))) {
    console.warn(
      `[sync-spec] WARNING: ${protocolRoot} not found; ` +
        'using the previously-synced copies committed to this repo. ' +
        'This is expected in CI; re-run locally with the protocol sibling to refresh.'
    );
    return;
  }
  await syncSpecOverview();
  await syncExamples();
  await syncSchemas();
}

await main();
