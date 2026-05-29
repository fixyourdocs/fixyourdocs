// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// Versioning model (P0-13): content-folder versioning, git-tag cut.
// Source of truth for the current docs is `src/content/docs/v0/`, served
// canonically under `/v0/`. Bare convenience paths (`/getting-started`, …)
// redirect to the current version so marketing links and the demo-video CTA
// keep resolving as the "latest" pointer moves to `/v1/` later. A release cut
// freezes a copy at `src/content/docs/v0.1/` (served under `/v0.1/`).
const V0_PAGES = [
  'getting-started',
  'protocol',
  'sdk/python',
  'sdk/typescript',
  'cli',
  'agents-md',
  'hub',
  'mcp',
  'versioning',
  'contributing',
];

const redirects = Object.fromEntries(
  V0_PAGES.map((p) => [`/${p}`, `/v0/${p}/`]),
);

// https://astro.build/config
export default defineConfig({
  site: 'https://docs.fixyourdocs.io',
  redirects,
  integrations: [
    starlight({
      title: 'FixYourDocs',
      description:
        'Documentation for the FixYourDocs product — the open protocol, the SDKs, the CLI, the Hub, and the MCP server.',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/fixyourdocs/fixyourdocs',
        },
      ],
      components: {
        // Adds a "Found a problem? File a report" link to every page, wired to
        // the on-site report form — the docs site dogfoods the protocol.
        Footer: './src/components/Footer.astro',
      },
      editLink: {
        baseUrl:
          'https://github.com/fixyourdocs/fixyourdocs/edit/main/docs-site/',
      },
      sidebar: [
        {
          label: 'Start here',
          items: [
            { label: 'Getting started', slug: 'v0/getting-started' },
            { label: 'Protocol primer', slug: 'v0/protocol' },
          ],
        },
        {
          label: 'SDKs & CLI',
          items: [
            { label: 'Python SDK', slug: 'v0/sdk/python' },
            { label: 'TypeScript SDK', slug: 'v0/sdk/typescript' },
            { label: 'CLI', slug: 'v0/cli' },
          ],
        },
        {
          label: 'Agents',
          items: [
            { label: 'AGENTS.md snippet', slug: 'v0/agents-md' },
            { label: 'MCP server', slug: 'v0/mcp' },
          ],
        },
        {
          label: 'Hub',
          items: [{ label: 'The FixYourDocs Hub', slug: 'v0/hub' }],
        },
        {
          label: 'About',
          items: [
            { label: 'Versioning', slug: 'v0/versioning' },
            { label: 'Contributing', slug: 'v0/contributing' },
          ],
        },
      ],
    }),
  ],
});
