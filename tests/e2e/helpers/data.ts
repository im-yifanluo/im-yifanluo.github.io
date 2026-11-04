// The site's own data, read from its source files and the built homepage, so a test expects what the content says
// rather than a copy of it.
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { parse } from 'yaml';
import astroConfig from '../../../astro.config.mjs';
import budgetFile from '../../../scripts/budgets.json' with { type: 'json' };
import fontFile from '../../../src/generated/font.json' with { type: 'json' };

export * as site from '../../../src/site.config';

const ROOT = new URL('../../../', import.meta.url);
const read = (path: string) => readFileSync(new URL(path, ROOT), 'utf8');

/** Size and performance budgets (scripts/budgets.json). The end-to-end tests enforce the ones with scope "e2e". */
export const budgets = budgetFile;

/** The address every canonical, og:url and sitemap URL is absolute on: `site` in astro.config.mjs (or SITE_URL). */
export const SITE_URL = new URL(astroConfig.site!).href;

/** The one font: its family, the URL of its license and the code points it covers (src/generated/font.json). */
export const font = { family: fontFile.family, licence: fontFile.licence, codepoints: new Set(fontFile.codepoints) };

export interface Dated {
  id: string;
  date: string;
  text: string;
}
export interface AwardGroup {
  id: string;
  label: string;
  collapsed?: boolean;
  items: Omit<Dated, 'id'>[];
}
/** The homepage lists in file order (src/data/*.yaml). */
export const news = parse(read('src/data/news.yaml')) as Dated[];
export const awards = parse(read('src/data/awards.yaml')) as AwardGroup[];

export interface Caption {
  caption?: string;
  captionPhone?: string;
}
export interface Project {
  slug: string;
  order: number;
  title: string;
  short: string;
  outcome: string;
  links: { label: string; url: string }[];
  hero: Caption & { media?: string; drawn?: string };
  figures: (Caption & { media?: string; diagram?: string; width?: 'wide' | 'text' })[];
}
/** Every project (src/content/projects/<slug>.yaml), in homepage order. */
export const projects = readdirSync(new URL('src/content/projects/', ROOT))
  .filter((file) => file.endsWith('.yaml'))
  .map((file) => ({
    ...(parse(read(`src/content/projects/${file}`)) as Omit<Project, 'slug'>),
    slug: file.slice(0, -5),
  }))
  .sort((a, b) => a.order - b.order);

/** The source paths of the redirects in astro.config.mjs, each with its target. */
export const redirects = Object.entries(astroConfig.redirects ?? {}).map(([from, to]) => ({
  from,
  to: typeof to === 'string' ? to : to.destination,
}));

if (!existsSync(new URL('dist/index.html', ROOT))) {
  throw new Error('dist/index.html is missing: run `npm run build` before the end-to-end tests');
}
const home = read('dist/index.html');
const list = home.slice(home.indexOf('<ol class="projects">'));
const titleLinks = list.slice(0, list.indexOf('</ol>')).matchAll(/<h3\b[^>]*>\s*<a\b[^>]*\bhref="(\/[^"]*)"/g);

/** The project pages the built homepage links to, in its order (each project row's title link). */
export const PROJECT_PAGES = [...new Set([...titleLinks].map((match) => match[1]!))];
if (PROJECT_PAGES.length === 0) throw new Error('dist/index.html: no project links in <ol class="projects">');

/** Every page under test: the homepage, each project page and the 404 page. */
export const PAGES = ['/', ...PROJECT_PAGES, '/404.html'];
