// @ts-check
// Static Astro, no UI framework. The derived media (tiles, heroes, loops) live in public/media.
import { defineConfig } from 'astro/config';

export default defineConfig({
  output: 'static',
  // canonical, og:url and og:image are absolute URLs on this origin, served from its root (no `base`)
  site: process.env.SITE_URL ?? 'https://im-yifanluo.github.io',
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
    // only the font is inlined (styles/fonts.css: a data: URI, so it is there at first paint); every other asset stays a file
    build: { assetsInlineLimit: (file) => file.endsWith('.woff2'), sourcemap: false },
  },
});
