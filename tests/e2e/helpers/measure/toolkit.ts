// The in-page helpers every part of measure() shares. Like the parts, toolkit() runs in the page: it uses nothing from
// outside its own body.

export function toolkit() {
  /** Rounded to 0.1 px. */
  const r2 = (v: number) => Math.round(v * 10) / 10;
  const rect = (el: Element) => el.getBoundingClientRect();
  const sx = scrollX,
    sy = scrollY;
  /** An element's border box in page coordinates. */
  const box = (el: Element) => {
    const r = rect(el);
    return {
      l: r2(r.left + sx),
      r: r2(r.right + sx),
      t: r2(r.top + sy),
      b: r2(r.bottom + sy),
      w: r2(r.width),
      h: r2(r.height),
    };
  };
  // checkVisibility(): the rows of a closed <details> keep their boxes (content-visibility: hidden) but never paint
  const visible = (el: Element) => {
    const cs = getComputedStyle(el),
      r = rect(el);
    return cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0 && el.checkVisibility();
  };
  /** The nearest element that is not inline. */
  const blockOf = (el: Element | null) => {
    while (el && getComputedStyle(el).display.startsWith('inline')) el = el.parentElement;
    return el;
  };
  /** The first family of a font-family list, unquoted. */
  const family = (cs: CSSStyleDeclaration) => cs.fontFamily.split(',')[0]!.replace(/"/g, '');
  /** tag.class.class, for reports (an SVG element's className is not a string: its label is its tag). */
  const label = (e: Element) =>
    e.tagName.toLowerCase() +
    (typeof e.className === 'string' && e.className ? '.' + e.className.trim().split(/\s+/).join('.') : '');
  /** The distinct line tops (± 3 px) of an element's text. */
  const linesOf = (el: Element) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return [...range.getClientRects()]
      .map((r) => Math.round(r.top))
      .reduce<number[]>((tops, y) => (tops.some((t) => Math.abs(t - y) <= 3) ? tops : [...tops, y]), []);
  };
  /** The box of the character at `index` of a text node. */
  const charRect = (node: Text, index: number): DOMRect | undefined => {
    const range = document.createRange();
    range.setStart(node, index);
    range.setEnd(node, index + 1);
    return range.getClientRects()[0];
  };
  /** Every text node under `root`, in document order. */
  const textNodes = function* (root: Node, from?: Node) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    if (from) walker.currentNode = from;
    for (let n = walker.nextNode(); n; n = walker.nextNode()) yield n as Text;
  };
  /** A custom property of the root (src/styles/tokens.css). */
  const token = (name: string) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const main = document.querySelector('main');
  return { r2, rect, sx, sy, box, visible, blockOf, family, label, linesOf, charRect, textNodes, token, main };
}

export type Toolkit = ReturnType<typeof toolkit>;
export type Box = ReturnType<Toolkit['box']>;
