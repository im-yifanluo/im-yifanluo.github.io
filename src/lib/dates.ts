// One date format per list type: month lists use "Mon YYYY", "Mon – Mon YYYY" and
// "Mon YYYY – present" ("Sep", never "Sept"); year lists use "YYYY". Dates render inside <time> elements.
import { NB } from './typography';

const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function parts(ym: string) {
  const m = M[Number(ym.slice(5, 7)) - 1];
  if (m === undefined) throw new Error(`month "${ym}": expected YYYY-MM`);
  return { y: ym.slice(0, 4), m };
}

/** "2026-10" → "Oct 2026" (plain text, NBSP inside). */
export function month(ym: string): string {
  const { y, m } = parts(ym);
  return `${m}${NB}${y}`;
}

const t = (dt: string, text: string) => `<time datetime="${dt}">${text}</time>`;

/** "2026-10" → <time datetime="2026-10">Oct 2026</time> */
export function monthHtml(ym: string): string {
  return t(ym, month(ym));
}

/** A month range as HTML: Sep 2025 – present · Apr – Jul 2026 · Dec 2025 – Aug 2026. */
export function rangeHtml(start: string, end: string): string {
  if (end === 'present') return `${t(start, month(start))}${NB}– present`;
  const s = parts(start),
    e = parts(end);
  if (start === end) return t(start, month(start));
  if (s.y === e.y) return `${t(start, s.m)}${NB}– ${t(end, month(end))}`;
  return `${t(start, month(start))}${NB}– ${t(end, month(end))}`;
}

/** A dated list's date column (News, More projects, Awards), in the forms content.config.ts allows: "YYYY-MM" →
 *  Mon YYYY; "YYYY"; "YYYY–YY" (a span of years, each year a <time>). */
export function dateHtml(d: string): string {
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(d)) return monthHtml(d);
  if (/^\d{4}$/.test(d)) return `<time datetime="${d}">${d}</time>`;
  const span = /^(\d{4})–(\d{2})$/.exec(d);
  if (span)
    return `<time datetime="${span[1]}">${span[1]}</time>–<time datetime="${span[1].slice(0, 2)}${span[2]}">${span[2]}</time>`;
  throw new Error(`date "${d}": expected YYYY-MM, YYYY or YYYY–YY`);
}
