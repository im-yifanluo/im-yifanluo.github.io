// The type on every page at every width of the matrix: a few text styles in the one font, at the weights of the type
// tokens, with every character in that font; one h1; how lines break (no "·" or dash at a line's edge, no one-word last
// line in a heading, the measure, no meta line naming an item twice); the copy rules; the words on the homepage's first
// screen. Measured type depends on the machine's fonts, so every test here is tagged @local.
import { readFileSync } from 'node:fs';
import {
  expect,
  font,
  measure,
  PAGES,
  projectWidths,
  scrollThrough,
  test,
  token,
  WIDTHS,
  type Measurement,
  type Page,
} from './fixtures';
import { GENERIC_RULES, loadConfig, scanText } from '../../scripts/privacy-scan.mjs';

const MAX_STYLES = 6;
const MAX_FAMILIES = 1;
/** Characters per line in a body paragraph, checked at the widest width. */
const MAX_MEASURE = 75;
/** Words in the homepage's first screen at the widest width. */
const MAX_FIRST_SCREEN_WORDS = 230;
const WIDEST = Math.max(...WIDTHS);
/** A heading's one-word last line is checked at one width of each kind: wide, mid and phone. */
const ORPHAN_WIDTHS = [1440, 1024, 390];
/** A heading's last line is an orphan when it holds one word of up to nine characters ("prompt.") and the heading has
 *  three words or more. A long compound alone on a balanced last line, or a compound's tail plus a word, is not. */
const ORPHAN = { minWords: 3, maxChars: 9 };

/** The weight tokens (`--w-*` in src/styles/tokens.css): their names, and their values for the test titles. */
const tokens = readFileSync(new URL('../../src/styles/tokens.css', import.meta.url), 'utf8');
const weightDeclarations = [...tokens.matchAll(/(--w-[\w-]+):\s*(\d+)\s*;/g)];
const WEIGHT_TOKENS = [...new Set(weightDeclarations.map((match) => match[1]!))];
const WEIGHTS = [...new Set(weightDeclarations.map((match) => match[2]!))].sort((a, b) => Number(a) - Number(b));

/** Copy rules, each a pattern the page's rendered text must not contain. The text must also pass the privacy scan's
 *  private rules (scripts/privacy-scan.mjs), which keep names off the site. */
const COPY_FAULTS: Record<string, RegExp> = {
  straightQuotes: /['"]/g,
  hyphenRanges: /\b(?:19|20)\d{2}-(?:19|20)?\d{2}\b/g,
  xSpeedups: /\b\d+x\b/g,
  threeDots: /\.\.\./g,
  sept: /\bSept\b/g,
  brandCase: /Github|Linkedin|ArXiv|Pytorch|Tensorflow/g,
};
/** The privacy scan's settings with only its private rules (none where they are not configured), loaded on first use.
 *  Its generic rules run on dist in the build; on text that innerText flattens they misread a year and the next line's
 *  words as a street address. */
let privateScan: ReturnType<typeof loadConfig> | undefined;
function privateRules() {
  if (!privateScan) {
    const config = loadConfig();
    privateScan = { ...config, rules: config.rules.filter((rule) => !GENERIC_RULES.includes(rule)) };
  }
  return privateScan;
}

/** Runs in the page: text in main whose en or em dash starts a line (at its block's content-box left). */
function dashesAtLineStart(): string[] {
  const found: string[] = [];
  const walker = document.createTreeWalker(document.querySelector('main') ?? document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    for (const dash of node.data.matchAll(/[–—]/g)) {
      const range = document.createRange();
      range.setStart(node, dash.index);
      range.setEnd(node, dash.index + 1);
      const box = range.getClientRects()[0];
      if (!box) continue;
      let block = node.parentElement!;
      while (getComputedStyle(block).display.startsWith('inline')) block = block.parentElement!;
      const left = block.getBoundingClientRect().left + parseFloat(getComputedStyle(block).paddingLeft);
      if (box.left - left < 2) found.push(node.data.slice(0, 50));
    }
  }
  return found;
}

/** Runs in the page: the words (with a letter or digit) of the text in the viewport, outside the header and skip link. */
function wordsInView(): number {
  let words = 0;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const range = document.createRange();
    range.selectNodeContents(node);
    const box = range.getBoundingClientRect();
    if (!box.height || box.top >= innerHeight || box.bottom <= 0) continue;
    if (node.parentElement!.closest('.site-header, .skip')) continue;
    words += node.data
      .trim()
      .split(/\s+/)
      .filter((word) => /[\p{L}\p{N}]/u.test(word)).length;
  }
  return words;
}

/** A page at one width: `m` is measure(page) as it loaded; the checks that read the page themselves run after
 *  scrollThrough(), with every image shown loaded and the page back at the top. */
interface State {
  page: Page;
  m: Measurement;
}
/** expect.soft() with a message naming the page, the width and the check, plus any detail worth showing. */
type Soft = (value: unknown, detail?: unknown) => ReturnType<typeof expect.soft>;
interface Check {
  title: string;
  /** Where the check applies; everywhere when left out. */
  where?: (path: string, width: number) => boolean;
  run: (state: State, soft: Soft) => void | Promise<void>;
}

const CHECKS: Check[] = [
  {
    title: `≤ ${MAX_STYLES} text styles`,
    run: ({ m }, soft) => {
      const styles = Object.keys(m.styles);
      soft(styles.length, styles).toBeLessThanOrEqual(MAX_STYLES);
    },
  },
  {
    title: `the font's family only (≤ ${MAX_FAMILIES})`,
    run: ({ m }, soft) => {
      const families = Object.keys(m.families);
      soft(families.length, families).toBeLessThanOrEqual(MAX_FAMILIES);
      soft(families.filter((family) => family !== font.family)).toEqual([]);
    },
  },
  {
    title: `weights from the type tokens only (${WEIGHTS.join('/')})`,
    run: async ({ m, page }, soft) => {
      const allowed = await Promise.all(WEIGHT_TOKENS.map((name) => token(page, name)));
      const others = Object.keys(m.weights).filter((weight) => !allowed.includes(weight));
      soft(others, allowed).toEqual([]);
    },
  },
  {
    title: 'every character in the font that renders it',
    run: ({ m }, soft) => {
      const missing = Object.entries(m.chars).flatMap(([family, text]) =>
        [...new Set(text)]
          .filter((c) => !/\s/.test(c) && !(family === font.family && font.codepoints.has(c.codePointAt(0)!)))
          .map((c) => `${family}: ${c}`),
      );
      soft(missing).toEqual([]);
    },
  },
  { title: 'one h1', run: ({ m }, soft) => soft(m.h1).toBe(1) },
  { title: 'no line starts with “·”', run: ({ m }, soft) => soft(m.seps).toEqual([]) },
  { title: 'no line ends with a visible “·”', run: ({ m }, soft) => soft(m.sepEnds).toEqual([]) },
  {
    title: 'no line starts with a dash',
    run: async ({ page }, soft) => soft(await page.evaluate(dashesAtLineStart)).toEqual([]),
  },
  {
    title: 'no one-word last line in headings',
    where: (_, width) => ORPHAN_WIDTHS.includes(width),
    run: ({ m }, soft) => {
      const orphans = m.headings.filter(
        (h) => h.lastWords === 1 && h.words >= ORPHAN.minWords && h.lastLen <= ORPHAN.maxChars,
      );
      soft(orphans).toEqual([]);
    },
  },
  {
    title: `measure ≤ ${MAX_MEASURE} characters`,
    where: (_, width) => width === WIDEST,
    run: ({ m }, soft) => soft(Math.max(0, ...m.cpl.map((p) => p.cpl)), m.cpl).toBeLessThanOrEqual(MAX_MEASURE),
  },
  { title: 'no meta line repeats an item', run: ({ m }, soft) => soft(m.dupMeta).toEqual([]) },
  {
    title: 'copy: curly quotes, en-dash ranges, “Sep”, brand spellings, no term the private scan rules ban',
    where: (_, width) => width === WIDEST,
    run: async ({ page }, soft) => {
      const text = await page.evaluate(() => document.body.innerText);
      const found: Record<string, string[]> = {};
      for (const [rule, pattern] of Object.entries(COPY_FAULTS)) found[rule] = text.match(pattern) ?? [];
      // each finding as the scan reports it: its rule and the match, masked
      found.privateScan = scanText(text, { file: page.url() }, privateRules()).map((f) => `${f.rule}: ${f.match}`);
      soft(found).toEqual(Object.fromEntries(Object.keys(found).map((rule) => [rule, []])));
    },
  },
  {
    title: `first screen ≤ ${MAX_FIRST_SCREEN_WORDS} words`,
    where: (path, width) => path === '/' && width === WIDEST,
    run: async ({ page }, soft) => soft(await page.evaluate(wordsInView)).toBeLessThanOrEqual(MAX_FIRST_SCREEN_WORDS),
  },
];

test.describe('typography', { tag: '@local' }, () => {
  for (const path of PAGES) {
    test(`${path}: type, line breaks and copy`, async ({ open }) => {
      for (const width of projectWidths()) {
        await test.step(`${width} px`, async () => {
          const { page, context } = await open(path, { width, reducedMotion: 'reduce' });
          const state: State = { page, m: await measure(page) };
          await scrollThrough(page);
          for (const check of CHECKS) {
            if (check.where && !check.where(path, width)) continue;
            const message = `${path} at ${width} px: ${check.title}`;
            const soft: Soft = (value, detail) =>
              expect.soft(value, detail === undefined ? message : `${message} (${JSON.stringify(detail)})`);
            await test.step(check.title, () => check.run(state, soft));
          }
          await context.close();
        });
      }
    });
  }
});
