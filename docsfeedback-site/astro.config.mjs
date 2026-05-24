// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

// https://astro.build/config
export default defineConfig({
  site: 'https://docsfeedback.org',
  integrations: [
    starlight({
      title: 'Docs Feedback Protocol',
      description:
        'An open protocol for AI agents to report broken documentation.',
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/fixyourdocs/protocol',
        },
      ],
      sidebar: [
        {
          label: 'Spec v0',
          items: [
            { label: 'Overview', slug: 'spec/v0' },
            { label: 'Examples', slug: 'spec/v0/examples' },
            { label: 'Schemas', slug: 'spec/v0/schemas' },
          ],
        },
        {
          label: 'Implementations',
          link: '/implementations/',
        },
        {
          label: 'Contributing',
          link: '/contributing/',
        },
      ],
    }),
  ],
});
