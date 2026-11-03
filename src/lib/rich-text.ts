// Inline copy markup → HTML: `code` spans and [label](href) links; everything else is escaped text. Then the typography
// pass (lib/typography.ts typoHtml). Also the meta line ("role · org · dates"), which is built from such strings.
import { plain, SEP, typoHtml } from './typography';

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
/** Escape text for HTML. The typography pass turns `&#39;` back into an apostrophe before it curls it. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ESC[ch]!);
}

/** Text with `code` spans → HTML. */
function inline(src: string): string {
  let out = '',
    last = 0;
  for (const m of src.matchAll(/`([^`]+)`/g)) {
    out += `${escapeHtml(src.slice(last, m.index))}<code>${escapeHtml(m[1]!)}</code>`;
    last = m.index! + m[0].length;
  }
  return out + escapeHtml(src.slice(last));
}

const attr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** One string of copy → HTML: `code`, [label](href) links, then the typography pass. */
export function rich(src: string): string {
  const out: string[] = [];
  let last = 0;
  for (const m of src.matchAll(/\[([^\]]+)\]\(([^)\s]+)\)/g)) {
    out.push(inline(src.slice(last, m.index)));
    out.push(`<a href="${attr(m[2]!)}">${inline(m[1]!)}</a>`);
    last = m.index! + m[0].length;
  }
  out.push(inline(src.slice(last)));
  return typoHtml(out.join(''));
}

/**
 * A meta line ("role · org · dates"): split at " · ", each short segment kept on one line, so the line breaks only
 * between items. `extra` = already-rendered HTML segments appended (e.g. <time> ranges).
 */
export function segs(src: string, extra: string[] = []): string {
  const parts: string[] = [];
  let cur = '';
  for (let i = 0; i < src.length; i++) {
    if (src.startsWith(' · ', i)) {
      parts.push(cur);
      cur = '';
      i += 2;
      continue;
    }
    cur += src[i];
  }
  if (cur) parts.push(cur);
  // every item is a .seg (a phone layout may stack them one per line); a short one is also kept whole (.nw), and one of
  // 41–44 characters from 720 px up only (.nw-w: "FORWARD Data Lab, UIUC (Prof. Kevin Chang)" would otherwise break
  // inside on desktop; kept whole on a 320 px phone it would overflow the column)
  const html = parts.map((p) => {
    const h = rich(p),
      n = plain(p).length;
    return `<span class="${n <= 40 ? 'nw seg' : n <= 44 ? 'nw-w seg' : 'seg'}">${h}</span>`;
  });
  return [...html, ...extra.map((e) => `<span class="nw seg">${e}</span>`)].join(SEP);
}
