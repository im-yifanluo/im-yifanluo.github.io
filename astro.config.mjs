// @ts-check
// Static Astro, no UI framework. The derived media (tiles, heroes, loops) live in public/media.
import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  output: 'static',
  // canonical, og:url, og:image and the sitemap are absolute URLs on this origin, served from its root (no `base`)
  site: process.env.SITE_URL ?? 'https://im-yifanluo.github.io',
  // sitemap-index.xml and sitemap-0.xml: every page but the 404 page and redirects (src/pages/robots.txt.ts names it)
  integrations: [sitemap()],
  build: { format: 'directory', inlineStylesheets: 'always' },
  compressHTML: true, // collapse the markup's whitespace; the HTML budget (scripts/budgets.json) is measured on it
  scopedStyleStrategy: 'class', // scoped rules: one class of specificity over the global roles, no data-* attributes
  prefetch: false, // no prefetch script: a page ships only its own inline module (and a diagram's script)
  devToolbar: { enabled: false }, // the dev server shows the pages as they build, with nothing injected
  // two routes for one URL (a project slug on a redirect below) or a repeated list id fail the build, not just warn
  prerenderConflictBehavior: 'error',
  // the deployment write-up is the second half of /robot-learning/ (#on-the-robot); its old address still lands there
  redirects: { '/deployment-debugging': '/robot-learning/#on-the-robot' },
  vite: {
    build: {
      // the font (styles/fonts.css: a data: URI, there at first paint) and BaseLayout's page script are inlined; every
      // other asset stays a file. A boolean for every file, so Vite's size threshold never applies.
      assetsInlineLimit: (file) => file.endsWith('.woff2') || file.includes('BaseLayout.astro_astro_type_script'),
      sourcemap: false,
    },
  },
});
