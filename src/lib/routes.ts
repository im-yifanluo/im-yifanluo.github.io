// The top-level paths a project page (/<slug>/, src/pages/[slug].astro) must not take.

/** Built paths: the folders in public/, Astro's assets, the 404 page, og.jpg, robots.txt and the sitemaps. */
export const RESERVED: readonly string[] = [
  'media',
  'fonts',
  '_astro',
  '404',
  'og',
  'robots',
  'sitemap-index',
  'sitemap-0',
];

/** The sources of the redirects in astro.config.mjs (tests/unit/repo.test.ts checks that the two match). */
export const REDIRECT_SOURCES: readonly string[] = ['deployment-debugging'];
