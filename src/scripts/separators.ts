// A "·" separator never ends a line: one whose next item starts on a lower line is hidden. Visibility only, so no
// layout changes; without JS the dots simply stay. Runs once the web font is ready, again on resize, and again when a
// <details> opens (its rows are laid out only then).

/** The rect of the first non-space character after `separator` in document order, or null. */
function nextCharRect(separator: Element): DOMRect | null {
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  walker.currentNode = separator;
  let node: Node | null;
  while ((node = walker.nextNode())) {
    if (separator.contains(node)) continue;
    const text = node as Text;
    const k = text.data.search(/\S/);
    if (k < 0) continue;
    const range = document.createRange();
    range.setStart(text, k);
    range.setEnd(text, k + 1);
    const rect = range.getClientRects()[0];
    if (rect) return rect;
  }
  return null;
}

function hideLineEnds(): void {
  const separators = [...document.querySelectorAll<HTMLElement>('.sep')];
  for (const s of separators) s.style.visibility = '';
  for (const s of separators) {
    const own = s.getBoundingClientRect();
    if (!own.height) continue;
    const next = nextCharRect(s);
    if (next && next.top > own.top + own.height / 2) s.style.visibility = 'hidden';
  }
}

export function initSeparators(): void {
  let frame = 0;
  document.fonts.ready.then(hideLineEnds);
  addEventListener('resize', () => {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(hideLineEnds);
  });
  document.addEventListener(
    'toggle',
    (e) => {
      if ((e.target as Element).matches?.('details')) hideLineEnds();
    },
    true,
  );
}
