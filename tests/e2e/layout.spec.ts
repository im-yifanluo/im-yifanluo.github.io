// Layout on every page at each width of the matrix: text and media on the grid's left edges, right-aligned items on
// its right edges, every vertical gap on the spacing scale, the homepage's project rows, tiles and portrait, a project
// page's one edge and text measure, and no sideways scroll. Each rule is a step, and a failure names the width. The
// sizes come from the page's tokens (src/styles/tokens.css) as it computes them at that width.
import {
  distinct,
  expect,
  isPhone,
  measure,
  near,
  PAGES,
  PROJECT_PAGES,
  projectWidths,
  spacingScale,
  test,
  token,
  type Measurement,
  type Page,
} from './fixtures';

/** One page at one width: what measure() reads there and the tokens its layout follows. */
interface State {
  width: number;
  /** "<width> px", the prefix of every failure message. */
  at: string;
  m: Measurement;
  /** The spacing scale (--s1, --s2, …), in px. */
  scale: number[];
  /** The space between project rows (--s7), in px. */
  rowGap: number;
  /** The media column's width (--media), in px. */
  media: number;
  /** The text measure of a project page (--measure on its body), in px; null on other pages. */
  textMeasure: number | null;
}

/** Measures `page`, opened at `width`, and reads the tokens its layout follows at that width. */
async function stateAt(page: Page, width: number): Promise<State> {
  const m = await measure(page);
  const px = async (name: string) => parseFloat(await token(page, name));
  const textMeasure = await page.evaluate(() => {
    const body = document.querySelector('.p-body');
    return body && parseFloat(getComputedStyle(body).getPropertyValue('--measure'));
  });
  return {
    width,
    at: `${width} px`,
    m,
    scale: await spacingScale(page),
    rowGap: await px('--s7'),
    media: await px('--media'),
    textMeasure,
  };
}

/** Every left edge content starts on: text in main, the footer's © line, media and the header's name. */
const leftEdges = (m: Measurement) => distinct([...m.textLeft, ...m.footLeft, ...m.mediaLeft, ...m.homeLeft]);
const onScale = (gap: number, scale: number[]) => scale.some((step) => near(gap, step));
const desktop = (state: State) => !isPhone(state.width);
/** The widths where the media column is at its full 320 px and a project row is no taller than its tile. */
const fullColumn = (state: State) => state.width >= 1024;

/** Checks one rule at each of `states`, as a step titled with the rule (no step where no width applies). */
async function rule(title: string, states: State[], check: (state: State) => void) {
  if (!states.length) return;
  await test.step(title, () => {
    for (const state of states) check(state);
  });
}

test.describe('layout', { tag: '@local' }, () => {
  for (const path of PAGES) {
    test(path, async ({ open }) => {
      const states: State[] = [];
      for (const width of projectWidths()) {
        const { page } = await open(path, { width, reducedMotion: 'reduce' });
        states.push(await stateAt(page, width));
      }

      // left edges: x0 holds the media and the header's name, x1 the text (one edge on a phone and a project page)
      await rule('all text in main on one left edge (x1)', states, ({ at, m }) => {
        expect.soft(distinct(m.textLeft), `${at}: text edges`).toHaveLength(1);
      });
      await rule('media on the grid edges (x0; text figures x1)', states, ({ at, m }) => {
        const edges = leftEdges(m);
        const media = distinct(m.mediaLeft);
        const off = media.filter((x) => !edges.some((edge) => near(x, edge)));
        expect.soft(off, `${at}: media off the content edges ${edges}`).toEqual([]);
        expect.soft(media.length, `${at}: media edges ${media}`).toBeLessThanOrEqual(path === '/' ? 1 : 2);
      });
      await rule('content left edges: 2 (x0, x1) desktop, 1 phone', states, ({ at, width, m }) => {
        const edges = leftEdges(m);
        expect.soft(edges.length, `${at}: left edges ${edges}`).toBeLessThanOrEqual(isPhone(width) ? 1 : 2);
      });
      if (PROJECT_PAGES.includes(path)) {
        await rule('project page: one left edge for text and media (x0)', states, ({ at, m }) => {
          const text = distinct(m.textLeft);
          expect.soft(text, `${at}: text edges`).toHaveLength(1);
          const off = distinct(m.mediaLeft).filter((x) => !near(x, text[0]));
          expect.soft(off, `${at}: media off the text edge ${text[0]}`).toEqual([]);
        });
        await rule('project page: text ≤ 520 px wide', states.filter(desktop), ({ at, m, textMeasure }) => {
          expect.soft(textMeasure, `${at}: --measure on the page's body`).not.toBeNull();
          expect.soft(m.textMaxW, `${at}: the widest text block`).toBeLessThanOrEqual(textMeasure! + 1);
        });
      }

      // right edges: the content's right edge (header, nav, footer, heroes, pause control) and the date column
      await rule('right-aligned items on ≤ 2 edges (content right + date column)', states, ({ at, m }) => {
        const { dates, ...items } = m.rightEdges;
        const right = distinct(Object.values(items).flat());
        const dateColumn = distinct(dates);
        expect.soft(right.length, `${at}: right edges ${right}`).toBeLessThanOrEqual(1);
        expect.soft(dateColumn.length, `${at}: date column edges ${dateColumn}`).toBeLessThanOrEqual(1);
      });

      // vertical rhythm: every gap is a step of the spacing scale (± 1 px)
      await rule('vertical gaps on the scale', states, ({ at, m, scale }) => {
        // 0 is allowed after a date and between stacked meta lines (measure() marks those pairs)
        const off = m.gaps.filter(({ g, metaPair }) => !(g === 0 && metaPair) && !onScale(g, scale));
        expect.soft(off, `${at}: gaps off the scale ${scale}`).toEqual([]);
      });
      await rule('section gaps on the scale', states, ({ at, m, scale }) => {
        const off = m.sectionGaps.filter(({ g }) => !onScale(g, scale));
        expect.soft(off, `${at}: section gaps off the scale ${scale}`).toEqual([]);
      });
      await rule('main → footer gap on the scale', states, ({ at, m, scale }) => {
        const gap = m.footerGap;
        expect.soft(gap !== null && onScale(gap, scale), `${at}: gap ${gap}, scale ${scale}`).toBe(true);
      });

      if (path === '/') {
        await rule('project rows 48 apart (σ 0)', states, ({ at, m, rowGap }) => {
          const off = m.rowGaps.filter((gap) => !near(gap, rowGap));
          expect.soft(off, `${at}: gaps other than ${rowGap}`).toEqual([]);
        });
        await rule(
          'every project row exactly 180 px tall (≥ 1024 px)',
          states.filter(fullColumn),
          ({ at, m, media }) => {
            // a row is as tall as its tile, which fills the media column at 16:9
            const height = (media * 9) / 16;
            const off = m.tiles.map((tile) => tile.row).filter((row) => !near(row, height));
            expect.soft(off, `${at}: rows other than ${height} px`).toEqual([]);
          },
        );
        await rule('tiles: one size, 16:9', states, ({ at, m }) => {
          expect.soft(distinct(m.tiles.map((tile) => tile.w)), `${at}: tile widths`).toHaveLength(1);
          expect.soft(distinct(m.tiles.map((tile) => tile.h)), `${at}: tile heights`).toHaveLength(1);
          const off = m.tiles.filter((tile) => !near(tile.w / tile.h, 16 / 9, 0.01));
          expect.soft(off, `${at}: tiles not 16:9`).toEqual([]);
        });
        await rule('tiles: one radius, cover, inner hairline', states, ({ at, m }) => {
          const radii = [...new Set(m.tiles.map((tile) => tile.radius))];
          expect.soft(radii, `${at}: tile radii`).toHaveLength(1);
          const off = m.tiles.filter((tile) => tile.fit !== 'cover' || !/inset/.test(tile.hairline));
          expect.soft(off, `${at}: tiles not cover or without the inner hairline`).toEqual([]);
        });
        // beside the name only where the intro is a grid (from 720 px); a phone stacks it
        await rule('portrait 1:1 on the media column', states.filter(desktop), ({ at, m: { portrait, tiles } }) => {
          expect.soft(portrait, `${at}: the portrait beside the name`).not.toBeNull();
          const tile = tiles[0];
          if (!portrait || !tile) return;
          expect.soft(near(portrait.l, tile.l), `${at}: portrait left ${portrait.l}, tiles ${tile.l}`).toBe(true);
          expect.soft(near(portrait.w, tile.w), `${at}: portrait width ${portrait.w}, tiles ${tile.w}`).toBe(true);
          expect.soft(near(portrait.w, portrait.h), `${at}: portrait ${portrait.w} × ${portrait.h}`).toBe(true);
          expect.soft(portrait.radius, `${at}: portrait radius`).toBe(tile.radius);
        });
        await rule('cap height = media top (±1 px)', states.filter(desktop), ({ at, m }) => {
          const off = m.cap.filter(({ d }) => !near(d, 0));
          expect.soft(off, `${at}: cap heights off the media top`).toEqual([]);
        });
      }

      await rule('no horizontal scroll', states, ({ at, m }) => {
        expect.soft(m.scrollWidth, `${at}: scroll width`).toBeLessThanOrEqual(m.clientWidth);
      });
    });
  }
});
