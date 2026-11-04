// Shared setup for the end-to-end tests: the pages and widths under test, the site's data and budgets, the `open`
// fixture (a page in its own browser context, with errors and web vitals recorded) and the measuring and waiting
// helpers. Specs import `test`, `expect` and the Playwright types from here, not from @playwright/test.
import AxeBuilder from '@axe-core/playwright';
import {
  test as base,
  expect,
  type BrowserContext,
  type BrowserContextOptions,
  type Page,
  type TestInfo,
} from '@playwright/test';
import { font } from './helpers/data';
import { DESKTOP, deviceAt, isPhone, WIDTHS } from './helpers/devices';

export { expect };
export type { Locator, Page } from '@playwright/test';
export * from './helpers/data';
export * from './helpers/devices';
export { measure, missingGlyphs, type Box, type Measurement } from './helpers/measure';
export { clickAndScroll, scrollToY, settle } from './helpers/settle';

/** The widths of the matrix that the running project covers: the phone widths in `phone`, the others in `desktop`. */
export function projectWidths(info: TestInfo = test.info()): number[] {
  return WIDTHS.filter((width) => isPhone(width) === !!info.project.use.isMobile);
}

/** The running project's widest width: 1440 px in `desktop`, 390 px in `phone`. */
export const widest = (info: TestInfo = test.info()) => projectWidths(info)[0]!;

/** Whether `a` is within `tolerance` px of `b`. */
export const near = (a: number, b: number, tolerance = 1) => Math.abs(a - b) <= tolerance;

/** The distinct values among `values`, where values within `tolerance` px of an earlier one count as that one. */
export const distinct = (values: number[], tolerance = 1) =>
  values.reduce<number[]>((seen, x) => (seen.some((y) => near(x, y, tolerance)) ? seen : [...seen, x]), []);

/** A custom property of the page's root (src/styles/tokens.css), e.g. `await token(page, '--s5')` is "24px". */
export const token = (page: Page, name: string) =>
  page.evaluate((name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim(), name);

/** The spacing scale in px: the tokens --s1, --s2, … of src/styles/tokens.css, for as long as the page defines them. */
export const spacingScale = (page: Page) =>
  page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const scale: number[] = [];
    for (let n = 1; root.getPropertyValue(`--s${n}`).trim(); n++)
      scale.push(parseFloat(root.getPropertyValue(`--s${n}`)));
    return scale;
  });

/** axe-core's serious and critical violations on the page as it is now, each as "rule: number of elements". */
export async function axeViolations(page: Page): Promise<string[]> {
  const { violations } = await new AxeBuilder({ page }).analyze();
  return violations
    .filter((violation) => violation.impact === 'serious' || violation.impact === 'critical')
    .map((violation) => `${violation.id}: ${violation.nodes.length}`);
}

/** Whether the page's body text is set in the site's font (not a fallback face). */
const fontLoaded = (page: Page, frames: boolean) =>
  page.evaluate(
    async ({ family, frames }) => {
      await document.fonts.ready;
      // two frames for the end-of-line pass, which BaseLayout's script runs once the font is ready (frames never come
      // with JS off)
      if (frames) await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
      const body = getComputedStyle(document.body);
      return document.fonts.check(`${body.fontWeight} ${body.fontSize} "${family}"`);
    },
    { family: font.family, frames },
  );

/**
 * Waits until the page is set in the site's font (inlined in the page CSS, src/styles/fonts.css); if it is not, reloads
 * once before failing. Pass `{ scripts: false }` for a page with JavaScript off.
 */
async function waitForFonts(page: Page, { scripts = true } = {}): Promise<void> {
  if (await fontLoaded(page, scripts)) return;
  await page.reload({ waitUntil: 'networkidle' });
  if (!(await fontLoaded(page, scripts))) throw new Error(`${page.url()}: the font "${font.family}" did not load`);
}

/** Scrolls through the whole page, a screen at a time, and back to the top; resolves once every image shown loaded. */
export async function scrollThrough(page: Page): Promise<void> {
  await page.evaluate(async () => {
    const frame = () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
    for (let y = 0; y < document.documentElement.scrollHeight; y += innerHeight * 0.7) {
      scrollTo({ top: y, behavior: 'instant' });
      await frame();
    }
    scrollTo({ top: 0, behavior: 'instant' });
  });
  await page.waitForFunction(() => [...document.images].every((img) => img.complete || !img.checkVisibility()));
}

interface LayoutShift extends PerformanceEntry {
  value: number;
  hadRecentInput: boolean;
}
/** Runs in the page before its own scripts: sums the layout shifts not caused by input, keeps the latest LCP. */
function observeVitals() {
  const vitals = { cls: 0, lcp: 0 };
  Object.assign(window, { e2eVitals: vitals });
  new PerformanceObserver((list) => {
    for (const shift of list.getEntries() as LayoutShift[]) if (!shift.hadRecentInput) vitals.cls += shift.value;
  }).observe({ type: 'layout-shift', buffered: true });
  new PerformanceObserver((list) => {
    for (const paint of list.getEntries()) vitals.lcp = paint.startTime;
  }).observe({ type: 'largest-contentful-paint', buffered: true });
}

/** Records console errors, page errors, failed requests (except video loops, which are aborted when they pause) and
 *  HTTP errors (except on the 404 page). */
function recordErrors(page: Page, path: string): string[] {
  const errors: string[] = [];
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text());
  });
  page.on('pageerror', (error) => errors.push(String(error)));
  page.on('requestfailed', (request) => {
    if (!/\.(mp4|webm)$/.test(request.url())) errors.push(`failed ${request.url()}`);
  });
  page.on('response', (response) => {
    if (response.status() >= 400 && path !== '/404.html' && !response.url().endsWith('/404.html'))
      errors.push(`${response.status()} ${response.url()}`);
  });
  return errors;
}

export interface OpenOptions extends BrowserContextOptions {
  /** The viewport width; the context follows deviceAt(width). Default: the project's width. */
  width?: number;
  /** When the navigation counts as done. Default: 'networkidle'. */
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  /** Runs on the new page before it navigates, after the error and vitals recorders: e.g. network throttling. */
  before?: (page: Page) => Promise<void> | void;
}

/** Motion allowed, at the desktop width: for hover and the header's states. */
export const MOTION: OpenOptions = { width: DESKTOP, reducedMotion: 'no-preference' };

export interface OpenPage {
  page: Page;
  context: BrowserContext;
  /** What recordErrors() caught so far. */
  errors: string[];
  /** The layout shift so far and the latest largest-contentful-paint time, in ms (recorded only with JS on). */
  vitals(): Promise<{ cls: number; lcp: number }>;
}

/** Opens `path` in a new browser context (closed after the test) and waits for the font. */
export type Open = (path: string, options?: OpenOptions) => Promise<OpenPage>;

export const test = base.extend<{ open: Open }>({
  open: async ({ browser, baseURL }, use, testInfo) => {
    const contexts: BrowserContext[] = [];
    await use(async (path, { width, waitUntil = 'networkidle', before, ...options } = {}) => {
      const device = deviceAt(width ?? testInfo.project.use.viewport?.width ?? DESKTOP);
      const context = await browser.newContext({ ...device, baseURL, ...options });
      contexts.push(context);
      const page = await context.newPage();
      const errors = recordErrors(page, path);
      await page.addInitScript(observeVitals);
      await before?.(page);
      await page.goto(path, { waitUntil });
      await waitForFonts(page, { scripts: options.javaScriptEnabled !== false });
      const vitals = () =>
        page.evaluate(() => (window as unknown as { e2eVitals: { cls: number; lcp: number } }).e2eVitals);
      return { page, context, errors, vitals };
    });
    await Promise.all(contexts.map((context) => context.close()));
  },
});

/** Opens `path` at each width of the running project with reduced motion and runs `check` on it: one step per width,
 *  each in its own browser context. `check` also gets the whole OpenPage (its errors and vitals). */
export async function atEachWidth(
  open: Open,
  path: string,
  check: (page: Page, width: number, opened: OpenPage) => Promise<void>,
) {
  for (const width of projectWidths()) {
    await test.step(`${width} px`, async () => {
      const opened = await open(path, { width, reducedMotion: 'reduce' });
      await check(opened.page, width, opened);
      await opened.context.close();
    });
  }
}
