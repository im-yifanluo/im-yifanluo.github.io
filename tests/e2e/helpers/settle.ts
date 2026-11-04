// Waiting on the page's own state instead of on the clock: its intersection observers (the header's glass, its name,
// the nav's current section) and its CSS transitions.
import type { Locator, Page } from '@playwright/test';

/**
 * Resolves once the page's intersection observers have seen the current scroll position and every transition running
 * now has finished. A new observer's first callback comes with the delivery after the next layout, the same one that
 * brings the page's observers their entries; one more frame lets that delivery end.
 */
export function settle(page: Page): Promise<void> {
  return page.evaluate(async () => {
    const frame = () => new Promise((done) => requestAnimationFrame(done));
    await new Promise<void>((done) => {
      const observer = new IntersectionObserver(() => {
        observer.disconnect();
        done();
      });
      observer.observe(document.documentElement);
    });
    await frame();
    // getAnimations() applies pending style changes first, so a transition that a hover or an attribute just started
    // is among them; a transition replaced midway rejects `finished`, and its successor is picked up on the next pass
    const running = () =>
      document
        .getAnimations()
        .filter((a) => a.playState === 'running' && a.effect?.getComputedTiming().endTime !== Infinity);
    for (let now = running(); now.length > 0; now = running())
      await Promise.all(now.map((a) => a.finished.catch(() => undefined)));
  });
}

/** Scrolls the window to `top` at once and waits for the page to settle there. */
export async function scrollToY(page: Page, top: number): Promise<void> {
  await page.evaluate((top) => scrollTo({ top, behavior: 'instant' }), top);
  await settle(page);
}

type ScrollFlag = { e2eScrollEnded?: boolean };

/**
 * Clicks the middle of `target`, which must be in view, and waits until the scroll it starts (smooth, with motion
 * allowed) has ended and the page settled. A locator's click() would first scroll a sticky element "into view", which
 * moves the page and ends a scroll of its own.
 */
export async function clickAndScroll(page: Page, target: Locator): Promise<void> {
  const box = await target.boundingBox();
  if (!box) throw new Error(`${target} is not shown`);
  await page.evaluate(() => {
    const flag = window as unknown as ScrollFlag;
    flag.e2eScrollEnded = false;
    addEventListener('scrollend', () => (flag.e2eScrollEnded = true), { once: true });
  });
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await page.waitForFunction(() => (window as unknown as ScrollFlag).e2eScrollEnded === true);
  await settle(page);
}
