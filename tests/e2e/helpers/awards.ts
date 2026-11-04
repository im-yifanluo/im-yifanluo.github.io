// The homepage's Awards list: its state as a reader finds it, opening it from a script, and its reveal frame by frame.
import type { Page } from '@playwright/test';

/** The Awards list as a reader finds it: open or not, the rows that show, the control's label, the scroll position and
 *  the top of the Awards heading in the viewport. */
export const awardsState = (page: Page) =>
  page.evaluate(() => {
    const more = document.querySelector<HTMLDetailsElement>('#awards .awards-more')!;
    const rows = [...document.querySelectorAll('#awards li')];
    return {
      open: more.open,
      rows: rows.filter((row) => row.checkVisibility()).length,
      all: rows.length,
      label: more.querySelector<HTMLElement>(':scope > summary')!.innerText.trim(),
      y: Math.round(scrollY),
      h2: Math.round(document.getElementById('awards-h')!.getBoundingClientRect().top),
    };
  });

/** Opens the Awards list from a script; resolves two frames after its toggle event (the end-of-line pass runs on it). */
export const openAwards = (page: Page) =>
  page.evaluate(
    () =>
      new Promise<void>((done) => {
        const more = document.querySelector<HTMLDetailsElement>('#awards .awards-more')!;
        const frames = () => requestAnimationFrame(() => requestAnimationFrame(() => done()));
        more.addEventListener('toggle', frames, { once: true });
        more.open = true;
      }),
  );

/**
 * The Awards <details>' height on every frame while `action` runs and for 420 ms after the click it makes, as [ms, px]
 * pairs timed from that click (frames before it have negative times).
 */
export async function framesDuring(page: Page, action: () => Promise<void>): Promise<[number, number][]> {
  const frames = page.evaluate(async () => {
    const more = document.querySelector('#awards .awards-more')!,
      heights: [number, number][] = [],
      start = performance.now();
    let clicked: number | undefined;
    document.addEventListener('click', () => (clicked = performance.now()), { once: true, capture: true });
    while (performance.now() - (clicked ?? start) < 420) {
      await new Promise((frame) => requestAnimationFrame(frame));
      heights.push([performance.now(), Math.round(more.getBoundingClientRect().height)]);
    }
    return heights.map(([t, h]): [number, number] => [Math.round(t - (clicked ?? start)), h]);
  });
  await action();
  return frames;
}

/** How many frames lie strictly between the first and the last height (by more than 2 px): the ones a transition draws. */
export function framesBetween(frames: [number, number][]): number {
  const [from, to] = [frames[0]![1], frames.at(-1)![1]];
  return frames.filter(([, h]) => h > Math.min(from, to) + 2 && h < Math.max(from, to) - 2).length;
}
