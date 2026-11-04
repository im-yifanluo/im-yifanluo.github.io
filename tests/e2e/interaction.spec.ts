// Pointer hover at 1440 px with motion allowed: every link answers it, and a homepage project row answers as one link.
// Hover needs a mouse, so every test here is tagged @desktop.
import { expect, PROJECT_PAGES, settle, test, token, type Locator, type OpenOptions, type Page } from './fixtures';

const MOTION: OpenOptions = { width: 1440, reducedMotion: 'no-preference' };

test.describe('hover changes every link', { tag: '@desktop' }, () => {
  for (const path of ['/', ...PROJECT_PAGES]) {
    test(path, async ({ open }) => {
      const { page } = await open(path, MOTION);
      await settle(page);
      const look = (link: Locator) =>
        link.evaluate((a) => {
          const cs = getComputedStyle(a);
          return `${cs.textDecorationLine} ${cs.textDecorationColor} ${cs.color}`;
        });
      const unchanged: string[] = [];
      let tested = 0;
      // in document order from the top, as a reader meets them; a link hidden at that moment is not hoverable
      for (const link of await page.locator('a[href]:not([tabindex="-1"]):not(.skip)').all()) {
        if (!(await link.isVisible())) continue;
        await page.mouse.move(0, 0);
        await link.evaluate((a) => a.scrollIntoView({ block: 'center', behavior: 'instant' }));
        await settle(page);
        const rest = await look(link);
        await link.hover();
        await settle(page);
        tested++;
        if ((await look(link)) === rest) unchanged.push(`${await link.getAttribute('href')}: ${rest}`);
      }
      expect(tested, 'links hovered').toBeGreaterThan(0);
      expect(unchanged, `of ${tested} links, those that look the same under the pointer`).toEqual([]);
    });
  }
});

/** The homepage's second project row, centred in the view with the pointer away from it. */
async function centredRow(page: Page): Promise<Locator> {
  const entry = page.locator('.entry').nth(1);
  await entry.evaluate((e) => e.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.mouse.move(0, 0);
  await settle(page);
  return entry;
}

test.describe('a homepage project row', { tag: '@desktop' }, () => {
  test('row hover: title → --title-hover + underline, frame darkens, clip ≤ 3 % zoom, frame fixed, row is the link', async ({
    open,
  }) => {
    const { page } = await open('/', MOTION);
    const entry = await centredRow(page);
    const state = () =>
      entry.evaluate((e) => {
        const a = e.querySelector('.title a')!,
          tile = e.querySelector('.tile')!,
          media = tile.querySelector('img, video, svg')!,
          r = tile.getBoundingClientRect();
        // the token as a colour: --title-hover resolved on an element inside the row
        const probe = document.createElement('i');
        probe.style.color = 'var(--title-hover)';
        e.append(probe);
        const titleHover = getComputedStyle(probe).color;
        probe.remove();
        return {
          colour: getComputedStyle(a).color,
          underline: getComputedStyle(a).textDecorationColor,
          frame: getComputedStyle(tile, '::after').boxShadow,
          zoom: new DOMMatrix(getComputedStyle(media).transform).a,
          box: [Math.round(r.left), Math.round(r.top), Math.round(r.width)],
          hit:
            document
              .elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
              ?.closest('a')
              ?.getAttribute('href') ?? null,
          titleHover,
        };
      });
    const rest = await state();
    const tile = (await entry.locator('.tile').boundingBox())!;
    await page.mouse.move(tile.x + tile.width / 2, tile.y + tile.height / 2, { steps: 4 });
    await settle(page);
    const hover = await state();
    const zoom = Number(await token(page, '--zoom'));
    expect.soft(hover.colour, 'the title takes --title-hover').toBe(hover.titleHover);
    expect.soft(hover.underline, 'the title is underlined').not.toBe('rgba(0, 0, 0, 0)');
    expect.soft(hover.frame, "the frame's hairline darkens").not.toBe(rest.frame);
    expect.soft(hover.zoom, 'the clip zooms in').toBeGreaterThan(1);
    expect.soft(hover.zoom, 'by at most 3 %').toBeLessThanOrEqual(1.03);
    expect.soft(hover.zoom, 'by --zoom').toBeCloseTo(zoom, 3);
    expect.soft(hover.box, 'the frame stays put').toEqual(rest.box);
    expect.soft(hover.hit, 'the tile is the row’s link').toBe(await entry.locator('.title a').getAttribute('href'));
  });

  test('a click on the row text opens the project', async ({ open }) => {
    const { page } = await open('/', MOTION);
    const entry = await centredRow(page);
    const href = (await entry.locator('.title a').getAttribute('href'))!;
    // a point on the description's first line: the row's own text
    const at = await entry.locator('.desc').evaluate((e) => {
      const r = e.getBoundingClientRect();
      return { x: r.left + 10, y: r.top + 8 };
    });
    const hit = await page.evaluate(
      ({ x, y }) => document.elementFromPoint(x, y)?.closest('a')?.getAttribute('href') ?? null,
      at,
    );
    expect(hit, 'the link under the description').toBe(href);
    await page.mouse.click(at.x, at.y);
    await expect(page).toHaveURL(new URL(href, page.url()).href);
  });
});
