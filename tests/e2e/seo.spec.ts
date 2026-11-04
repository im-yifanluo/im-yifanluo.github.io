// What search engines and link previews read: each page's head (title, description, canonical and og:* absolute on the
// site's address; the 404 page out of the index), the sitemap and robots.txt; and no co-found… / found(er|ing) wording
// on any page at any width or in any text file of the build. The head and the files are the same at every width, so
// those run once, in the desktop project at 1440 px (tagged @desktop).
import { atEachWidth, expect, measure, PAGES, projects, SITE_URL, test } from './fixtures';
import { distFiles, readDist, readHtml, readPage } from './helpers/dist';

/** A meta description's limit in characters (project pages cut theirs to it: summarize() in src/pages/[slug].astro). */
const DESCRIPTION_MAX = 160;
/** og:image:alt describes the image in a sentence: longer than this many characters. */
const IMAGE_ALT_OVER = 40;
const NOT_FOUND = '/404.html';
/** Words that name a company role (co-found…, found(er|ers|ing)), as measure() finds them on a page. */
const FOUND_WORDS = /\bco-?found\w*|\bfound(?:ers?|ing)\b/gi;
/** The files of dist/ read as text. */
const TEXT_FILE = /\.(html?|json|js|mjs|css|txt|xml|svg|webmanifest|map)$/i;

test.describe('wording', () => {
  for (const path of PAGES) {
    test(`${path}: no co-found… / found(er|ing) wording in the text, title, descriptions or alt text`, ({ open }) =>
      atEachWidth(open, path, async (page, width) => {
        expect.soft((await measure(page)).foundWords, `${path} at ${width} px`).toEqual([]);
      }));
  }
});

// the same at every width: checked in the desktop project
test.describe('the build', { tag: '@desktop' }, () => {
  test('no co-found… / found(er|ing) wording in any text file of dist', () => {
    const hits = distFiles()
      .filter((file) => TEXT_FILE.test(file))
      .flatMap((file) => [...readDist(file).matchAll(FOUND_WORDS)].map((match) => `dist/${file}: ${match[0]}`));
    expect(hits).toEqual([]);
  });

  for (const path of PAGES) {
    test(`${path}: head: og:image:alt; description ≤ ${DESCRIPTION_MAX} characters, never cut with "…"; 404 noindex without canonical`, async ({
      page,
    }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      const { meta, links } = await readPage(page);
      const canonical = links.some(({ rel }) => rel === 'canonical');
      expect(meta['og:image:alt']?.length ?? 0, 'og:image:alt').toBeGreaterThan(IMAGE_ALT_OVER);
      if (path === NOT_FOUND) {
        expect({ robots: meta.robots, canonical, ogUrl: meta['og:url'] }).toEqual({
          robots: 'noindex',
          canonical: false,
          ogUrl: undefined,
        });
      } else {
        expect({ robots: meta.robots, canonical, ogUrl: !!meta['og:url'] }).toEqual({
          robots: undefined,
          canonical: true,
          ogUrl: true,
        });
      }
      const description = meta.description ?? '';
      expect(description.length, description).toBeLessThanOrEqual(DESCRIPTION_MAX);
      expect(description.endsWith('…'), description).toBe(false);
    });
  }

  for (const path of PAGES.filter((path) => path !== NOT_FOUND)) {
    test(`${path}: title, description, canonical and og:* are set and absolute on SITE_URL`, async ({
      page,
      request,
    }) => {
      await page.goto(path, { waitUntil: 'domcontentloaded' });
      const { title, meta, links } = await readPage(page);
      const url = new URL(path, SITE_URL).href;
      expect(title).not.toBe('');
      expect(meta.description ?? '').not.toBe('');
      expect(links.filter(({ rel }) => rel === 'canonical').map(({ href }) => href)).toEqual([url]);
      expect(meta['og:url']).toBe(url);
      expect(meta['og:title']).toBe(title);
      expect(meta['og:description']).toBe(meta.description);
      const image = meta['og:image'] ?? '';
      expect(image.startsWith(SITE_URL), `og:image ${image} is on ${SITE_URL}`).toBe(true);
      const served = await request.get(new URL(image).pathname);
      expect(served.status()).toBe(200);
      expect(served.headers()['content-type']).toBe('image/jpeg');
    });
  }

  test('the sitemap lists every page', async ({ request }) => {
    const locations = async (path: string) => {
      const response = await request.get(path);
      expect(response.status(), path).toBe(200);
      return [...(await response.text()).matchAll(/<loc>([^<]*)<\/loc>/g)].map((match) => match[1]!);
    };
    const sitemaps = await locations('/sitemap-index.xml');
    expect(sitemaps.length, 'sitemaps in the index').toBeGreaterThan(0);
    const listed: string[] = [];
    for (const sitemap of sitemaps) {
      expect(sitemap.startsWith(SITE_URL), `${sitemap} is on ${SITE_URL}`).toBe(true);
      listed.push(...(await locations(new URL(sitemap).pathname)));
    }
    // the homepage and each project page: not the 404 page, nor a redirect
    const pages = [SITE_URL, ...projects.map(({ slug }) => new URL(`${slug}/`, SITE_URL).href)];
    expect(listed.sort()).toEqual(pages.sort());
  });

  test('robots.txt names the sitemap', async ({ request }) => {
    const response = await request.get('/robots.txt');
    expect(response.status()).toBe(200);
    expect(response.headers()['content-type']).toMatch(/^text\/plain\b/);
    expect((await response.text()).split('\n')).toContain(`Sitemap: ${new URL('sitemap-index.xml', SITE_URL).href}`);
  });

  test('no page links a sitemap from its head', async ({ page }) => {
    const linked: string[] = [];
    for (const file of distFiles().filter((name) => name.endsWith('.html'))) {
      const { links } = await readHtml(page, readDist(file));
      if (links.some(({ rel }) => rel.split(/\s+/).includes('sitemap'))) linked.push(file);
    }
    expect(linked).toEqual([]);
  });
});
