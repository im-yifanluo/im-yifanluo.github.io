// measure() parts about text: the styles in use and the left edge of every text block, then how the text wraps.
// Each part runs in the page with the shared toolkit and uses nothing else from outside its own body.
import type { Toolkit } from './toolkit';

/** Text styles, sizes, weights, colours, families and characters; the left edges of text blocks in main and footer. */
export function text(k: Toolkit) {
  const styles: Record<string, number> = {},
    sizes: Record<string, 1> = {},
    weights: Record<string, 1> = {},
    colours: Record<string, 1> = {},
    families: Record<string, 1> = {},
    chars: Record<string, string> = {};
  const textLeft: number[] = [],
    footLeft: number[] = [];
  const seen = new Set<Element>();
  // every element with a direct text child, at its block's content-box left
  for (const n of k.textNodes(document.body)) {
    if (!n.data.trim()) continue;
    const el = n.parentElement;
    if (!el || !k.visible(el) || el.closest('script,style,[aria-hidden="true"]:not(.sep),.skip')) continue;
    const cs = getComputedStyle(el),
      fam = k.family(cs);
    const key = `${fam}|${cs.fontSize}|${cs.fontWeight}|${cs.fontStyle}|${cs.textTransform}|${cs.letterSpacing}`;
    styles[key] = (styles[key] ?? 0) + n.data.trim().length;
    sizes[cs.fontSize] = 1;
    weights[cs.fontWeight] = 1;
    colours[cs.color] = 1;
    families[fam] = 1;
    chars[fam.trim()] = (chars[fam.trim()] ?? '') + n.data;
    const blk = k.blockOf(el);
    // not text edges: right-hand columns, the header, controls, the portrait and drawings (a diagram, the order strip)
    if (
      !blk ||
      seen.has(blk) ||
      blk.closest('.date, .site-header, .motion, .pn .next, .portrait, .skip, .dg-plate, .os')
    )
      continue;
    seen.add(blk);
    const bcs = getComputedStyle(blk);
    if (bcs.textAlign === 'right' || bcs.textAlign === 'center') continue;
    if (blk.closest('.site-footer')) {
      if (blk.closest('.copy')) footLeft.push(k.r2(k.rect(blk).left + k.sx));
      continue;
    }
    textLeft.push(k.r2(k.rect(blk).left + k.sx + parseFloat(bcs.paddingLeft) + parseFloat(bcs.borderLeftWidth)));
  }
  return { styles, sizes, weights, colours, families, chars, textLeft, footLeft };
}

/** Separators at a line's start or end, headings' last lines, characters per line, meta repeats, the widest text. */
export function wraps(k: Toolkit) {
  // a "·" that starts a line, and a visible one whose next item starts on a lower line (it ends its line)
  const seps: string[] = [],
    sepEnds: string[] = [];
  for (const s of document.querySelectorAll('.sep')) {
    if (!k.visible(s)) continue;
    const blk = k.blockOf(s)!;
    const left = k.rect(blk).left + parseFloat(getComputedStyle(blk).paddingLeft);
    const r = s.getClientRects()[0];
    if (r && r.left - left < 6) seps.push(s.parentElement!.textContent!.slice(0, 60));
    let next: DOMRect | undefined;
    for (const n of k.textNodes(document.body, s)) {
      const i = n.data.search(/\S/);
      if (s.contains(n) || i < 0) continue;
      next = k.charRect(n, i);
      if (next) break;
    }
    if (r && next && next.top > r.top + r.height / 2)
      sepEnds.push(blk.textContent!.replace(/\s+/g, ' ').trim().slice(0, 70));
  }
  // headings of two or more lines: the words and the characters on the last line
  const headings: { text: string; lines: number; lastWords: number; words: number; lastLen: number }[] = [];
  for (const h of document.querySelectorAll('h1, h2, h3')) {
    if (!k.visible(h)) continue;
    const tops = k.linesOf(h);
    if (tops.length < 2) continue;
    const last = Math.max(...tops),
      onLast = (rc?: DOMRect) => !!rc && Math.abs(Math.round(rc.top) - last) <= 3;
    let lastWords = 0,
      lastLen = 0;
    for (const t of k.textNodes(h)) {
      for (const m of t.data.matchAll(/\S+/g)) if (onLast(k.charRect(t, m.index))) lastWords++;
      for (let i = 0; i < t.data.length; i++) if (/\S/.test(t.data[i]!) && onLast(k.charRect(t, i))) lastLen++;
    }
    const text = h.textContent!.trim();
    headings.push({ text: text.slice(0, 50), lines: tops.length, lastWords, words: text.split(/\s+/).length, lastLen });
  }
  // characters per line in body-size paragraphs of two or more lines (a row that only holds a date and a paragraph is a
  // container: its size is inherited, its text is not body)
  const cpl: { cpl: number; lines: number }[] = [];
  for (const p of document.querySelectorAll('main p, main li')) {
    if (!k.visible(p) || getComputedStyle(p).fontSize !== k.token('--fs-body')) continue;
    if (p.querySelector(':scope > p') || p.closest('.dg-plate')) continue;
    const lines = k.linesOf(p).length;
    if (lines >= 2) cpl.push({ cpl: Math.round(p.textContent!.trim().length / lines), lines });
  }
  // meta lines that name an item twice (e.g. a date range rendered twice)
  const dupMeta = [...document.querySelectorAll('.meta')]
    .filter(k.visible)
    .map((e) =>
      e
        .textContent!.split('·')
        .map((x) => x.replace(/\s+/g, ' ').trim())
        .filter(Boolean),
    )
    .filter((items) => new Set(items).size !== items.length)
    .map((items) => items.join(' · '));
  // the widest text block in main (a project page holds its text to a measure; lists and drawings are left out)
  const blocks = [...document.querySelectorAll('main :is(p, li, h1, h2, h3, figcaption)')].filter(
    (e) => k.visible(e) && !e.closest('.dated, .projects, .sec-head, .dg-plate, .os'),
  );
  const textMaxW = Math.max(0, ...blocks.map((e) => k.r2(k.rect(e).width)));
  return { seps, sepEnds, headings, cpl, dupMeta, textMaxW };
}
