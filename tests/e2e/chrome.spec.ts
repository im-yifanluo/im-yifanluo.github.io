// The page chrome: the footer and the sticky header on every page at every width, then the header's states at 1440 px
// with motion allowed (the glass, the homepage's name, anchors and the current section).
import {
  atEachWidth,
  clickAndScroll,
  CONTENT_PAGES,
  DESKTOP,
  distinct,
  expect,
  isPhone,
  measure,
  MOTION,
  news,
  PAGES,
  scrollToY,
  settle,
  site,
  test,
  token,
  type Box,
  type Page,
} from './fixtures';
import { glassContrast, headerState } from './helpers/header';

/** Expects `actual` within `tolerance` px of `expected`, without stopping the test. */
const expectNear = (actual: number, expected: number, what: string, tolerance = 1) =>
  expect
    .soft(Math.abs(actual - expected), `${what}: ${actual} vs ${expected} (± ${tolerance} px)`)
    .toBeLessThanOrEqual(tolerance);

/** A box measure() found, or a failure naming what was missing. */
function present(box: Box | null, what: string): Box {
  expect(box, `${what} is shown`).not.toBeNull();
  return box!;
}

const CONTACT = [`mailto:${site.EMAIL}`, site.RESUME, site.GITHUB, site.LINKEDIN];
const NEWEST_NEWS = news
  .map((item) => String(item.date))
  .sort()
  .at(-1)!;

test.describe('footer and header at every width', () => {
  for (const path of PAGES) {
    test.describe(path, () => {
      test('footer mirrors the header: © and date at x0, links end on the right edge; no font credit', async ({
        open,
      }) => {
        await atEachWidth(open, path, async (page, width) => {
          const m = await measure(page);
          const F = m.footer;
          const bar = present(F.bar, 'the footer bar'),
            copy = present(F.copy, 'the © line'),
            links = present(F.links, 'the footer links'),
            upd = present(F.upd, '“Last updated”');
          // x1: the text edge; x0: the media edge, which the header's name shares (pages without media: the name's)
          const x1 = distinct(m.textLeft)[0]!,
            x0 = m.mediaLeft[0] ?? m.homeLeft[0] ?? x1;
          if (isPhone(width)) {
            // phones: the links, then the © line under them, both at the text edge (at 320 the date may wrap)
            expectNear(copy.l, x1, 'the © line starts at x1');
            expectNear(links.l, x1, 'the links start at x1');
            expect.soft(copy.t, 'the © line sits under the links').toBeGreaterThan(links.t);
            expect.soft(upd.t, '“Last updated” is on or under the © line').toBeGreaterThanOrEqual(copy.t - 1);
          } else {
            expectNear(copy.l, x0, 'the © line starts at x0');
            expectNear(links.r, bar.r, 'the links end on the right edge');
            expectNear(copy.t, links.t, 'the © line and the links share a line');
            expectNear(upd.t, copy.t, '“Last updated” is on the © line', 2);
          }
          for (const left of m.footLeft) expectNear(left, isPhone(width) ? x1 : x0, 'footer text edge');
          expect.soft(F.text, 'no font credit').not.toMatch(/Set in|Open Font License/);
        });
      });

      test("footer links in the hero's order", async ({ open }) => {
        await atEachWidth(open, path, async (page) => {
          const footer = page.locator('.site-footer .links a'),
            hero = page.locator('.intro .links a');
          const hrefs = (links: typeof hero) => links.evaluateAll((as) => as.map((a) => a.getAttribute('href')));
          const labels = async (links: typeof hero) => (await links.allTextContents()).map((t) => t.trim());
          expect.soft(await hrefs(footer), 'address, Résumé, GitHub, LinkedIn').toEqual(CONTACT);
          expect.soft((await labels(footer))[0], 'the footer names the address').toBe(site.EMAIL);
          if ((await hero.count()) === 0) return;
          expect.soft(await hrefs(hero), "the hero's links").toEqual(CONTACT);
          expect.soft((await labels(footer)).slice(1), 'then the hero’s labels').toEqual((await labels(hero)).slice(1));
        });
      });

      test('header sticky; name and nav ≥ 12 px apart; nav ends on the right edge', async ({ open }) => {
        await atEachWidth(open, path, async (page) => {
          const header = await page.evaluate(() => {
            const h = document.querySelector('.site-header')!,
              rect = (sel: string) => h.querySelector(sel)!.getBoundingClientRect();
            const home = rect('.home'),
              nav = rect('nav');
            return {
              position: getComputedStyle(h).position,
              gap: Math.round(nav.left - home.right),
              navRight: nav.right,
              barRight: rect('.bar').right,
            };
          });
          expect.soft(header.position, 'the header position').toBe('sticky');
          expect.soft(header.gap, 'between the name and the nav').toBeGreaterThanOrEqual(12);
          expectNear(header.navRight, header.barRight, 'the nav ends on the right edge');
        });
      });

      if (path !== '/') return;
      test('“Last updated” is not older than the newest News item', async ({ open }) => {
        await atEachWidth(open, path, async (page) => {
          const updated = await page.locator('.site-footer .upd time').getAttribute('datetime');
          const shown = await page
            .locator('#news .date time')
            .evaluateAll((times) => times.map((t) => t.getAttribute('datetime')!).sort());
          expect(updated, 'the footer dates the last update').toBeTruthy();
          expect.soft(updated! >= NEWEST_NEWS, `${updated} vs src/data/news.yaml ${NEWEST_NEWS}`).toBe(true);
          const newest = shown.at(-1);
          if (newest) expect.soft(updated! >= newest, `${updated} vs the newest News item shown ${newest}`).toBe(true);
        });
      });
    });
  }
});

/** The header's state at the top, then with the page scrolled 400 px. */
async function headerStates(page: Page) {
  await settle(page);
  const top = await headerState(page);
  await scrollToY(page, 400);
  return { top, scrolled: await headerState(page) };
}

// measured with a mouse at 1440 px: the desktop project
test.describe(`header at ${DESKTOP} px with motion allowed`, { tag: '@desktop' }, () => {
  for (const path of CONTENT_PAGES) {
    test.describe(path, () => {
      test('header: clear at the top; frosted (glass tokens, saturate ≤ 1.2, blur 8) with the hairline once scrolled', async ({
        open,
      }) => {
        const { page } = await open(path, MOTION);
        const { top, scrolled } = await headerStates(page);
        const glass = {
          alpha: Number(await token(page, '--glass-alpha')),
          filter: await token(page, '--glass-filter'),
        };
        expect.soft(top.alpha, 'clear at the top').toBe(0);
        expect.soft(top.line, 'no hairline at the top').toBe(0);
        // the glass: about 70–80 % white, a light blur, no heavy saturation boost (it muddies dark tiles)
        expect.soft(glass.alpha, '--glass-alpha').toBeGreaterThanOrEqual(0.7);
        expect.soft(glass.alpha, '--glass-alpha').toBeLessThanOrEqual(0.8);
        expect.soft(Math.abs(scrolled.alpha - glass.alpha), 'scrolled: the glass alpha').toBeLessThan(0.01);
        expect.soft(scrolled.filter, 'scrolled: the glass filter').toBe(glass.filter);
        expect.soft(scrolled.filter).toMatch(/blur\(8px\)/);
        expect.soft(Number(/saturate\(([\d.]+)\)/.exec(scrolled.filter)?.[1] ?? 1)).toBeLessThanOrEqual(1.2);
        expect.soft(scrolled.line, 'scrolled: the hairline').toBe(1);
        expect.soft(scrolled.top, 'scrolled: the header stays at the top').toBe(0);
      });

      const nameTitle =
        path === '/'
          ? 'header name hidden at the top, arrives once the h1 is under the bar'
          : 'header name always shown on project pages';
      test(nameTitle, async ({ open }) => {
        const { page } = await open(path, MOTION);
        const { top, scrolled } = await headerStates(page);
        expect.soft(top.name, 'at the top').toBe(path !== '/');
        expect.soft(scrolled.name, 'scrolled 400 px').toBe(true);
      });

      test('header text ≥ 4.5:1 over the glass with black under it', async ({ open }) => {
        const { page } = await open(path, MOTION);
        await headerStates(page);
        expect(await glassContrast(page)).toBeGreaterThanOrEqual(4.5);
      });
    });
  }

  test.describe('/', () => {
    test('header name arrives only after the h1 has left the glass', async ({ open }) => {
      const { page } = await open('/', MOTION);
      await scrollToY(page, 400);
      const { bottom, bar } = await page.evaluate(() => ({
        bottom: document.getElementById('name')!.getBoundingClientRect().bottom + scrollY,
        bar: document.querySelector('.site-header')!.getBoundingClientRect().height,
      }));
      const named = async (top: number) => {
        await scrollToY(page, top);
        return page.evaluate(() => document.documentElement.hasAttribute('data-name'));
      };
      expect.soft(await named(bottom - bar / 2), 'the h1 under the glass: no name in the bar').toBe(false);
      expect.soft(await named(bottom + 2), 'the h1 gone: the name in the bar').toBe(true);
    });

    test('header name: the underline fades in (never snaps)', async ({ open }) => {
      const { page } = await open('/', MOTION);
      await scrollToY(page, 400);
      await page.mouse.move(0, 0);
      await settle(page);
      // the pointer straight onto the name: a locator's hover() could scroll the sticky header "into view" first
      const name = page.locator('.site-header .home'),
        box = (await name.boundingBox())!;
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      // the underline's alpha on every frame until its transition ends
      const alphas = await name.evaluate(async (e) => {
        const alpha = () => {
          const c = getComputedStyle(e)
            .textDecorationColor.match(/[\d.]+/g)!
            .map(Number);
          return c.length === 4 ? c[3]! : 1;
        };
        const frames: number[] = [],
          t0 = performance.now();
        do {
          await new Promise((done) => requestAnimationFrame(done));
          frames.push(alpha());
        } while (e.getAnimations().length > 0 && performance.now() - t0 < 2000);
        return frames;
      });
      const between = alphas.filter((a) => a > 0.02 && a < 0.98).length;
      expect.soft(between, `frames between clear and full: ${alphas.join(' ')}`).toBeGreaterThanOrEqual(2);
      expect.soft(alphas.at(-1), 'the last frame').toBeGreaterThan(0.98);
    });

    /** Clicks each in-page nav link in turn; where its section lands and which nav link is current. */
    async function landings(page: Page) {
      await settle(page);
      const nav = page.locator('.site-header nav a[href^="#"]');
      const hashes = await nav.evaluateAll((as) => as.map((a) => a.getAttribute('href')!));
      expect(hashes.length, 'in-page nav links').toBeGreaterThan(0);
      const landed = [];
      for (const hash of hashes) {
        await clickAndScroll(page, nav.and(page.locator(`[href="${hash}"]`)));
        const at = await page.evaluate((hash) => {
          const bar = document.querySelector('.site-header')!.getBoundingClientRect().bottom;
          return {
            clearance: Math.round(document.querySelector(hash)!.getBoundingClientRect().top - bar),
            current: document.querySelector('.site-header nav a[aria-current]')?.getAttribute('href') ?? null,
          };
        }, hash);
        landed.push({ hash, ...at });
      }
      return landed;
    }

    test('anchors land 24 px under the header', async ({ open }) => {
      const { page } = await open('/', MOTION);
      const gap = Number.parseFloat(await token(page, '--s5'));
      for (const { hash, clearance } of await landings(page)) expectNear(clearance, gap, `${hash} under the header`, 2);
    });

    test('nav marks the section being read (aria-current)', async ({ open }) => {
      const { page } = await open('/', MOTION);
      for (const { hash, current } of await landings(page)) expect.soft(current, `after ${hash}`).toBe(hash);
    });
  });
});
