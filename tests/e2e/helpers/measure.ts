// measure(page): everything the layout, type, media and Awards checks read from a page, in one evaluation. The parts
// run in the page in this order, sharing the toolkit; the type metrics they need (the cap-height offsets, the body size)
// come from the page's own tokens (src/styles/tokens.css). Measuring the Awards tap area scrolls and scrolls back.
// missingGlyphs() reads the characters it found against the site's font.
import type { Page } from '@playwright/test';
import { font } from './data';
import { toolkit } from './measure/toolkit';
import { text, wraps } from './measure/text';
import { edges, rows, spacing } from './measure/layout';
import { awards, content, diagrams } from './measure/content';

export type { Box } from './measure/toolkit';

const PARTS = [text, wraps, edges, spacing, rows, content, diagrams, awards] as const;

/** The parts' results in one object. */
type Results<T> = T extends readonly [infer F extends (k: never) => unknown, ...infer R]
  ? ReturnType<F> & Results<R>
  : unknown;
export type Measurement = Results<typeof PARTS>;

// Each function's source is evaluated in the page, so a part may use only its argument and the page's globals.
const SCRIPT = `(() => {
  const k = (${toolkit.toString()})();
  return Object.assign({}, ${PARTS.map((part) => `(${part.toString()})(k)`).join(', ')});
})()`;

export async function measure(page: Page): Promise<Measurement> {
  return (await page.evaluate(SCRIPT)) as Measurement;
}

/** Each character of measure()'s `chars` (the text, by the family set on it) not drawn from the site's font: set in
 *  another family or not among the font's code points. As "family: character"; whitespace never counts. */
export const missingGlyphs = (chars: Measurement['chars']) =>
  Object.entries(chars).flatMap(([family, text]) =>
    [...new Set(text)]
      .filter((c) => !/\s/.test(c) && !(family === font.family && font.codepoints.has(c.codePointAt(0)!)))
      .map((c) => `${family}: ${c}`),
  );
