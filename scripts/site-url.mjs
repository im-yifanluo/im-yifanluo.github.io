// The site's address, for astro.config.mjs and scripts/check-dist.mjs. An empty SITE_URL falls back to the default
// too. The site is served from the root of this origin (no base path).
export const DEFAULT_SITE_URL = 'https://yifanluo.dev';
export const SITE_URL = process.env.SITE_URL || DEFAULT_SITE_URL;
