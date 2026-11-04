// Media: loops are muted, looping, inline, unloaded and sized; images below the fold are lazy; under reduced motion
// nothing plays or animates. With motion allowed a loop in view plays, AV1 first, and Pause stops every loop for good.
// Phones get each phone cut with its phone caption. Pages and expectations come from the media manifest and the
// projects (helpers/media.ts). A check tied to one layout runs at its widths in the project that has that layout.
import { plain } from '../../src/lib/typography';
import {
  atEachWidth,
  DESKTOP,
  expect,
  measure,
  PAGES,
  PHONE,
  PHONE_BELOW,
  PROJECT_PAGES,
  projects,
  scrollThrough,
  test,
  token,
  type Locator,
  type Page,
} from './fixtures';
import {
  LOOP_FILES,
  LOOP_PAGES,
  PHONE_CAPTIONS,
  PHONE_FIGURES,
  PHONE_HEROES,
  TEXT_FIGURE_PAUSE_PAGES,
} from './helpers/media';

/** How many of the page's loops are playing. */
const playing = (page: Page) =>
  page.locator('video').evaluateAll((videos: HTMLVideoElement[]) => videos.filter((v) => !v.paused).length);

/** Scrolls `target` to the middle of the screen. Resolves once an IntersectionObserver has seen it there: the page's
 *  own observers were created first, so they have been told too and the page has started or stopped its loops. */
const bringIntoView = (target: Locator) =>
  target.evaluate(
    (el) =>
      new Promise<void>((done) => {
        el.scrollIntoView({ block: 'center', behavior: 'instant' });
        new IntersectionObserver((entries, observer) => {
          if (!entries.some((entry) => entry.isIntersecting)) return;
          observer.disconnect();
          done();
        }).observe(el);
      }),
  );

/** Whether a loop is playing and has its current frame (whichever of its sources the browser could decode). */
const loaded = (video: Locator) =>
  video.evaluate((v: HTMLVideoElement) => !v.paused && v.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA);

const MATRIX = [
  'loops: muted loop playsinline preload=none, sized',
  'below-fold images lazy',
  'the LCP hint: at most one image fetchpriority=high, and it is eager; every other image lazy',
  'reduced motion: no loop autoplays',
  'reduced motion: no CSS animations',
] as const;

// every page at each of the project's widths, motion reduced: as loaded, then scrolled through
test.describe(MATRIX.join('; '), () => {
  for (const path of PAGES) {
    test(path, ({ open }) =>
      atEachWidth(open, path, async (page) => {
        const { videos, imgs } = await measure(page);
        const unfit = videos.filter((v) => !(v.muted && v.loop && v.pi && v.preload === 'none' && v.wh && !v.autoplay));
        expect.soft(unfit, MATRIX[0]).toEqual([]);
        // below the fold: more than one and a half screens down
        const fold = page.viewportSize()!.height * 1.5;
        const eager = imgs.filter((img) => img.top > fold && img.loading !== 'lazy');
        expect.soft(eager, MATRIX[1]).toEqual([]);
        // the eager images are exactly the ones with fetchpriority=high, and there is at most one
        const high = imgs.filter((img) => img.fetchpriority === 'high');
        const notLazy = imgs.filter((img) => img.loading !== 'lazy');
        expect.soft(high.length, MATRIX[2]).toBeLessThanOrEqual(1);
        expect.soft(notLazy, MATRIX[2]).toEqual(high);
        await scrollThrough(page);
        expect.soft(await playing(page), MATRIX[3]).toBe(0);
        const animations = await page.evaluate(
          () => document.getAnimations().filter((animation) => animation instanceof CSSAnimation).length,
        );
        expect.soft(animations, MATRIX[4]).toBe(0);
      }),
    );
  }
});

// a link to another site in a homepage row and on the first project page that has one
const EXTERNAL = '.entry .links a[href^="http"], .p-head .links a[href^="http"]';
const withExternal = projects.find((p) => p.links.some((link) => /^https?:/.test(link.url)));
// hover needs a mouse: checked at 1440 px in the desktop project
test.describe('reduced motion: the external arrow fades but does not move', { tag: '@desktop' }, () => {
  for (const path of ['/', ...(withExternal ? [`/${withExternal.slug}/`] : [])]) {
    test(path, async ({ open }) => {
      const { page } = await open(path, { width: DESKTOP, reducedMotion: 'reduce' });
      const link = page.locator(EXTERNAL).first();
      const arrow = () =>
        link.evaluate(async (a) => {
          await Promise.all(a.getAnimations({ subtree: true }).map((transition) => transition.finished));
          const after = getComputedStyle(a, '::after');
          return { transform: after.transform, opacity: Number(after.opacity) };
        });
      expect(await arrow()).toEqual({ transform: 'none', opacity: Number(await token(page, '--arrow-rest')) });
      await link.hover();
      expect(await arrow()).toEqual({ transform: 'none', opacity: 1 });
    });
  }
});

test.describe('a loop in view plays; only loops within 200 px of view play', () => {
  for (const path of LOOP_PAGES) {
    test(path, async ({ open }) => {
      const { page } = await open(path);
      const first = page.locator('video').first();
      await bringIntoView(first);
      await expect.poll(() => loaded(first), { message: 'the loop in view loads and plays' }).toBe(true);
      expect(await playing(page), 'a loop in view plays').toBeGreaterThan(0);
      const playingFar = await page.locator('video').evaluateAll(
        (videos: HTMLVideoElement[]) =>
          videos.filter((v) => {
            const r = v.getBoundingClientRect();
            return !v.paused && (r.bottom <= -200 || r.top >= innerHeight + 200);
          }).length,
      );
      expect(playingFar, 'only loops within 200 px of view play').toBe(0);
    });
  }
});

test.describe('Pause stops every loop and persists', () => {
  for (const path of LOOP_PAGES) {
    test(path, async ({ open }) => {
      const { page } = await open(path);
      const control = page.locator('.motion').first();
      const first = page.locator('video').first();
      await bringIntoView(first);
      await expect.poll(() => loaded(first), { message: 'a loop plays before Pause' }).toBe(true);
      await control.click();
      await expect.poll(() => playing(page)).toBe(0);
      await expect(control).toHaveText('Play videos');
      await page.reload({ waitUntil: 'networkidle' });
      await expect(control).toHaveText('Play videos');
      await bringIntoView(first);
      expect(await playing(page)).toBe(0);
    });
  }
});

test.describe('loops offer AV1 WebM before H.264', () => {
  for (const path of LOOP_PAGES) {
    test(path, async ({ open }) => {
      const { page } = await open(path);
      const videos = await page.locator('video').all();
      expect(videos.length).toBeGreaterThan(0);
      for (const video of videos) {
        await bringIntoView(video);
        await expect(video.locator('source')).toHaveCount(2);
        const sources = await video
          .locator('source')
          .evaluateAll((list: HTMLSourceElement[]) =>
            list.map((s) => ({ type: s.type, file: new URL(s.src).pathname })),
          );
        expect(sources).toEqual([
          { type: expect.stringMatching(/^video\/webm; *codecs="?av01\./), file: expect.stringMatching(/\.webm$/) },
          { type: 'video/mp4', file: expect.stringMatching(/\.mp4$/) },
        ]);
        for (const { file } of sources) expect(LOOP_FILES).toContain(file);
        // wait for whichever source the browser can decode
        await expect.poll(() => loaded(video), { message: `${sources[0]!.file} loads` }).toBe(true);
      }
    });
  }
});

test.describe('the Pause control is on the first loop’s caption (none without loops)', () => {
  for (const path of PROJECT_PAGES) {
    test(path, async ({ open }) => {
      const { page } = await open(path);
      const state = await page.evaluate(() => {
        const controls = [...document.querySelectorAll<HTMLButtonElement>('.motion')];
        const firstLoop = document.querySelector('main video')?.closest('figure');
        return {
          loops: document.querySelectorAll('main video').length > 0,
          controls: controls.length,
          onFirstLoop: !!controls[0] && controls[0].closest('figure') === firstLoop,
          shown: !!controls[0] && !controls[0].hidden,
        };
      });
      const loops = LOOP_PAGES.includes(path);
      expect(state).toEqual(
        loops
          ? { loops, controls: 1, onFirstLoop: true, shown: true }
          : { loops, controls: 0, onFirstLoop: false, shown: false },
      );
    });
  }
});

/** The widths where the page's layout changes: the first width each width condition of its @media rules holds or stops
 *  holding at. Browsers write `max-width: 719px` as `width <= 719px`. */
const breakpoints = (page: Page) =>
  page.evaluate(() => {
    const widths = new Set<number>();
    const walk = (rules: CSSRuleList) => {
      for (const rule of rules) {
        if (rule instanceof CSSMediaRule)
          for (const [, op, n] of rule.conditionText.matchAll(/(min-width:|max-width:|width *[<>]=?) *(\d+)px/g))
            widths.add(/^(min|width *>=|width *<$)/.test(op!) ? Number(n) : Number(n) + 1);
        if (rule instanceof CSSGroupingRule || rule instanceof CSSStyleRule) walk(rule.cssRules);
      }
    };
    for (const sheet of document.styleSheets) walk(sheet.cssRules);
    return [...widths];
  });

// a desktop layout: checked from 1440 px down in the desktop project
test.describe('the Pause control ends at its text-width figure’s right edge', { tag: '@desktop' }, () => {
  for (const path of TEXT_FIGURE_PAUSE_PAGES) {
    test(path, async ({ open }) => {
      const wide = await open(path, { width: DESKTOP });
      // the widest screen and each breakpoint down to the phone layout
      const layouts = (await breakpoints(wide.page)).filter((w) => w >= PHONE_BELOW && w < DESKTOP);
      expect(layouts, 'the breakpoints read from the page').toContain(PHONE_BELOW);
      for (const width of [DESKTOP, ...layouts.sort((a, b) => b - a)]) {
        const { page } = width === DESKTOP ? wide : await open(path, { width });
        const [control, figure] = await page
          .locator('figure > .motion')
          .evaluate((button) =>
            [button, button.parentElement!.querySelector('.fig-media')!].map((el) =>
              Math.round(el.getBoundingClientRect().right),
            ),
          );
        expect(Math.abs(control! - figure!), `the control's right edge at ${width}px`).toBeLessThanOrEqual(1);
      }
    });
  }
});

// below 720 px a hero or figure with a phone cut shows it, with its phone caption: checked at 390 px in the phone project
test.describe('phone cuts', { tag: '@phone' }, () => {
  test.describe('phone cuts carry their phone captions', () => {
    for (const { page: path, count } of PHONE_CAPTIONS) {
      test(path, async ({ open }) => {
        const { page } = await open(path, { width: PHONE });
        const captions = await page.locator('figcaption:has(.cap-p)').evaluateAll((list) =>
          list.map((caption) => ({
            wide: getComputedStyle(caption.querySelector('.cap-w')!).display,
            phone: getComputedStyle(caption.querySelector('.cap-p')!).display,
          })),
        );
        expect(captions).toHaveLength(count);
        for (const caption of captions)
          expect(caption).toEqual({ wide: 'none', phone: expect.not.stringMatching(/^none$/) });
      });
    }
  });

  test.describe('a hero’s phone cut keeps its own ratio, full column width', () => {
    for (const hero of PHONE_HEROES) {
      test(hero.page, async ({ open }) => {
        const { page } = await open(hero.page, { width: PHONE });
        const box = await page.locator('.hero').evaluate((el) => {
          const r = el.getBoundingClientRect(),
            main = getComputedStyle(el.closest('main')!);
          return {
            w: Math.round(r.width),
            h: Math.round(r.height),
            column: Math.round(parseFloat(main.width) - parseFloat(main.paddingLeft) - parseFloat(main.paddingRight)),
            file: new URL(el.querySelector('img')!.currentSrc).pathname,
          };
        });
        expect(box.w, 'the column width').toBe(box.column);
        expect(Math.abs(box.w / box.h - hero.ratio), 'the phone cut’s ratio').toBeLessThan(0.02);
        expect(hero.files).toContain(box.file);
      });
    }
  });

  const words = (text: string) => text.replace(/\s+/g, ' ').trim();
  test.describe('figures with a phone cut: the phone screen and its phone caption', () => {
    for (const figure of PHONE_FIGURES) {
      test(`${figure.page} ${figure.media}`, async ({ open }) => {
        const { page } = await open(figure.page, { width: PHONE });
        const box = page.locator('figure', { has: page.locator(`source[srcset*="${figure.files[0]}"]`) });
        await box.scrollIntoViewIfNeeded();
        const img = box.locator('img');
        await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.currentSrc !== '')).toBe(true);
        expect(figure.files).toContain(await img.evaluate((el: HTMLImageElement) => new URL(el.currentSrc).pathname));
        expect(words(await box.locator('figcaption').innerText())).toBe(words(plain(figure.caption)));
      });
    }
  });
});
