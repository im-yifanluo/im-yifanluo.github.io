// The viewports under test, shared by playwright.config.ts (its two projects) and the fixtures (the width matrix).
import type { BrowserContextOptions } from '@playwright/test';

/** The width matrix, in px: every page is checked at each of these viewport widths. */
export const WIDTHS = [1440, 1280, 1024, 768, 390, 360, 320];

/** The site's phone layout applies below this width (its `max-width: 719px` media queries). */
export const PHONE_BELOW = 720;
export const isPhone = (width: number) => width < PHONE_BELOW;

/** The widest width of the matrix: the desktop project's own, where checks that need a desktop run. */
export const DESKTOP = WIDTHS[0]!;
/** The widest phone width: the phone project's own, where checks that need a phone run. */
export const PHONE = WIDTHS.find(isPhone)!;

/** The browser context for a viewport width: phones are 844 px tall with touch and 3x pixels, other screens 900 px. */
export function deviceAt(width: number): BrowserContextOptions {
  const phone = isPhone(width);
  return {
    viewport: { width, height: phone ? 844 : 900 },
    deviceScaleFactor: phone ? 3 : 1,
    isMobile: phone,
    hasTouch: phone,
  };
}
