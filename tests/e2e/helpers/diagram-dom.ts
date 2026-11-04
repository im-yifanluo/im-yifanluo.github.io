// What the diagram checks read from a page. Every function here runs in the page (page.evaluate), so it uses only its
// argument and the page's globals.

/** Focuses the heading of the section holding the diagrams, so that the next Tab goes to what follows it. */
export function focusSectionHeading() {
  const section = document.querySelector('.dg-node')!.closest('section')!;
  const heading = document.getElementById(section.getAttribute('aria-labelledby')!)!;
  heading.tabIndex = -1;
  heading.focus();
  heading.removeAttribute('tabindex');
}

/** The focused element's id, and whether its node's detail is in the caption (focusStop() checks its ring). */
export function focusState() {
  const focused = document.activeElement as HTMLElement;
  const item = focused.closest<HTMLElement>('.dg-item');
  const detail = item && focused.closest('.dg')!.querySelector(`.dg-x[data-for="${item.dataset.id}"]`);
  return {
    id: focused.id,
    detail: !!detail && getComputedStyle(detail).visibility === 'visible',
  };
}

/** No node pinned, and at most the focused one on. */
export const unpinned = () =>
  !document.querySelector('.dg-node[aria-pressed="true"]') && document.querySelectorAll('.dg-node.is-on').length <= 1;

/** Whether focus is on an element of the page outside the figure `id`. */
export function focusOutside(id: string) {
  const focused = document.activeElement;
  return !!focused && focused !== document.body && !focused.closest(`#${id}`);
}

/** Starts adding up every layout shift from now on (input or not). */
export function watchShifts() {
  const total = window as unknown as { e2eShift: number };
  total.e2eShift = 0;
  new PerformanceObserver((list) => {
    for (const shift of list.getEntries()) total.e2eShift += (shift as unknown as { value: number }).value;
  }).observe({ type: 'layout-shift' });
}

/** Nodes on, and the layout shift since watchShifts(), once two frames have passed. */
export async function atRest() {
  await new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done)));
  return {
    on: document.querySelectorAll('.dg .is-on').length,
    shift: (window as unknown as { e2eShift: number }).e2eShift,
  };
}

/** The place and size of every diagram, its caption and boxes, and of what follows the figures, in page coordinates. */
export const layout = () =>
  [...document.querySelectorAll('.dg-fig, .dg-fig figcaption, .dg-node, #bw-h, main > :last-child')]
    .map((element) => {
      const r = element.getBoundingClientRect();
      return [r.left, r.top + scrollY, r.width, r.height].map(Math.round).join(',');
    })
    .join(';');

/** The node `id`: whether it is on, whether its detail is shown, and whether the caption's text is hidden. */
export function hoverState(id: string) {
  const node = document.getElementById(id)!;
  const fig = node.closest('.dg')!;
  const detail = fig.querySelector(`.dg-x[data-for="${node.parentElement!.dataset.id}"]`)!;
  return {
    on: node.classList.contains('is-on'),
    detail: getComputedStyle(detail).visibility === 'visible',
    rest: getComputedStyle(fig.querySelector('.dg-c')!).visibility,
  };
}

/** A drawn figure's cue: a pointer on every box, the hint shown (and the pointer's hint), the caption cell's height. */
export function cue(fig: Element) {
  const hint = fig.querySelector<HTMLElement>('.dg-hint');
  const shown =
    !!hint && getComputedStyle(hint).display !== 'none' && hint.checkVisibility({ visibilityProperty: true });
  return {
    cursor: [...fig.querySelectorAll('.dg-node')].every((node) => getComputedStyle(node).cursor === 'pointer'),
    hint: shown ? hint.innerText.trim() : '',
    hoverHint: fig.querySelector('.dg-hint .hv')?.textContent?.trim() ?? '',
    caption: Math.round(fig.querySelector('.dg-cap')!.getBoundingClientRect().height),
  };
}

/** Diagram `id`: its edge labels, the label centres (from the plate's top) of each gap, and each drop's end from the
 *  centre of its target box, in px. */
export function edgeGeometry({ id, gaps, drops }: { id: string; gaps: number[][]; drops: number[] }) {
  const fig = document.getElementById(`dg-${id}`)!;
  const plate = fig.querySelector('.dg-plate')!.getBoundingClientRect();
  const labelY = (k: number) => {
    const r = fig.querySelector(`.dg-el[data-k="${k}"]`)!.getBoundingClientRect();
    return Math.round(r.top + r.height / 2 - plate.top);
  };
  const dropEnd = (k: number) => {
    const edge = fig.querySelector<SVGGElement>(`.dg-e[data-k="${k}"]`)!;
    const end = Number(/L([\d.]+) [\d.]+$/.exec(edge.querySelector('path')!.getAttribute('d') ?? '')?.[1]);
    const box = fig.querySelector(`.dg-item[data-id="${edge.dataset.to}"] > .dg-node`)!.getBoundingClientRect();
    return Math.round(end - (box.left + box.width / 2 - plate.left));
  };
  return {
    labels: fig.querySelectorAll('.dg-el').length,
    gaps: gaps.map((ks) => ks.map(labelY)),
    drops: drops.map(dropEnd),
  };
}

/** Diagram `id`: the heights of the boxes in each row. */
export const rowHeights = ({ id, rows }: { id: string; rows: string[][] }) =>
  rows.map((row) =>
    row.map((node) =>
      Math.round(
        document.querySelector(`#dg-${id} .dg-item[data-id="${node}"] > .dg-node`)!.getBoundingClientRect().height,
      ),
    ),
  );

/** Diagram `id`: per frame, its top, the tops of the boxes in its header's row, and the tops of their labels. */
export function frameTops({
  id,
  frames,
}: {
  id: string;
  frames: { frame: string; row: { id: string; header: boolean }[] }[];
}) {
  const top = (selector: string) =>
    Math.round(document.querySelector(`#dg-${id} ${selector}`)!.getBoundingClientRect().top);
  return frames.map(({ frame, row }) => ({
    frame,
    top: top(`.dg-frame[data-group="${frame}"]`),
    boxes: row.filter(({ header }) => !header).map((node) => top(`.dg-item[data-id="${node.id}"] > .dg-node`)),
    labels: row.map((node) => top(`.dg-item[data-id="${node.id}"] .dg-l`)),
  }));
}

/** The list step of node `id`: whether it is open, and its detail's height. */
export function stepState(id: string) {
  const item = document.getElementById(id)!.closest('.dg-item')!;
  return {
    open: item.classList.contains('is-open'),
    height: Math.round(item.querySelector('.dg-d')!.getBoundingClientRect().height),
  };
}

/** Opens each list step of every flow diagram alone: the steps that reach past the plate, open under 10 px tall, or make
 *  the page scroll sideways. Leaves every step closed. */
export function stepsOutside(): string[] {
  const bad: string[] = [];
  for (const fig of document.querySelectorAll('.dg')) {
    const items = [...fig.querySelectorAll<HTMLElement>('.dg-item')];
    const plate = fig.querySelector('.dg-plate')!;
    items.forEach((item, k) => {
      items.forEach((other, j) => other.classList.toggle('is-open', j === k));
      const right = plate.getBoundingClientRect().right;
      const past = [...item.querySelectorAll('*')].some((e) => {
        const r = e.getBoundingClientRect();
        return r.width > 0 && r.right > right + 0.5;
      });
      const short = item.querySelector('.dg-d')!.getBoundingClientRect().height < 10;
      if (past || short || document.documentElement.scrollWidth > innerWidth) bad.push(`${fig.id}:${item.dataset.id}`);
    });
    items.forEach((item) => item.classList.remove('is-open'));
  }
  return bad;
}

/** With JS off: the sideways scroll, and per figure whether it is the list with every detail and "Into: …" line shown,
 *  the caption shown, no edges, and every table drawn. */
export function withoutScripts() {
  const shown = (e: Element) => {
    const style = getComputedStyle(e);
    return style.display !== 'none' && style.clipPath === 'none' && e.getBoundingClientRect().height > 10;
  };
  return {
    scroll: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    figs: [...document.querySelectorAll('.dg-fig')].map((fig) => {
      const grid = fig.querySelector('.dg-grid');
      const caption = fig.querySelector('.dg-c') ?? fig.querySelector('figcaption')!;
      return {
        id: fig.id,
        list: !grid || getComputedStyle(grid).display !== 'grid',
        details: [...fig.querySelectorAll('.dg-d')].every(shown),
        rel: [...fig.querySelectorAll('.dg-rel')].every(shown),
        cap: getComputedStyle(caption).visibility === 'visible',
        edges: [...fig.querySelectorAll('.dg-edges, .dg-el')].every((e) => getComputedStyle(e).display === 'none'),
        table: [...fig.querySelectorAll('table')].every((table) => table.getBoundingClientRect().height > 50),
      };
    }),
  };
}

/** Each figure's id and its caption's rendered text (a flow diagram's caption text, without the details). */
export const captionTexts = (figs: Element[]) =>
  figs.map((fig) => ({
    id: fig.id,
    text: (fig.querySelector<HTMLElement>('.dg-c') ?? fig.querySelector<HTMLElement>('figcaption')!).innerText,
  }));
