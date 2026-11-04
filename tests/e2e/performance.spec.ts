// Performance: no errors and no layout shift on any page at any width; a first load within its byte budget and with no
// font request (the font is inlined); the same on Lighthouse's throttled "slow 4G". The limits are the e2e budgets of
// scripts/budgets.json, read through LIMIT below. Checks that hold at any width run at the project's own.
import { budgets, expect, font, PAGES, PROJECT_PAGES, projectWidths, scrollThrough, test } from './fixtures';
import { countRequests, slow4g } from './helpers/load';

/** The budgets with scope "e2e": every check here takes its limit from this object, and nowhere else. */
const LIMIT = {
  firstLoadBytes: budgets.firstLoadBytes.max,
  fontRequests: budgets.fontRequests.max,
  cls: budgets.cls.max,
  lcpSlow4gMs: budgets.lcpSlow4gMs.max,
};

test('every e2e budget in scripts/budgets.json is checked', () => {
  const e2e = Object.entries(budgets).filter(([, budget]) => typeof budget === 'object' && budget.scope === 'e2e');
  expect(Object.keys(LIMIT).sort()).toEqual(e2e.map(([key]) => key).sort());
});

// every page at each of the project's widths, motion reduced, scrolled through
test.describe('no console errors or failed requests; no layout shift (CLS 0)', () => {
  for (const path of PAGES) {
    test(path, async ({ open }) => {
      for (const width of projectWidths()) {
        const { page, errors, vitals } = await open(path, { width, reducedMotion: 'reduce' });
        await scrollThrough(page);
        expect.soft(errors, `no console errors or failed requests at ${width}px`).toEqual([]);
        expect.soft((await vitals()).cls, `no layout shift (CLS 0) at ${width}px`).toBeLessThan(LIMIT.cls);
      }
    });
  }
});

// each page as the project's device first loads it, motion allowed (so a loop in view loads too)
const FIRST_LOAD = 'first load within budget (no scrolling)';
const FONT_REQUESTS = `font requests within budget (${LIMIT.fontRequests}: the font is inlined)`;
test.describe(`${FIRST_LOAD}; ${FONT_REQUESTS}`, () => {
  for (const path of PAGES) {
    test(path, async ({ page }) => {
      const load = countRequests(page);
      await page.goto(path, { waitUntil: 'networkidle' });
      const { bytes, fonts } = await load();
      expect.soft(bytes, `${FIRST_LOAD}: bytes transferred`).toBeLessThanOrEqual(LIMIT.firstLoadBytes);
      expect.soft(fonts, FONT_REQUESTS).toBeLessThanOrEqual(LIMIT.fontRequests);
    });
  }
});

test('unknown query parameters change nothing; the one font makes no request', async ({ page }) => {
  const load = countRequests(page);
  await page.goto('/?style=b', { waitUntil: 'networkidle' });
  const state = await page.evaluate(() => ({
    dataStyle: document.documentElement.getAttribute('data-style'),
    switcher: document.querySelector('.style-switch') !== null,
    styleLinks: document.querySelectorAll('a[href*="style="]').length,
    family: getComputedStyle(document.querySelector('.name')!).fontFamily.split(',')[0]!.replace(/"/g, ''),
  }));
  expect(state).toEqual({ dataStyle: null, switcher: false, styleLinks: 0, family: font.family });
  expect((await load()).fonts, 'font requests').toBeLessThanOrEqual(LIMIT.fontRequests);
});

test('the OFL text is served next to the font', async ({ request }) => {
  const licence = await request.get(font.licence);
  expect(licence.status()).toBe(200);
  expect(await licence.text()).toMatch(/SIL OPEN FONT LICENSE/i);
});

test(`the font is inlined: one ${font.family} @font-face with a data: URI`, async ({ open }) => {
  const { page } = await open('/');
  const sources = await page.evaluate(
    (family) =>
      [...document.styleSheets]
        .flatMap((sheet) => [...sheet.cssRules])
        .filter((rule) => rule instanceof CSSFontFaceRule)
        .filter((face) => face.style.getPropertyValue('font-family').replace(/["']/g, '') === family)
        .map((face) => face.style.getPropertyValue('src')),
    font.family,
  );
  expect(sources).toHaveLength(1);
  expect(sources[0]).toMatch(/^url\("?data:font\/woff2[;,]/);
});

// every page but the 404, loaded under Lighthouse's throttling at the project's width
test.describe('slow 4G: LCP within budget, CLS 0', { tag: '@local' }, () => {
  for (const path of ['/', ...PROJECT_PAGES]) {
    test(path, async ({ open }) => {
      const { vitals } = await open(path, { before: slow4g });
      const { lcp, cls } = await vitals();
      expect(lcp, 'LCP in ms').toBeLessThanOrEqual(LIMIT.lcpSlow4gMs);
      expect(cls, 'CLS').toBeLessThan(LIMIT.cls);
    });
  }
});
