// The built site as files (dist/), and what the link, head and diagram checks read from a page. A page is parsed by the
// browser (DOMParser), so its attributes, entities and URLs read as a browser reads them.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Page } from '@playwright/test';

const DIST = fileURLToPath(new URL('../../../dist/', import.meta.url));

/** Every file in dist/, relative to it, with forward slashes ("robot-learning/index.html"). */
export function distFiles(): string[] {
  return readdirSync(DIST, { recursive: true })
    .map(String)
    .filter((path) => statSync(join(DIST, path)).isFile())
    .map((path) => path.split(sep).join('/'))
    .sort();
}

/** A file of dist/ as text. */
export const readDist = (file: string) => readFileSync(join(DIST, file), 'utf8');

/** The URL path a file of dist/ is served at: an index.html at its folder's path ("/memos/"), any other file at its own. */
export const servedPath = (file: string) => `/${file.replace(/(^|\/)index\.html$/, '$1')}`;

export interface PageSummary {
  title: string;
  /** Each <meta> by its name, property or http-equiv (lower case): its content. */
  meta: Record<string, string>;
  /** Each <link>: its rel and its href as written. */
  links: { rel: string; href: string }[];
  ids: string[];
  /** Every URL the page names: each href, src and poster, each srcset candidate, and each root-relative data-* value. */
  urls: string[];
  h1: number;
  /** The diagram figures, the drawn (flow) ones among them, the external scripts, and whether a <style> holds the
   *  diagram styles. */
  diagrams: { figs: number; flows: number; scripts: string[]; styles: boolean };
}

/** Runs in the page: the summary of the HTML document `html`, or of the page itself when `html` is null. */
function summary(html: string | null): PageSummary {
  const doc = html === null ? document : new DOMParser().parseFromString(html, 'text/html');
  const elements = [...doc.querySelectorAll('*')];
  const meta: Record<string, string> = {};
  for (const tag of doc.querySelectorAll('meta')) {
    const key = tag.getAttribute('name') ?? tag.getAttribute('property') ?? tag.getAttribute('http-equiv');
    if (key) meta[key.toLowerCase()] = tag.content;
  }
  const urlsOf = ({ name, value }: Attr): string[] => {
    if (name === 'href' || name === 'src' || name === 'poster') return [value];
    if (name === 'srcset') return value.split(',').flatMap((candidate) => candidate.trim().split(/\s+/)[0] || []);
    return name.startsWith('data-') && value.startsWith('/') ? [value] : [];
  };
  return {
    title: doc.title,
    meta,
    links: [...doc.querySelectorAll('link')].map((link) => ({ rel: link.rel, href: link.getAttribute('href') ?? '' })),
    ids: elements.map((element) => element.id).filter(Boolean),
    urls: elements.flatMap((element) => [...element.attributes].flatMap(urlsOf)),
    h1: doc.querySelectorAll('h1').length,
    diagrams: {
      figs: doc.querySelectorAll('.dg-fig').length,
      flows: doc.querySelectorAll('.dg-fig .dg-grid').length,
      scripts: [...doc.querySelectorAll('script[src]')].map((script) => script.getAttribute('src')!),
      styles: [...doc.querySelectorAll('style')].some((style) => !!style.textContent?.includes('.dg-plate')),
    },
  };
}

/** The summary of an HTML document, parsed in `page` (any page will do, about:blank too). */
export const readHtml = (page: Page, html: string) => page.evaluate(summary, html);

/** The summary of the page `page` shows. */
export const readPage = (page: Page) => page.evaluate(summary, null);
