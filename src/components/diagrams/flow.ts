// Flow diagrams in the browser (Flow.astro): draws the edges from the boxes' rects and handles the active state.
// Wide layout only (the CSS grid, styles/diagrams.css); the phone list needs no drawing, only tap-to-open.
//   hover (mouse), keyboard focus or a click/tap (pins) makes a node active: its box and edges turn navy, the boxes at the
//   other ends turn half navy, and the caption cell shows "Label. Detail". Arrows / Home / End move focus, Escape unpins.
// Nothing moves: colours and box-shadows only, and the caption cell keeps its height (every detail is stacked in it).
// The routes, lines and arrowheads are computed in geometry.ts.
import type { Route } from '@/lib/diagrams';
import { head, line, route, type Box, type Point } from './geometry';

/** One node: its list item and its button (the box). */
interface Step {
  id: string;
  item: HTMLElement;
  node: HTMLButtonElement;
}

/** One edge, from its group's data attributes. */
interface Edge {
  g: SVGGElement;
  from: string;
  to: string;
  route: Route;
  fromAt: number | undefined;
  toAt: number | undefined;
  channel: number | undefined;
  /** Which side of a vertical segment the label sits on. */
  side: string | undefined;
  label: HTMLElement | null;
}

/** One figure: its parts and its state. */
interface Fig {
  fig: HTMLElement;
  plate: HTMLElement;
  grid: HTMLElement;
  svg: SVGSVGElement;
  steps: Step[];
  edges: Edge[];
  /** The grid layout (true) or the list (false); null until the first draw sets the state attribute of either. */
  wide: boolean | null;
  /** The node under the mouse, the node with keyboard focus and the pinned node. */
  hov: string | null;
  foc: string | null;
  pin: string | null;
}

const num = (s: string | undefined) => (s === undefined ? undefined : +s);

/** A figure's parts, read once from its markup, at rest. */
function parts(fig: HTMLElement): Fig {
  const plate = fig.querySelector<HTMLElement>('.dg-plate')!;
  const grid = plate.querySelector<HTMLElement>('.dg-grid')!;
  const svg = plate.querySelector<SVGSVGElement>('.dg-edges')!;
  const steps = [...grid.querySelectorAll<HTMLElement>('.dg-item')].map((item) => ({
    id: item.dataset.id!,
    item,
    node: item.querySelector<HTMLButtonElement>('.dg-node')!,
  }));
  const edges = [...svg.querySelectorAll<SVGGElement>('.dg-e')].map((g) => {
    const d = g.dataset;
    return {
      g,
      from: d.from!,
      to: d.to!,
      route: d.route as Route,
      fromAt: num(d.fa),
      toAt: num(d.ta),
      channel: num(d.ch),
      side: d.side,
      label: plate.querySelector<HTMLElement>(`.dg-el[data-k="${d.k}"]`),
    };
  });
  return { fig, plate, grid, svg, steps, edges, wide: null, hov: null, foc: null, pin: null };
}

const stepOf = (f: Fig, id: string) => f.steps.find((s) => s.id === id);
const frameOf = (f: Fig, group?: string) =>
  group ? f.grid.querySelector<HTMLElement>(`.dg-frame[data-group="${group}"]`) : null;
/** The box an edge end names: a node's, or a frame's (`#group`). */
const boxOf = (f: Fig, id: string) => (id[0] === '#' ? frameOf(f, id.slice(1)) : stepOf(f, id)?.node);

/** An element's rect in the plate's coordinates. */
function measure(el: Element, plate: DOMRect): Box {
  const r = el.getBoundingClientRect(),
    left = r.left - plate.left,
    top = r.top - plate.top;
  return {
    left,
    top,
    right: left + r.width,
    bottom: top + r.height,
    width: r.width,
    cx: left + r.width / 2,
    cy: top + r.height / 2,
  };
}

/** Start a layout clean: nothing active or open, and the state attribute that layout uses. */
function setLayout(f: Fig, wide: boolean) {
  f.wide = wide;
  f.hov = f.foc = f.pin = null;
  // grid: a pin toggle (aria-pressed); list: a disclosure of the step's detail (aria-expanded)
  const [state, other] = wide ? ['aria-pressed', 'aria-expanded'] : ['aria-expanded', 'aria-pressed'];
  for (const { item, node } of f.steps) {
    item.classList.remove('is-open');
    node.setAttribute(state, 'false');
    node.removeAttribute(other);
  }
  paint(f);
}

/** Draw every edge (grid layout only), after starting clean if the layout changed. */
function draw(f: Fig) {
  const wide = getComputedStyle(f.grid).display === 'grid';
  if (wide !== f.wide) setLayout(f, wide);
  f.fig.classList.toggle('is-drawn', wide);
  if (!wide) return;
  const plate = f.plate.getBoundingClientRect();
  f.svg.setAttribute('viewBox', `0 0 ${plate.width} ${plate.height}`);
  for (const e of f.edges) drawEdge(f, e, plate);
}

/** One edge's line, arrowhead(s) and label, from the rects of the boxes at its ends. */
function drawEdge(f: Fig, e: Edge, plate: DOMRect) {
  const fromEl = boxOf(f, e.from),
    toEl = boxOf(f, e.to);
  if (!fromEl || !toEl) return;
  const from = measure(fromEl, plate),
    to = measure(toEl, plate);
  const band = () =>
    Math.max(
      from.bottom,
      ...[...f.grid.querySelectorAll('.dg-item > .dg-node, .dg-frame')]
        .map((el) => measure(el, plate))
        .filter((b) => b.top < from.bottom)
        .map((b) => b.bottom),
    );
  const p = route(e.route, from, to, { fromAt: e.fromAt, toAt: e.toAt, channel: e.channel, band });
  const [ln, hd, hd0] = e.g.querySelectorAll('path');
  const [p0, p1] = p,
    tip = p[p.length - 1],
    prev = p[p.length - 2];
  if (!ln || !hd || !p0 || !p1 || !tip || !prev) return;
  ln.setAttribute('d', line(p));
  hd.setAttribute('d', head(tip, prev));
  hd0?.setAttribute('d', head(p0, p1));
  if (e.label) placeLabel(e.label, p, e, from, to);
}

/** An edge label at the middle of the route's longest segment, beside it when that segment is vertical. */
function placeLabel(lab: HTMLElement, p: Point[], e: Edge, from: Box, to: Box) {
  let bi = 0,
    best = -1;
  for (let i = 0; i < p.length - 1; i++) {
    const a = p[i],
      b = p[i + 1];
    if (!a || !b) continue;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (len > best) {
      best = len;
      bi = i;
    }
  }
  // hv: always the drop into the target, centred on the stretch outside the source box (the row gap), so its label
  // sits level with the `v` labels in the same gap
  if (e.route === 'hv') bi = p.length - 2;
  const a = p[bi],
    b = p[bi + 1];
  if (!a || !b) return;
  const [ax, ay] = a,
    [bx, by] = b;
  let lo = Math.min(ay, by),
    hi = Math.max(ay, by);
  if (e.route === 'hv') {
    if (to.top > from.cy) lo = Math.max(lo, from.bottom);
    else hi = Math.min(hi, from.top);
  }
  const mx = (ax + bx) / 2,
    my = (lo + hi) / 2,
    w = lab.offsetWidth,
    h = lab.offsetHeight;
  let x = mx - w / 2;
  if (Math.abs(ax - bx) < 1) x = e.side === 'left' ? mx - w - 2 : mx + 2;
  lab.style.transform = `translate(${Math.round(x)}px,${Math.round(my - h / 2)}px)`;
}

/** Paint the active node (or none): box, edges, the boxes at the other ends, the caption cell. */
function paint(f: Fig) {
  const id = f.wide ? (f.hov ?? f.foc ?? f.pin) : null;
  f.fig.querySelectorAll('.is-on, .is-near, .show').forEach((e) => e.classList.remove('is-on', 'is-near', 'show'));
  f.fig.classList.toggle('has-on', !!id);
  const step = id ? stepOf(f, id) : undefined;
  if (!id || !step) return;
  const group = step.item.dataset.group,
    keys = [id];
  step.node.classList.add('is-on');
  if (step.item.classList.contains('is-header')) {
    // a frame's header: the frame and its members
    keys.push('#' + group);
    frameOf(f, group)?.classList.add('is-on');
    for (const s of f.steps) if (s !== step && s.item.dataset.group === group) s.node.classList.add('is-near');
  }
  for (const e of f.edges) {
    const ends = [e.from, e.to];
    if (!ends.some((end) => keys.includes(end))) continue;
    e.g.classList.add('is-on');
    e.label?.classList.add('is-on');
    for (const end of ends) if (!keys.includes(end)) boxOf(f, end)?.classList.add('is-near');
  }
  f.fig.querySelector(`.dg-x[data-for="${id}"]`)?.classList.add('show');
}

/** List layout: open one step's detail (or none), with aria-expanded on its button. */
function openOnly(f: Fig, open: Step | null) {
  for (const s of f.steps) {
    s.item.classList.toggle('is-open', s === open);
    s.node.setAttribute('aria-expanded', String(s === open));
  }
}

function setPin(f: Fig, id: string | null) {
  f.pin = id;
  for (const s of f.steps) s.node.setAttribute('aria-pressed', String(s.id === id));
  paint(f);
}

// The keys that move focus between the nodes, from node i of n
const MOVES = new Map<string, (i: number, n: number) => number>([
  ['ArrowRight', (i) => i + 1],
  ['ArrowDown', (i) => i + 1],
  ['ArrowLeft', (i) => i - 1],
  ['ArrowUp', (i) => i - 1],
  ['Home', () => 0],
  ['End', (_, n) => n - 1],
]);

/** The node a key moves focus to from node i of n: undefined for another key, or past either end. */
function target(key: string, i: number, n: number): number | undefined {
  const j = MOVES.get(key)?.(i, n);
  return j !== undefined && j >= 0 && j < n ? j : undefined;
}

/** Hover, focus, click and the keys on one node. */
function bind(f: Fig, step: Step, i: number) {
  const { id, item, node } = step;
  const hover = (on: string | null) => (e: PointerEvent) => {
    if (e.pointerType === 'mouse') {
      f.hov = on;
      paint(f);
    }
  };
  node.addEventListener('pointerenter', hover(id));
  node.addEventListener('pointerleave', hover(null));
  node.addEventListener('focus', () => {
    f.foc = node.matches(':focus-visible') ? id : null;
    paint(f);
  });
  node.addEventListener('blur', () => {
    f.foc = null;
    paint(f);
  });
  node.addEventListener('click', () => {
    if (f.wide) return setPin(f, f.pin === id ? null : id);
    openOnly(f, item.classList.contains('is-open') ? null : step); // phone list: one detail open at a time
  });
  node.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (f.wide) setPin(f, null);
      else openOnly(f, null);
      return;
    }
    const j = target(e.key, i, f.steps.length);
    if (j === undefined) return;
    e.preventDefault();
    f.steps[j]?.node.focus();
  });
}

function wire(fig: HTMLElement) {
  const f = parts(fig);
  f.steps.forEach((step, i) => bind(f, step, i));
  // a click anywhere off a box unpins (not only on the plate)
  document.addEventListener('click', (e) => {
    if (f.wide && f.pin && !(e.target as Element | null)?.closest?.('.dg-node')) setPin(f, null);
  });
  let raf = 0;
  const redraw = () => {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => draw(f));
  };
  new ResizeObserver(redraw).observe(f.plate);
  document.fonts?.ready.then(redraw);
  draw(f);
}

export function wireAll() {
  document.querySelectorAll<HTMLElement>('.dg:not([data-wired])').forEach((fig) => {
    fig.dataset.wired = '';
    wire(fig);
  });
}
