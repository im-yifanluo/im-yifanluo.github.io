// /robots.txt: every page may be crawled, and the sitemap (written by @astrojs/sitemap, astro.config.mjs) lists them.
import type { APIRoute } from 'astro';

export const GET: APIRoute = ({ site }) =>
  new Response(`User-agent: *\nAllow: /\nSitemap: ${new URL('/sitemap-index.xml', site)}\n`);
