// Links and addresses: every project URL serves its page and each redirect lands on its target; every URL a built page
// names resolves inside dist (to a file, a page and, for a #fragment, an id on it), and none names a redirect; an unknown
// path answers with the 404 page; dist ships only what the pages name. The links are the same at every width, so these
// run once, in the desktop project at 1440 px (tagged @desktop).
import { expect, projects, redirects, SITE_URL, test, type Page } from './fixtures';
import { distFiles, readDist, readHtml, servedPath, type PageSummary } from './helpers/dist';

test.use({ reducedMotion: 'reduce' });

/** A URL on any other origin (or mailto:) is external. */
const ORIGIN = new URL(SITE_URL).origin;
/** A path without its trailing slash, so "/a/" and "/a" compare equal. */
const bare = (path: string) => path.replace(/(.)\/$/, '$1');
const REDIRECT_SOURCES = new Set(redirects.map(({ from }) => bare(from)));
/** Fragments that need no id: "#" and "#top" scroll to the top of the page (HTML's rules for fragments). */
const TOP = new Set(['', 'top']);
/** The hash target ends up in the first screen, under the sticky header: its top within this many px of the top. */
const LANDS_WITHIN = 200;

/** Runs in the page: where it ended up, its h1s, whether it says "not found", and the top of the #fragment's element. */
function landing() {
  const target = location.hash && document.getElementById(decodeURIComponent(location.hash.slice(1)));
  return {
    url: location.pathname + location.hash,
    h1: document.querySelectorAll('h1').length,
    notFound: /not found/i.test(document.title),
    top: target ? Math.round(target.getBoundingClientRect().top) : null,
  };
}

test.describe('every project URL still serves its page', { tag: '@desktop' }, () => {
  for (const { slug } of projects) {
    const path = `/${slug}/`;
    test(path, async ({ page }) => {
      const response = await page.goto(path, { waitUntil: 'networkidle' });
      expect(response?.status()).toBeLessThan(400);
      expect(await page.evaluate(landing)).toEqual({ url: path, h1: 1, notFound: false, top: null });
    });
  }
});

test.describe('each redirect lands on its target', { tag: '@desktop' }, () => {
  for (const { from, to } of redirects) {
    const anchored = new URL(to, SITE_URL).hash !== '';
    for (const path of [`${bare(from)}/`, bare(from)]) {
      test(`${path} → ${to}`, async ({ page }) => {
        const response = await page.goto(path, { waitUntil: 'networkidle' });
        expect(response?.status()).toBeLessThan(400);
        await page.waitForURL((url) => url.pathname + url.hash === to);
        expect(await page.evaluate(landing)).toMatchObject({ url: to, h1: 1, notFound: false });
        if (!anchored) return;
        const top = async () => (await page.evaluate(landing)).top;
        await expect.poll(top, { message: `the top of ${to}'s target` }).toBeGreaterThanOrEqual(0);
        expect(await top()).toBeLessThan(LANDS_WITHIN);
      });
    }
  }
});

test.describe('each redirect page points at its target', { tag: '@desktop' }, () => {
  for (const { from, to } of redirects) {
    test(`${bare(from)}/ → ${to}`, async ({ page, request }) => {
      const response = await request.get(`${bare(from)}/`);
      expect(response.status()).toBe(200);
      const redirect = await readHtml(page, await response.text());
      expect(redirect.meta.refresh?.replace(/^\s*\d+\s*;\s*url=/i, '')).toBe(to);
      expect(redirect.meta.robots).toBe('noindex');
      const target = new URL(to, SITE_URL);
      expect(redirect.links.filter(({ rel }) => rel === 'canonical').map(({ href }) => href)).toEqual([target.href]);
      const served = await request.get(target.pathname);
      expect(served.status(), `${target.pathname} serves`).toBe(200);
      if (target.hash) {
        expect((await readHtml(page, await served.text())).ids).toContain(decodeURIComponent(target.hash.slice(1)));
      }
    });
  }
});

/** Every page of dist/ (by file), parsed. */
async function builtPages(page: Page): Promise<Map<string, PageSummary>> {
  const pages = new Map<string, PageSummary>();
  for (const file of distFiles().filter((name) => name.endsWith('.html'))) {
    pages.set(file, await readHtml(page, readDist(file)));
  }
  return pages;
}

/** Each URL the built pages name on the site's own origin, resolved against the page that names it. */
function* internalUrls(pages: Map<string, PageSummary>) {
  for (const [file, { urls }] of pages) {
    const base = new URL(servedPath(file), SITE_URL);
    for (const url of urls) {
      const target = new URL(url, base);
      if (target.origin === ORIGIN) yield { from: servedPath(file), url, target };
    }
  }
}

/** Why an internal URL does not resolve inside dist/, or null when it does. */
function unresolved(target: URL, files: Set<string>, pages: Map<string, PageSummary>): string | null {
  const path = decodeURIComponent(target.pathname).slice(1);
  const file = [path, `${path}index.html`, `${path}/index.html`].find((name) => files.has(name));
  if (!file) return REDIRECT_SOURCES.has(bare(`/${path}`)) ? null : 'no such file or page';
  const id = decodeURIComponent(target.hash.slice(1));
  if (TOP.has(id.toLowerCase())) return null;
  const page = pages.get(file);
  if (!page) return `#${id} on a file that is not a page`;
  return page.ids.includes(id) ? null : `no element with id "${id}"`;
}

test.describe('the built site', { tag: '@desktop' }, () => {
  test('every internal href, src and srcset in dist resolves', async ({ page }) => {
    const files = new Set(distFiles());
    const pages = await builtPages(page);
    const urls = [...internalUrls(pages)];
    expect(urls.length, 'internal URLs found').toBeGreaterThan(0);
    const broken = urls.flatMap(({ from, url, target }) => {
      const problem = unresolved(target, files, pages);
      return problem ? [`${from}: ${url} (${problem})`] : [];
    });
    expect(broken).toEqual([]);
  });

  test('no internal link points at a redirect', async ({ page }) => {
    const toRedirects = [...internalUrls(await builtPages(page))]
      .filter(({ target }) => REDIRECT_SOURCES.has(bare(target.pathname)))
      .map(({ from, url }) => `${from}: ${url}`);
    expect(toRedirects).toEqual([]);
  });

  test('an unknown path answers 404 with the 404 page', async ({ page }) => {
    const response = await page.goto('/no-such-page/');
    expect(response?.status()).toBe(404);
    expect(await response?.text(), 'the body is dist/404.html').toBe(readDist('404.html'));
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', 'noindex');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('main a[href="/"]'), 'a link home').not.toHaveCount(0);
  });

  test('dist ships no data files, linter report or second résumé', () => {
    const extra = distFiles().filter((file) => /\.(json|csv)$/i.test(file) || /_Resume\.pdf$/i.test(file));
    expect(extra).toEqual([]);
  });
});
