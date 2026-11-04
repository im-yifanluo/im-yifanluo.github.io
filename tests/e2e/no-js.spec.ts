// With JavaScript off the site still works: the posters render (lazy images load at once when scripting is off), and
// the Pause control, which only a script can work, stays hidden.
import { CONTENT_PAGES, expect, PAGES, test } from './fixtures';

const POSTERS = '.tile img, .hero img, .tile > svg, .hero svg';

test.describe('works with JS off (posters render, no dead controls)', () => {
  for (const path of CONTENT_PAGES) {
    test(`${path}: every poster renders`, async ({ open }) => {
      const { page } = await open(path, { javaScriptEnabled: false, waitUntil: 'load' });
      await expect(page.locator(POSTERS)).not.toHaveCount(0);
      const loaded = () =>
        page
          .locator(POSTERS)
          .evaluateAll((posters) =>
            posters.every((poster) => !(poster instanceof HTMLImageElement) || poster.naturalWidth > 0),
          );
      await expect.poll(loaded, { message: 'every poster image has loaded' }).toBe(true);
    });
  }

  for (const path of PAGES) {
    test(`${path}: no Pause control`, async ({ open }) => {
      const { page } = await open(path, { javaScriptEnabled: false, waitUntil: 'load' });
      await expect(page.locator('.motion:visible')).toHaveCount(0);
    });
  }
});
