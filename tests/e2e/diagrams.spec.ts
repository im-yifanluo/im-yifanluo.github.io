// The project diagrams (src/components/diagrams, drawn from src/data/diagrams.ts) on the real pages: the drawn grid only
// where the figure is wide enough and the list below; nothing painted outside the plate; on the drawing, Tab, hover and
// the cue; on the list, Tab and tap; every detail exposed to assistive tech; with JS off, the list and the captions; the
// script and styles only on pages with a diagram; and the drawing's alignment (labels, edge ends, frames, rows).
import { plain } from '../../src/lib/typography';
import { atEachWidth, axeViolations, expect, measure, PAGES, test, type Page } from './fixtures';
import { axNodes } from './helpers/a11y';
import {
  boxRows,
  centreDrops,
  DIAGRAM_PAGES,
  FLOW_PAGES,
  framedRows,
  GRID_FROM,
  letters,
  rowGapLabels,
} from './helpers/diagram-data';
import * as dom from './helpers/diagram-dom';
import { readHtml } from './helpers/dist';

/** A diagram script's size limit (scripts/check-dist.mjs holds all of _astro/*.js to budgets.json's externalJsBytes). */
const SCRIPT_MAX = 8 * 1024;
/** The interaction checks run at 2x pixels on phones. */
const PHONE_PIXELS = { deviceScaleFactor: 2 };

/** The ids of the page's diagram nodes, in document (and Tab) order. */
const ids = (page: Page) => page.locator('.dg-node').evaluateAll((nodes) => nodes.map((node) => node.id));

/** From the heading of the section holding the diagrams, Tab once per node: where each stop lands and how it shows. */
async function tabThroughNodes(page: Page) {
  const nodes = await ids(page);
  await page.evaluate(dom.focusSectionHeading);
  const stops = [];
  for (let k = 0; k < nodes.length; k++) {
    await page.keyboard.press('Tab');
    stops.push(await page.evaluate(dom.focusState));
  }
  const order = stops.map(({ id }) => id);
  const unringed = stops.filter(({ ring }) => !ring).map(({ id }) => id);
  expect(order, 'Tab order').toEqual(nodes);
  expect(unringed, 'stops without the focus ring').toEqual([]);
  return stops;
}

// the same at every width: checked in the desktop project
test.describe('script and styles', { tag: '@desktop' }, () => {
  for (const path of PAGES) {
    const shown = DIAGRAM_PAGES.find((page) => page.path === path);
    test(`${path}: diagram script and styles only on pages that render a diagram (script ≤ ${SCRIPT_MAX / 1024} KB)`, async ({
      page,
      request,
      baseURL,
    }) => {
      const { diagrams: html } = await readHtml(page, await (await request.get(path)).text());
      const expected = { figs: shown?.diagrams.length ?? 0, flows: shown?.flows.length ?? 0 };
      expect({ figs: html.figs, flows: html.flows }).toEqual(expected);
      if (html.flows) {
        expect(html.scripts).toHaveLength(1);
        expect(html.styles, 'the diagram styles').toBe(true);
        const script = await request.get(new URL(html.scripts[0]!, new URL(path, baseURL)).href);
        expect((await script.body()).length, html.scripts[0]).toBeLessThanOrEqual(SCRIPT_MAX);
      } else {
        expect(html.scripts).toEqual([]);
        expect(html.styles, 'the diagram styles').toBe(html.figs > 0);
      }
    });
  }
});

test.describe('every width', () => {
  for (const { path, diagrams, flows } of DIAGRAM_PAGES) {
    test(`${path}: diagrams: drawn grid (every edge) where the figure is ≥ ${GRID_FROM} px, the list below`, async ({
      open,
    }) => {
      await atEachWidth(open, path, async (page) => {
        const { dg } = await measure(page);
        expect(dg.map(({ id }) => id)).toEqual(diagrams.map(({ spec }) => `dg-${spec.id}`));
        const wrong = dg.filter(({ kind, grid, figW, drawn, undrawn }) =>
          kind === 'flow' ? grid !== figW >= GRID_FROM || drawn !== grid || (grid && undrawn > 0) : grid,
        );
        expect.soft(wrong).toEqual([]);
      });
    });

    test(`${path}: diagrams: nothing painted outside the plate`, async ({ open }) => {
      await atEachWidth(open, path, async (page) => {
        const outside = (await measure(page)).dg.filter(({ over }) => over.length);
        expect.soft(outside.map(({ id, over }) => ({ id, over: over.slice(0, 5) }))).toEqual([]);
      });
    });

    // the list: checked at the phone widths
    if (flows.length) {
      test(
        `${path}: diagrams (phone list): every step opened stays inside the plate, no sideways scroll`,
        { tag: '@phone' },
        ({ open }) =>
          atEachWidth(open, path, async (page) => expect.soft(await page.evaluate(dom.stepsOutside)).toEqual([])),
      );
    }
  }
});

// drawn from GRID_FROM px: checked at 1440 px in the desktop project
test.describe('the drawing', { tag: '@desktop' }, () => {
  for (const { path, flows } of FLOW_PAGES) {
    test(`${path}: diagrams: Tab reaches every node in order (ring, detail in the caption); Enter pins, Escape unpins`, async ({
      open,
    }) => {
      const { page } = await open(path, { reducedMotion: 'reduce' });
      const stops = await tabThroughNodes(page);
      const undetailed = stops.filter(({ detail }) => !detail).map(({ id }) => id);
      expect(undetailed, 'stops without their detail').toEqual([]);
      await page.keyboard.press('Enter');
      expect(await page.evaluate(() => document.activeElement?.getAttribute('aria-pressed'))).toBe('true');
      await page.keyboard.press('Escape');
      expect(await page.evaluate(dom.unpinned)).toBe(true);
    });

    test(`${path}: diagrams: hover lights each node and shows its detail; nothing moves; back to rest`, async ({
      open,
    }) => {
      const { page } = await open(path, { reducedMotion: 'reduce' });
      await page.evaluate(dom.watchShifts);
      const before = await page.evaluate(dom.layout);
      const off = [];
      for (const id of await ids(page)) {
        await page.hover(`#${id}`);
        const state = await page.evaluate(dom.hoverState, id);
        const moved = (await page.evaluate(dom.layout)) !== before;
        if (!state.on || !state.detail || state.rest !== 'hidden' || moved) off.push({ id, ...state, moved });
      }
      await page.mouse.move(0, 0);
      expect(off).toEqual([]);
      expect(await page.evaluate(dom.atRest)).toEqual({ on: 0, shift: 0 });
    });

    test(`${path}: diagram cue: pointer cursor, the hint at rest, hidden on hover, caption height fixed`, async ({
      open,
    }) => {
      const { page } = await open(path);
      for (const { id } of flows) {
        const fig = page.locator(`#dg-${id}`);
        await fig.scrollIntoViewIfNeeded();
        await page.mouse.move(0, 0);
        const rest = await fig.evaluate(dom.cue);
        expect(rest.cursor, `#dg-${id}: a pointer on every box`).toBe(true);
        expect(rest.hint, `#dg-${id}: the hint at rest`).not.toBe('');
        expect(rest.hint, `#dg-${id}: the pointer's hint`).toBe(rest.hoverHint);
        const hint = async () => (await fig.evaluate(dom.cue)).hint;
        await fig.locator('.dg-node').nth(2).hover();
        await expect.poll(hint, { message: `#dg-${id}: the hint on hover` }).toBe('');
        expect((await fig.evaluate(dom.cue)).caption, `#dg-${id}: caption height`).toBe(rest.caption);
      }
    });

    for (const d of flows) {
      const gaps = rowGapLabels(d);
      const drops = centreDrops(d);
      const title = drops.length
        ? 'diagram: row-gap labels on one line, hv edges into the box centre'
        : 'diagram: row-gap labels on one line';
      if (gaps.length || drops.length) {
        test(`${path} #dg-${d.id}: ${title}`, async ({ open }) => {
          const { page } = await open(path);
          const drawn = await page.evaluate(dom.edgeGeometry, { id: d.id, gaps, drops });
          expect(drawn.labels, 'edge labels').toBe(d.edges.filter(({ label }) => label).length);
          for (const ys of drawn.gaps) expect.soft(new Set(ys).size, `label centres ${ys.join(', ')}`).toBe(1);
          for (const off of drawn.drops)
            expect.soft(Math.abs(off), 'hv edge end from the box centre').toBeLessThanOrEqual(1);
        });
      }
      const rows = boxRows(d);
      if (rows.length) {
        test(`${path} #dg-${d.id}: diagram: the boxes of one row share one height`, async ({ open }) => {
          const { page } = await open(path);
          for (const heights of await page.evaluate(dom.rowHeights, { id: d.id, rows })) {
            expect.soft(new Set(heights).size, `box heights ${heights.join(', ')}`).toBe(1);
          }
        });
      }
      const frames = framedRows(d);
      if (frames.length) {
        test(`${path} #dg-${d.id}: diagram: a frame’s top and header label line up with its row`, async ({ open }) => {
          const { page } = await open(path);
          for (const tops of await page.evaluate(dom.frameTops, { id: d.id, frames })) {
            expect.soft(new Set(tops.boxes).size, `${tops.frame}: box tops ${tops.boxes}`).toBe(1);
            expect.soft(tops.top, `${tops.frame}: the frame's top`).toBe(tops.boxes[0]);
            expect.soft(new Set(tops.labels).size, `${tops.frame}: label tops ${tops.labels}`).toBe(1);
          }
        });
      }
    }
  }
});

// the list: checked at 390 px in the phone project
test.describe('the list', { tag: '@phone' }, () => {
  for (const { path, flows } of FLOW_PAGES) {
    test(`${path}: diagrams: Tab reaches every step in order (ring); Enter opens and closes its detail`, async ({
      open,
    }) => {
      const { page } = await open(path, { reducedMotion: 'reduce', ...PHONE_PIXELS });
      const [first] = await tabThroughNodes(page);
      await page.focus(`#${first!.id}`);
      await page.keyboard.press('Enter');
      const opened = await page.evaluate(dom.stepState, first!.id);
      await page.keyboard.press('Enter');
      const closed = await page.evaluate(dom.stepState, first!.id);
      const toggled = { opened: opened.open, tall: opened.height > 10, closed: !closed.open };
      expect(toggled).toEqual({ opened: true, tall: true, closed: true });
    });

    for (const d of flows) {
      test(`${path} #dg-${d.id}: diagram list: aria-expanded follows the open step`, async ({ open }) => {
        const { page } = await open(path, PHONE_PIXELS);
        const nodes = page.locator(`#dg-${d.id} .dg-node`);
        const expanded = () => nodes.evaluateAll((buttons) => buttons.map((b) => b.getAttribute('aria-expanded')));
        const none = d.nodes.map(() => 'false');
        expect(await expanded()).toEqual(none);
        await nodes.nth(1).tap();
        await expect.poll(expanded).toEqual(none.with(1, 'true'));
        await nodes.nth(1).tap();
        await expect.poll(expanded).toEqual(none);
      });
    }
  }
});

test.describe('both layouts', () => {
  for (const { path, flows } of FLOW_PAGES) {
    test(`${path}: keyboard: Tab leaves the last node for the next control (no trap)`, async ({ open }) => {
      const { page } = await open(path, { reducedMotion: 'reduce' });
      for (const { id } of flows) {
        await page.locator(`#dg-${id} .dg-node`).last().focus();
        await page.keyboard.press('Tab');
        expect(await page.evaluate(dom.focusOutside, `dg-${id}`), `Tab from #dg-${id}'s last node`).toBe(true);
      }
    });

    test(`${path}: each node's detail is exposed to assistive tech`, async ({ open, isMobile }) => {
      const { page } = await open(path, { reducedMotion: 'reduce' });
      const found = await page
        .locator('.dg-node')
        .evaluateAll((nodes) =>
          nodes.map((n) => `${n.closest('.dg-fig')!.id.slice(3)}/${n.parentElement!.dataset.id}`),
        );
      const nodes = await axNodes(page, '.dg-node');
      const expected = flows.flatMap(({ id, nodes }) => nodes.map((node) => ({ where: `${id}/${node.id}`, node })));
      expect(found, 'the nodes in document order').toEqual(expected.map(({ where }) => where));
      expected.forEach(({ where, node }, k) => {
        const { role, name, states } = nodes[k]!;
        // a pin on the drawing (aria-pressed), a step of the list on a phone (aria-expanded)
        const state = { pressed: 'pressed' in states, expanded: 'expanded' in states };
        expect.soft({ role, ...state }, where).toEqual({ role: 'button', pressed: !isMobile, expanded: isMobile });
        expect.soft(letters(name), `${where}: its detail in its name`).toContain(letters(plain(node.detail)));
      });
    });

    test(`${path}: axe: 0 serious or critical issues with a node pinned / a step open`, async ({ open }) => {
      const { page } = await open(path, { reducedMotion: 'reduce' });
      await page.locator('.dg-node').first().focus();
      await page.keyboard.press('Enter');
      await expect(page.locator('.dg-node[aria-pressed="true"], .dg-item.is-open')).toHaveCount(1);
      expect(await axeViolations(page)).toEqual([]);
    });
  }
});

test.describe('with JS off', () => {
  for (const { path, diagrams } of DIAGRAM_PAGES) {
    const figures = diagrams.map(({ spec }) => `dg-${spec.id}`);

    test(`${path}: diagrams with JS off: the list, every detail and link line printed, caption at rest, no sideways scroll`, async ({
      open,
    }) => {
      const { page } = await open(path, { javaScriptEnabled: false, waitUntil: 'load' });
      const { scroll, figs } = await page.evaluate(dom.withoutScripts);
      expect(scroll, 'sideways scroll').toBeLessThanOrEqual(0);
      expect(figs.map(({ id }) => id)).toEqual(figures);
      expect(figs.filter((f) => !(f.list && f.details && f.rel && f.cap && f.edges && f.table))).toEqual([]);
    });

    test(`${path}: with JS off every diagram keeps its caption text`, async ({ open }) => {
      const { page } = await open(path, { javaScriptEnabled: false, waitUntil: 'load' });
      const captions = await page.locator('.dg-fig').evaluateAll(dom.captionTexts);
      expect(captions.map(({ id }) => id)).toEqual(figures);
      diagrams.forEach(({ caption }, k) => {
        expect(letters(caption)).not.toBe('');
        expect.soft(letters(captions[k]!.text), figures[k]).toContain(letters(plain(caption)));
      });
    });
  }
});
