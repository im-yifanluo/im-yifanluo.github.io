// Accessibility: axe-core on every page (and with the Awards list open), target sizes, image attributes, landmarks and
// the skip link, a visible focus on every Tab stop, one stop per destination, and the separators in the diagrams, which
// assistive technology must read as a comma rather than as a dot.
import { DIAGRAMS } from '../../src/data/diagrams';
import {
  atEachWidth,
  axeViolations,
  expect,
  measure,
  PAGES,
  projects,
  scrollThrough,
  settle,
  test,
  widest,
} from './fixtures';
import { axNode, focusStop, type FocusStop } from './helpers/a11y';

// back at the top the homepage's header name fades out; settle() lets the fade end before axe reads any contrast
test.describe('axe-core: 0 serious or critical issues', () => {
  for (const path of PAGES)
    test(path, async ({ open }) => {
      const { page } = await open(path, { width: widest(), reducedMotion: 'reduce' });
      await scrollThrough(page);
      await settle(page);
      expect(await axeViolations(page)).toEqual([]);
    });
});

test('axe: 0 serious or critical issues with the Awards list open', async ({ open }) => {
  const { page } = await open('/', { width: widest(), reducedMotion: 'reduce' });
  await page.locator('.awards-more > summary').click();
  await expect(page.locator('.awards-more')).toHaveAttribute('open');
  await scrollThrough(page);
  await settle(page);
  expect(await axeViolations(page)).toEqual([]);
});

test.describe('non-inline targets ≥ 24 px', () => {
  for (const path of PAGES)
    test(path, ({ open }) =>
      atEachWidth(open, path, async (page) => {
        const { links } = await measure(page);
        expect(links.filter((link) => !link.inline && link.h < 24)).toEqual([]);
      }),
    );
});

test.describe('every img sized and has alt', () => {
  for (const path of PAGES)
    test(path, ({ open }) =>
      atEachWidth(open, path, async (page) => {
        const { imgs } = await measure(page);
        expect(imgs.filter((img) => !img.wh || !img.alt)).toEqual([]);
      }),
    );
});

test.describe('landmarks and a skip link', () => {
  for (const path of PAGES)
    test(path, async ({ open }) => {
      const { page } = await open(path);
      await expect(page.getByRole('banner')).toHaveCount(1);
      await expect(page.getByRole('navigation')).not.toHaveCount(0);
      await expect(page.getByRole('main')).toHaveCount(1);
      await expect(page.getByRole('contentinfo')).toHaveCount(1);
      await page.keyboard.press('Tab');
      const first = page.locator(':focus');
      await expect(first).toHaveAccessibleName('Skip to content');
      await expect(first).toHaveAttribute('href', '#main');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('main')).toBeFocused();
      await expect(page.getByRole('main')).toHaveId('main');
    });
});

test.describe('keyboard, motion allowed', () => {
  for (const path of PAGES) {
    test(`focus shown on every Tab stop (ring / in-text highlight / tile ring): ${path}`, async ({ open }) => {
      const { page } = await open(path, { width: widest(), reducedMotion: 'no-preference' });
      await page.mouse.move(0, 0);
      // from the top of the document
      await page.evaluate(() => {
        scrollTo(0, 0);
        document.body.tabIndex = -1;
        document.body.focus();
        document.body.removeAttribute('tabindex');
      });
      const stops: FocusStop[] = [];
      while (stops.length < 200) {
        await page.keyboard.press('Tab');
        await settle(page); // the tile ring eases in
        const stop = await focusStop(page);
        if (!stop) break;
        stops.push(stop);
      }
      expect(stops.length).toBeGreaterThan(0);
      expect(stops.filter((stop) => !stop.shown)).toEqual([]);
    });

    test(`one tab stop per destination per entry: ${path}`, async ({ open }) => {
      const { page } = await open(path, { width: widest(), reducedMotion: 'no-preference' });
      const repeated = await page.evaluate(() =>
        [...document.querySelectorAll('.entry')]
          .filter((entry) => {
            const hrefs = [...entry.querySelectorAll('a[href]:not([tabindex="-1"])')].map((a) =>
              a.getAttribute('href'),
            );
            return new Set(hrefs).size !== hrefs.length;
          })
          .map((entry) => entry.id),
      );
      expect(repeated).toEqual([]);
    });
  }
});

/** Every diagram step whose label or sub line lists items with " · ": its page, its button and those lists. */
const SEPARATED = projects.flatMap((project) =>
  project.figures.flatMap(({ diagram }) => {
    const d = diagram ? DIAGRAMS[diagram] : undefined;
    if (d?.kind !== 'flow') return [];
    return d.nodes.flatMap((node) => {
      const lists = [
        { part: '.dg-l', text: node.label },
        { part: '.dg-s', text: node.sub ?? '' },
      ].filter((list) => list.text.includes(' · '));
      return lists.length ? [{ path: `/${project.slug}/`, button: `#dg-${d.id}-${node.id}`, lists }] : [];
    });
  }),
);

/** A " · " list as read aloud: its items in order, a comma after each item whose separator shows. The end-of-line pass
 *  hides a separator that would end a line, and a hidden one may be silent. */
const spoken = (list: string, shown: boolean[]) =>
  new RegExp(
    list
      .split(' · ')
      .map((item) => item.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+'))
      .reduce((read, item, i) => `${read}${shown[i - 1] ? '\\s*,\\s*' : '(?:\\s*,\\s*|\\s+)'}${item}`),
  );

test.describe('separators read as a comma to assistive tech', () => {
  for (const path of new Set(SEPARATED.map((step) => step.path)))
    test(path, async ({ open }) => {
      const { page } = await open(path, { width: widest() });
      for (const { button, lists } of SEPARATED.filter((step) => step.path === path)) {
        const { role, name } = await axNode(page, button);
        expect(role, button).toBe('button');
        expect(name, button).not.toContain('·');
        for (const { part, text } of lists) {
          const shown = await page
            .locator(`${button} ${part} .sep`)
            .evaluateAll((seps) => seps.map((sep) => getComputedStyle(sep).visibility !== 'hidden'));
          expect(shown, `${button}: one separator between each two items`).toHaveLength(text.split(' · ').length - 1);
          expect(name, button).toMatch(spoken(text, shown));
        }
      }
    });
});
