// Typography pass for every rendered string. Runs on HTML, touching text
// nodes only (never tags, attributes or <code>): curly quotes, "…", "Sept" → "Sep", spaced en dashes and " · "
// separators glued to the item before them (so no line starts with "·" or "–"), NBSP between month and year, between
// a number and its unit, in "ROS 2" and "CS 498", and "15-person"-style compounds kept on one line.
import { TYPOGRAPHY } from '@/site.config';

const MONTH = '(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|Summer|Fall|Spring|Winter)';
/** The no-break space (U+00A0) the typography pass inserts. */
export const NB = '\u00a0';

export function typoText(s: string): string {
  return s
    .replace(/&#39;|&#x27;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\bSept\b/g, 'Sep')
    .replace(/\.\.\./g, '…')
    .replace(/(^|[\s([{—–-])'/g, '$1‘')
    .replace(/'/g, '’')
    .replace(/(^|[\s([{—–‘-])"/g, '$1“')
    .replace(/"/g, '”')
    .replace(/->/g, '→')
    .replace(/ · /g, `${NB}· `)
    .replace(/ – /g, `${NB}– `)
    .replace(new RegExp(`\\b(${MONTH}) (\\d{4})\\b`, 'g'), `$1${NB}$2`)
    .replace(/\b(ROS|CS) (\d{1,3})\b/g, `$1${NB}$2`)
    .replace(/(\d) (kg|g|Hz|ms|s|MB|KB|points|px)\b/g, `$1${NB}$2`)
    .replace(/(\d) (\/) (\d)/g, `$1${NB}$2${NB}$3`)
    .replace(/\b(Prof\.|et) (\p{Lu}|al\.)/gu, `$1${NB}$2`);
}

/** The one separator (glued to the item before it by the NBSP, so a line never starts with it). The dot
 *  is hidden from AT; the span's ::after (styles/global.css) is empty on screen with the alternative text ",", so a screen
 *  reader pauses between items ("Allen key, knob turning") while the page text, copied text
 *  and layout keep only the dot. The NBSP sits inside the span, so a layout that stacks the items (phone project meta)
 *  can drop the whole separator with `display: none` and leave no stray non-breaking space behind. */
export const SEP = `<span class="sep"><span aria-hidden="true">${NB}·</span></span> `;

/** Wrap whole phrases in a no-break span (e.g. an award's name in a short meta line). Text only; no markup in phrases.
 *  `wide`: phrases kept whole from 720 px up only (`.nw-w`); on a phone line a long glued name leaves ragged lines. */
export function glue(html: string, phrases: string[] = [], wide: string[] = []): string {
  const g = phrases.reduce((h, k) => h.split(k).join(`<span class="nw">${k}</span>`), html);
  return wide.reduce((h, k) => h.split(k).join(`<span class="nw-w">${k}</span>`), g);
}

/** A phrase with a phone form: the full phrase from 720 px up, the short one below, as
 *  <abbr title="full">. Only one of the two is displayed, so assistive tech reads one. Runs after `glue`. */
export function shortForms(html: string, forms: Record<string, string> = {}): string {
  return Object.entries(forms).reduce((h, [full, short]) => {
    const glued = `<span class="nw">${full}</span>`;
    const src = h.includes(glued) ? glued : full;
    return h.split(src).join(`<span class="lg">${src}</span><abbr class="sm" title="${full}">${short}</abbr>`);
  }, html);
}

/** Short names a line must not split (site.config.ts TYPOGRAPHY.keep). */
const KEEP = TYPOGRAPHY.keep;
const KEEP_RE = new RegExp(`(${KEEP.map((k) => k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'g');

/** Apply typoText to the text nodes of an HTML fragment (skipping <code>), then keep "15-person" compounds together. */
export function typoHtml(html: string): string {
  let inCode = 0;
  return html
    .split(/(<[^>]+>)/)
    .map((part) => {
      if (part.startsWith('<')) {
        if (/^<code\b/i.test(part)) inCode++;
        else if (/^<\/code>/i.test(part)) inCode = Math.max(0, inCode - 1);
        return part;
      }
      if (inCode || !part) return part;
      return typoText(part)
        .replace(/(\d[\d,.]*\+?-(?:person|page|episode|hour|second))\b/g, '<span class="nw">$1</span>')
        .replace(/(\d[\d,.]*%?–\d[\d,.]*%?)/g, '<span class="nw">$1</span>')
        .replace(KEEP_RE, '<span class="nw">$1</span>')
        // a person's name never splits ("Prof. Kevin / Chang"); short hyphenated compounds never break at the hyphen
        // ("LLM-/curated"): the font has no U+2011, so they are kept whole with .nw (≤ 14 characters)
        .replace(new RegExp(`Prof\\.${NB}\\p{Lu}[\\p{L}’]+ \\p{Lu}[\\p{L}’]+`, 'gu'), '<span class="nw">$&</span>')
        // (also multi-hyphen compounds such as "video-to-3D" or "end-to-end")
        .replace(/(?<![\p{L}\d/.-])\p{L}[\p{L}\d]*(?:-[\p{L}\d]+)+(?![\p{L}\d/-]|\.[\p{L}\d])/gu, (m) => (m.length <= 14 ? `<span class="nw cpd">${m}</span>` : m))
        .replace(new RegExp(`${NB}· `, 'g'), SEP);
    })
    .join('');
}

/** Plain text (for <title>, meta description, alt): typography pass without markup. */
export function plain(src: string): string {
  return typoText(src.replace(/`([^`]+)`/g, '$1').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'));
}
