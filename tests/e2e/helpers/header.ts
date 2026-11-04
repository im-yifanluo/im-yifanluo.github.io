// What the sticky header shows: its glass, hairline and name, and how its text contrasts with the glass.
import type { Page } from '@playwright/test';

/** The header's glass (background alpha, backdrop filter), hairline opacity, top and whether its name is shown. */
export const headerState = (page: Page) =>
  page.evaluate(() => {
    const h = document.querySelector('.site-header')!,
      cs = getComputedStyle(h),
      name = getComputedStyle(h.querySelector('.home')!);
    const rgba = (cs.backgroundColor.match(/[\d.]+/g) ?? []).map(Number);
    return {
      alpha: rgba.length === 4 ? rgba[3]! : 1,
      filter: cs.backdropFilter,
      line: Number(getComputedStyle(h.querySelector('.bar')!, '::after').opacity),
      top: Math.round(h.getBoundingClientRect().top),
      name: name.visibility === 'visible' && Number(name.opacity) > 0.99,
    };
  });

/** The lowest WCAG contrast ratio of the header's name and nav links against its background over pure black. */
export const glassContrast = (page: Page) =>
  page.evaluate(() => {
    const luminance = (rgb: number[]) => {
      const [r, g, b] = rgb.map((x) => ((x /= 255) <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4));
      return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
    };
    const rgb = (colour: string) => colour.match(/[\d.]+/g)!.map(Number);
    const h = document.querySelector('.site-header')!,
      bg = rgb(getComputedStyle(h).backgroundColor);
    const under = luminance(bg.slice(0, 3).map((x) => x * (bg[3] ?? 1)));
    const ratios = [...h.querySelectorAll('nav a, .home')].map((a) => {
      const text = luminance(rgb(getComputedStyle(a).color));
      return (Math.max(text, under) + 0.05) / (Math.min(text, under) + 0.05);
    });
    return Math.min(...ratios);
  });
