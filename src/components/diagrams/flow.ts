// Flow diagrams in the browser (Flow.astro): draws the edges from the boxes' rects and handles the active state.
// Wide layout only (the CSS grid, styles/diagrams.css); the phone list needs no drawing, only tap-to-open.
//   hover (mouse), keyboard focus or a click/tap (pins) makes a node active: its box and edges turn navy, the boxes at the
//   other ends turn half navy, and the caption cell shows "Label. Detail". Arrows / Home / End move focus, Escape unpins.
// Nothing moves: colours and box-shadows only, and the caption cell keeps its height (every detail is stacked in it).

type R = { l: number; t: number; r: number; b: number; w: number; cx: number; cy: number };
type P = [number, number][];

const RAD = 6, HEAD = 6, HALF = 4;

/** Orthogonal route points from source S to target T (lib/diagrams.ts Route). */
function route(k: string, S: R, T: R, fa: number, ta: number, ch: number, band: () => number, hasFa: boolean): P {
  switch (k) {
    case 'h': {
      const fwd = T.l >= S.r - 1, o1 = Math.max(S.t, T.t), o2 = Math.min(S.b, T.b), y = o2 > o1 ? (o1 + o2) / 2 : S.cy;
      return [[fwd ? S.r : S.l, y], [fwd ? T.l : T.r, y]];
    }
    case 'v': {
      const down = T.t >= S.b - 1, o1 = Math.max(S.l, T.l), o2 = Math.min(S.r, T.r);
      const x = hasFa ? S.l + fa * S.w : o2 > o1 ? (o1 + o2) / 2 : S.cx;
      return [[x, down ? S.b : S.t], [x, down ? T.t : T.b]];
    }
    case 'hv': {
      const x = T.l + ta * T.w;
      return [[x > S.r ? S.r : S.l, S.cy], [x, S.cy], [x, T.t > S.cy ? T.t : T.b]];
    }
    case 'vh': {
      const x = S.l + fa * S.w;
      return [[x, T.cy > S.b ? S.b : S.t], [x, T.cy], [T.l > x ? T.l : T.r, T.cy]];
    }
    case 'elbow': {
      const m = (S.r + T.l) / 2;
      return Math.abs(S.cy - T.cy) < 1 ? [[S.r, S.cy], [T.l, T.cy]] : [[S.r, S.cy], [m, S.cy], [m, T.cy], [T.l, T.cy]];
    }
    case 'over': case 'under': {
      const up = k === 'over', x1 = S.l + fa * S.w, x2 = T.l + ta * T.w;
      const y = up ? Math.min(S.t, T.t) - ch : Math.max(S.b, T.b) + ch;
      return [[x1, up ? S.t : S.b], [x1, y], [x2, y], [x2, up ? T.t : T.b]];
    }
    default: { // gap: under the source's whole band
      const x1 = S.l + fa * S.w, x2 = T.l + ta * T.w, y = band() + ch;
      return [[x1, S.b], [x1, y], [x2, y], [x2, T.t]];
    }
  }
}

const f = (n: number) => Math.round(n * 2) / 2;

/** A polyline with rounded bends (quadratic, radius 6). */
function line(p: P): string {
  let s = `M${f(p[0][0])} ${f(p[0][1])}`;
  for (let i = 1; i < p.length - 1; i++) {
    const [a, b, c] = [p[i - 1], p[i], p[i + 1]];
    const l1 = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, l2 = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1;
    const r = Math.min(RAD, l1 / 2, l2 / 2);
    s += `L${f(b[0] + ((a[0] - b[0]) * r) / l1)} ${f(b[1] + ((a[1] - b[1]) * r) / l1)}Q${f(b[0])} ${f(b[1])} ${f(b[0] + ((c[0] - b[0]) * r) / l2)} ${f(b[1] + ((c[1] - b[1]) * r) / l2)}`;
  }
  const z = p[p.length - 1];
  return `${s}L${f(z[0])} ${f(z[1])}`;
}

/** An open chevron at `tip`, pointing away from `from`. */
function head(tip: [number, number], from: [number, number]): string {
  const dx = tip[0] - from[0], dy = tip[1] - from[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  const bx = tip[0] - ux * HEAD, by = tip[1] - uy * HEAD;
  return `M${f(bx - uy * HALF)} ${f(by + ux * HALF)}L${f(tip[0])} ${f(tip[1])}L${f(bx + uy * HALF)} ${f(by - ux * HALF)}`;
}

function wire(fig: HTMLElement) {
  const plate = fig.querySelector<HTMLElement>('.dg-plate')!;
  const grid = plate.querySelector<HTMLElement>('.dg-grid')!;
  const svg = plate.querySelector<SVGSVGElement>('.dg-edges')!;
  const items = [...grid.querySelectorAll<HTMLElement>('.dg-item')];
  const nodes = items.map((i) => i.querySelector<HTMLButtonElement>('.dg-node')!);
  const edges = [...svg.querySelectorAll<SVGGElement>('.dg-e')];
  const label = (k: string) => plate.querySelector<HTMLElement>(`.dg-el[data-k="${k}"]`);
  const item = (id: string) => items.find((i) => i.dataset.id === id);
  const frame = (g?: string) => (g ? grid.querySelector<HTMLElement>(`.dg-frame[data-group="${g}"]`) : null);
  const boxOf = (id: string) => (id[0] === '#' ? frame(id.slice(1)) : item(id)?.firstElementChild as HTMLElement | null);
  const idOf = (b: Element) => (b.parentElement as HTMLElement).dataset.id!;
  // `wide` starts unknown, so the first draw sets the state attribute of whichever layout the figure starts in
  let wide: boolean | null = null, hov: string | null = null, foc: string | null = null, pin: string | null = null;

  function rect(el: Element, P: DOMRect): R {
    const r = el.getBoundingClientRect(), l = r.left - P.left, t = r.top - P.top;
    return { l, t, r: l + r.width, b: t + r.height, w: r.width, cx: l + r.width / 2, cy: t + r.height / 2 };
  }

  function draw() {
    const was = wide;
    wide = getComputedStyle(grid).display === 'grid';
    if (wide !== was) {   // layout changed: start clean, with the state attribute each layout uses
      hov = foc = pin = null;
      items.forEach((i) => i.classList.remove('is-open'));
      // grid: a pin toggle (aria-pressed); list: a disclosure of the step's detail (aria-expanded)
      nodes.forEach((b) => {
        if (wide) { b.setAttribute('aria-pressed', 'false'); b.removeAttribute('aria-expanded'); }
        else { b.removeAttribute('aria-pressed'); b.setAttribute('aria-expanded', 'false'); }
      });
      paint();
    }
    fig.classList.toggle('is-drawn', wide);
    if (!wide) return;
    const P = plate.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${P.width} ${P.height}`);
    for (const g of edges) {
      const d = g.dataset, sEl = boxOf(d.from!), tEl = boxOf(d.to!);
      if (!sEl || !tEl) continue;
      const S = rect(sEl, P), T = rect(tEl, P);
      const band = () => Math.max(S.b, ...[...grid.querySelectorAll('.dg-item > .dg-node, .dg-frame')].map((e) => rect(e, P)).filter((r) => r.t < S.b).map((r) => r.b));
      const p = route(d.route!, S, T, +(d.fa ?? 0.5), +(d.ta ?? 0.5), +(d.ch ?? 14), band, d.fa != null);
      const [ln, hd, hd0] = g.querySelectorAll('path');
      ln.setAttribute('d', line(p));
      hd.setAttribute('d', head(p[p.length - 1], p[p.length - 2]));
      hd0?.setAttribute('d', head(p[0], p[1]));
      const lab = label(d.k!);
      if (lab) {   // the middle of the longest segment; beside it when vertical
        let bi = 0, best = -1;
        for (let i = 0; i < p.length - 1; i++) { const L = Math.hypot(p[i + 1][0] - p[i][0], p[i + 1][1] - p[i][1]); if (L > best) { best = L; bi = i; } }
        // hv: always the drop into the target, centred on the stretch outside the source box (the row gap), so its label
        // sits level with the `v` labels in the same gap
        if (d.route === 'hv') bi = p.length - 2;
        const a = p[bi], b = p[bi + 1];
        let lo = Math.min(a[1], b[1]), hi = Math.max(a[1], b[1]);
        if (d.route === 'hv') { if (T.t > S.cy) lo = Math.max(lo, S.b); else hi = Math.min(hi, S.t); }
        const mx = (a[0] + b[0]) / 2, my = (lo + hi) / 2, w = lab.offsetWidth, h = lab.offsetHeight;
        const x = Math.abs(a[0] - b[0]) < 1 ? (d.side === 'left' ? mx - w - 2 : mx + 2) : mx - w / 2;
        lab.style.transform = `translate(${Math.round(x)}px,${Math.round(my - h / 2)}px)`;
      }
    }
  }

  /** Paint the active node (or none): box, edges, the boxes at the other ends, the caption cell. */
  function paint() {
    const id = wide ? hov ?? foc ?? pin : null;
    fig.querySelectorAll('.is-on, .is-near, .show').forEach((e) => e.classList.remove('is-on', 'is-near', 'show'));
    fig.classList.toggle('has-on', !!id);
    if (!id) return;
    const it = item(id)!, grp = it.dataset.group, keys = [id];
    it.firstElementChild!.classList.add('is-on');
    if (it.classList.contains('is-header')) {   // a frame's header: the frame and its members
      keys.push('#' + grp);
      frame(grp)?.classList.add('is-on');
      items.forEach((i) => i !== it && i.dataset.group === grp && i.firstElementChild!.classList.add('is-near'));
    }
    for (const g of edges) {
      const ends = [g.dataset.from!, g.dataset.to!];
      if (!ends.some((e) => keys.includes(e))) continue;
      g.classList.add('is-on');
      label(g.dataset.k!)?.classList.add('is-on');
      for (const e of ends) if (!keys.includes(e)) boxOf(e)?.classList.add('is-near');
    }
    fig.querySelector(`.dg-x[data-for="${id}"]`)?.classList.add('show');
  }

  /** List layout: open one step's detail (or none), with aria-expanded on its button. */
  const openOnly = (it: HTMLElement | null) => items.forEach((x, k) => {
    x.classList.toggle('is-open', x === it);
    nodes[k].setAttribute('aria-expanded', String(x === it));
  });

  const setPin = (id: string | null) => {
    pin = id;
    nodes.forEach((b) => b.setAttribute('aria-pressed', String(idOf(b) === pin)));
    paint();
  };

  nodes.forEach((b, i) => {
    const id = idOf(b);
    b.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') { hov = id; paint(); } });
    b.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') { hov = null; paint(); } });
    b.addEventListener('focus', () => { foc = b.matches(':focus-visible') ? id : null; paint(); });
    b.addEventListener('blur', () => { foc = null; paint(); });
    b.addEventListener('click', () => {
      if (wide) return setPin(pin === id ? null : id);
      const it = items[i], open = !it.classList.contains('is-open');   // phone list: one detail open at a time
      openOnly(open ? it : null);
    });
    b.addEventListener('keydown', (e) => {
      const k = e.key, j = k === 'ArrowRight' || k === 'ArrowDown' ? i + 1 : k === 'ArrowLeft' || k === 'ArrowUp' ? i - 1 : k === 'Home' ? 0 : k === 'End' ? nodes.length - 1 : null;
      if (k === 'Escape') { if (wide) setPin(null); else openOnly(null); return; }
      if (j == null || j < 0 || j >= nodes.length) return;
      e.preventDefault();
      nodes[j].focus();
    });
  });
  // a click anywhere off a box unpins (not only on the plate)
  document.addEventListener('click', (e) => { if (wide && pin && !(e.target as Element | null)?.closest?.('.dg-node')) setPin(null); });

  let raf = 0;
  const redraw = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(draw); };
  new ResizeObserver(redraw).observe(plate);
  document.fonts?.ready.then(redraw);
  draw();
}

export function wireAll() {
  document.querySelectorAll<HTMLElement>('.dg:not([data-wired])').forEach((fig) => { fig.dataset.wired = ''; wire(fig); });
}
