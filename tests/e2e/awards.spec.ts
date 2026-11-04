// The homepage's Awards list: the groups of src/data/awards.yaml not marked `collapsed` are shown, the rest wait behind
// one native <details> control ("Show all N awards", "Show fewer" once open). The list is measured closed and open at
// every width with reduced motion; the control is then driven with motion allowed, in print and with JavaScript off.
import {
  atEachWidth,
  awards,
  distinct,
  expect,
  font,
  measure,
  near,
  settle,
  spacingScale,
  test,
  token,
  widest,
  type AwardGroup,
  type Measurement,
  type Open,
  type Page,
} from './fixtures';
import { axNode } from './helpers/a11y';
import { awardsState, framesBetween, framesDuring, openAwards } from './helpers/awards';

type Measured = Measurement & { awards: NonNullable<Measurement['awards']> };

const rowCount = (groups: AwardGroup[]) => groups.reduce((n, group) => n + group.items.length, 0);
const SHOWN = awards.filter((group) => !group.collapsed);
const HIDDEN = awards.filter((group) => group.collapsed);
const ALL = rowCount(awards);
const CLOSED_LABEL = `Show all ${ALL} awards`;
const OPEN_LABEL = 'Show fewer';
const SUMMARY = '.awards-more > summary';
/** On touch the control's line box stays one meta line: 24 px, give or take 2. */
const LINE_BOX_MAX = 26;

/** measure(page), with its Awards part (the homepage has the control). */
async function measured(page: Page): Promise<Measured> {
  const m = await measure(page);
  expect(m.awards, 'the homepage has the Awards control').not.toBeNull();
  return m as Measured;
}

interface Homepage {
  page: Page;
  /** The measurement with the Awards list closed. */
  closed: Measured;
  /** The text edge of the closed page. */
  edge: number;
  /** Opens the Awards list and measures again. */
  opened: () => Promise<Measured>;
}

/** Runs `check` at each width of the project, one step per width, on the homepage with reduced motion and the Awards
 *  list closed. */
const atWidths = (open: Open, check: (home: Homepage) => Promise<void>) =>
  atEachWidth(open, '/', async (page) => {
    const closed = await measured(page);
    const opened = () => openAwards(page).then(() => measured(page));
    await check({ page, closed, edge: distinct(closed.textLeft)[0]!, opened });
  });

test.describe('Awards at every width, reduced motion', () => {
  test('Awards: recent groups shown; the rest behind one closed "Show all N awards" control at the text edge, 24 px under them', ({
    open,
  }) =>
    atWidths(open, async ({ page, closed, edge }) => {
      const A = closed.awards;
      const s5 = parseFloat(await token(page, '--s5'));
      expect(A).toMatchObject({ open: false, rows: ALL, visibleRows: A.shownRows, label: CLOSED_LABEL });
      expect(A).toMatchObject({ sumVisible: true, sumBelowRows: true });
      expect(A.shownRows).toBeLessThan(A.rows);
      expect(near(A.sumLeft, edge), `the control (${A.sumLeft}) on the text edge (${edge})`).toBe(true);
      expect(near(A.gapShownToMore, s5), `${A.gapShownToMore} px under the shown groups`).toBe(true);
    }));

  test('Awards default cut: the groups not marked collapsed are shown, the collapsed ones wait behind the control', ({
    open,
  }) =>
    atWidths(open, async ({ closed: { awards: A } }) => {
      expect(A.shownGroups).toEqual(SHOWN.map((group) => group.label));
      expect(A.hiddenGroups).toEqual(HIDDEN.map((group) => group.label));
      expect(A.shownRows).toBe(rowCount(SHOWN));
      expect(A.rows - A.shownRows).toBe(rowCount(HIDDEN));
    }));

  test('Awards opened: every row shown, “Show fewer” ends the list, 24 px between groups and before it, nothing above moves', ({
    open,
  }) =>
    atWidths(open, async ({ page, closed, opened }) => {
      const s5 = parseFloat(await token(page, '--s5'));
      const B = (await opened()).awards;
      expect(B).toMatchObject({ open: true, visibleRows: B.rows, label: OPEN_LABEL, sumBelowRows: true });
      expect(
        B.gapsOpen.every((gap) => near(gap, s5)),
        `gaps ${B.gapsOpen.join(', ')}`,
      ).toBe(true);
      expect(B.above, 'the heading and the shown rows stay put').toEqual(closed.awards.above);
    }));

  test('Awards opened: one text edge, gaps on the scale, no stray “·”, dates on one edge, no sideways scroll, every glyph in the font', ({
    open,
  }) =>
    atWidths(open, async ({ page, edge, opened }) => {
      const scale = await spacingScale(page);
      const o = await opened();
      const edges = distinct(o.textLeft);
      const missing = Object.entries(o.chars).flatMap(([family, text]) =>
        [...new Set(text)]
          .filter((c) => !/\s/.test(c) && !(family === font.family && font.codepoints.has(c.codePointAt(0)!)))
          .map((c) => `${family}: ${c}`),
      );
      expect({
        textEdges: edges.length,
        onTheEdge: near(edges[0]!, edge),
        offScale: o.gaps.filter((x) => !(x.g === 0 && x.metaPair) && !scale.some((step) => near(x.g, step))),
        seps: o.seps,
        sepEnds: o.sepEnds,
        datesOnOneEdge: distinct(o.rightEdges.dates).length <= 1,
        sideways: o.scrollWidth > o.clientWidth,
        missing,
      }).toEqual({
        textEdges: 1,
        onTheEdge: true,
        offScale: [],
        seps: [],
        sepEnds: [],
        datesOnOneEdge: true,
        sideways: false,
        missing: [],
      });
    }));

  test('reduced motion: Awards opens with no transition', ({ open }) =>
    atWidths(open, async ({ page, opened }) => {
      await opened();
      const durations = await page.evaluate(
        () => getComputedStyle(document.querySelector('.awards-more')!, '::details-content').transitionDuration,
      );
      expect(durations.split(',').map(parseFloat), durations).toEqual(durations.split(',').map(() => 0));
    }));

  // the phone widths: the check is about touch
  test('Awards control on touch: ≥ 44 px tap area, the line box unchanged', { tag: '@phone' }, ({ open }) =>
    atWidths(open, async ({ closed: { awards: A } }) => {
      expect({ up: A.tap.up, down: A.tap.down }, 'a tap 21 px above or below the line hits it').toEqual({
        up: true,
        down: true,
      });
      expect(A.tap.h).toBeLessThanOrEqual(LINE_BOX_MAX);
    }),
  );
});

/** The homepage at `width` with motion allowed, the pointer away and the Awards control in the middle of the screen. */
async function controlAt(open: Open, width: number) {
  const { page } = await open('/', { width, reducedMotion: 'no-preference' });
  await page.mouse.move(0, 0);
  await page
    .locator(SUMMARY)
    .evaluate((summary) =>
      scrollTo({ top: summary.getBoundingClientRect().top + scrollY - innerHeight / 2, behavior: 'instant' }),
    );
  await settle(page);
  return page;
}

test.describe('the Awards control, motion allowed', () => {
  test('Awards reveal: height + opacity ease out over 200–250 ms', async ({ open }) => {
    const page = await controlAt(open, widest());
    const frames = await framesDuring(page, () => page.click(SUMMARY));
    const last = frames.at(-1)![1];
    const transition = await page.evaluate(() => {
      const cs = getComputedStyle(document.querySelector('.awards-more')!, '::details-content');
      const ease = getComputedStyle(document.documentElement).getPropertyValue('--ease-out').trim();
      return { props: cs.transitionProperty, durations: cs.transitionDuration, fns: cs.transitionTimingFunction, ease };
    });
    const props = transition.props.split(',').map((x) => x.trim());
    const seconds = (prop: string) => parseFloat(transition.durations.split(',')[props.indexOf(prop)] ?? 'NaN');
    // "cubic-bezier(.2,.7,…)" and "cubic-bezier(0.2, 0.7, …)" are the same curve
    const numbers = (value = '') => (value.match(/-?\d*\.?\d+/g) ?? []).map(Number).join();
    const heightFn = transition.fns.split(/,\s*(?=cubic|ease|linear|steps)/)[props.indexOf('height')];
    const detail = JSON.stringify({ frames: frames.map((f) => f.join(':')).join(' '), ...transition });
    expect(framesBetween(frames), `frames between closed and open: ${detail}`).toBeGreaterThanOrEqual(3);
    expect(frames.find(([, h]) => h === last)?.[0], `open by 320 ms: ${detail}`).toBeLessThanOrEqual(320);
    for (const prop of ['height', 'opacity']) {
      expect(seconds(prop), `${prop}: ${detail}`).toBeGreaterThanOrEqual(0.2);
      expect(seconds(prop), `${prop}: ${detail}`).toBeLessThanOrEqual(0.25);
    }
    expect(numbers(heightFn), 'the height eases with --ease-out').toBe(numbers(transition.ease));
  });

  test('Awards control: a click opens and closes it, expanded state exposed, nothing above it moves', async ({
    open,
  }) => {
    const page = await controlAt(open, widest());
    const state = async () => ({ ...(await awardsState(page)), ax: await axNode(page, SUMMARY) });
    const expanded = (value: boolean) => ({ states: { expanded: value } });
    const s0 = await state();
    await framesDuring(page, () => page.click(SUMMARY));
    const s1 = await state();
    const closing = await framesDuring(page, () => page.click(SUMMARY));
    const s2 = await state();
    expect(s0).toMatchObject({ open: false, all: ALL, ax: { name: CLOSED_LABEL, ...expanded(false) } });
    expect(s1).toMatchObject({ open: true, rows: s1.all, label: OPEN_LABEL, ax: expanded(true) });
    expect({ y: s1.y, h2: s1.h2 }, 'no scroll, the heading stays put').toEqual({ y: s0.y, h2: s0.h2 });
    expect(s2).toMatchObject({ open: false, rows: s0.rows, ax: expanded(false) });
    expect(framesBetween(closing), 'the rows close over several frames').toBeGreaterThanOrEqual(3);
  });

  test('Awards control: Enter opens it, Space closes it', async ({ open }) => {
    const page = await controlAt(open, widest());
    await page.locator(SUMMARY).evaluate((summary) => (summary as HTMLElement).focus({ preventScroll: true }));
    await page.keyboard.press('Enter');
    await settle(page);
    expect(await awardsState(page)).toMatchObject({ open: true, label: OPEN_LABEL });
    await page.keyboard.press(' ');
    await settle(page);
    expect(await awardsState(page)).toMatchObject({ open: false, label: CLOSED_LABEL });
  });

  // hover needs a mouse: the phone contexts are touch screens
  test('Awards control: hover changes colour and underline (like a link)', { tag: '@desktop' }, async ({ open }) => {
    const page = await controlAt(open, widest());
    const look = () =>
      page.locator(SUMMARY).evaluate((summary) => {
        const cs = getComputedStyle(summary);
        return { colour: cs.color, underline: cs.textDecorationColor };
      });
    const rest = await look();
    await page.hover(SUMMARY);
    await settle(page);
    expect(await look()).not.toEqual(rest);
  });

  test('Awards printed: every row, no control', async ({ open }) => {
    const page = await controlAt(open, widest());
    await page.emulateMedia({ media: 'print' });
    await settle(page);
    const printed = await page.evaluate(() => ({
      rows: [...document.querySelectorAll('#awards li')].filter((row) => row.checkVisibility()).length,
      summary: getComputedStyle(document.querySelector('.awards-more > summary')!).display,
    }));
    expect(printed).toEqual({ rows: ALL, summary: 'none' });
  });
});

test('Awards with JS off: the control opens natively; the hidden rows are in the HTML', async ({ open }) => {
  const { page } = await open('/', { width: widest(), javaScriptEnabled: false, waitUntil: 'load' });
  const before = await awardsState(page);
  expect(before.rows).toBeLessThan(before.all);
  await page.click(SUMMARY);
  await expect.poll(() => awardsState(page)).toMatchObject({ open: true, rows: before.all, label: OPEN_LABEL });
  // every hidden row is text in the served HTML, so find-in-page (which opens a closed <details>) and search reach it
  const html = await (await page.request.get('/')).text();
  const rowsInHtml = await page.evaluate(
    (html) =>
      [...new DOMParser().parseFromString(html, 'text/html').querySelectorAll('.awards-more li p')].filter((p) =>
        p.textContent!.trim(),
      ).length,
    html,
  );
  expect(rowsInHtml).toBe(before.all - before.rows);
  expect(rowsInHtml).toBe(rowCount(HIDDEN));
});
