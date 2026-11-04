// The geometry of a flow diagram's edges, free of the DOM (flow.ts measures the boxes and writes the paths): the route
// between two boxes, the polyline with rounded bends through it and the chevron at an end. Coordinates are px in the
// plate's box; every number written into a path is rounded to 0.5 px.
import type { Route } from '@/lib/diagrams';

/** A box measured in the plate: its sides, its width and its centre. */
export interface Box {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  cx: number;
  cy: number;
}

export type Point = [number, number];

export interface RouteOptions {
  /** Port positions along the source's and the target's side, 0–1. */
  fromAt?: number | undefined;
  toAt?: number | undefined;
  /** Distance of the `over` / `under` / `gap` channel from the boxes. */
  channel?: number | undefined;
  /** The bottom of the source's band (the boxes that start above the source's bottom): the `gap` channel runs under it. */
  band: () => number;
}

// The defaults of FlowEdge (lib/diagrams.ts): a port in the middle of its side, a channel 14 px from the boxes
const PORT = 0.5,
  CHANNEL = 14;
// The bend radius, and the chevron's length and half-width
const RAD = 6,
  HEAD = 6,
  HALF = 4;

/** Rounds to the nearest 0.5 px. */
const snap = (n: number) => Math.round(n * 2) / 2;

/** The x of a port at `at` (0–1) along a box's top or bottom side. */
const port = (b: Box, at: number) => b.left + at * b.width;

/** The middle of where [lo1, hi1] and [lo2, hi2] overlap, or `fallback` when they do not. */
function overlapMid(lo1: number, hi1: number, lo2: number, hi2: number, fallback: number): number {
  const lo = Math.max(lo1, lo2),
    hi = Math.min(hi1, hi2);
  return hi > lo ? (lo + hi) / 2 : fallback;
}

/** The orthogonal route of an edge from one box to another (FlowEdge `route` in lib/diagrams.ts). */
export function route(kind: Route, from: Box, to: Box, opts: RouteOptions): Point[] {
  const fa = opts.fromAt ?? PORT,
    ta = opts.toAt ?? PORT,
    ch = opts.channel ?? CHANNEL;
  switch (kind) {
    case 'h': {
      const fwd = to.left >= from.right - 1,
        y = overlapMid(from.top, from.bottom, to.top, to.bottom, from.cy);
      return [
        [fwd ? from.right : from.left, y],
        [fwd ? to.left : to.right, y],
      ];
    }
    case 'v': {
      const down = to.top >= from.bottom - 1,
        x =
          opts.fromAt === undefined
            ? overlapMid(from.left, from.right, to.left, to.right, from.cx)
            : port(from, opts.fromAt);
      return [
        [x, down ? from.bottom : from.top],
        [x, down ? to.top : to.bottom],
      ];
    }
    case 'hv': {
      const x = port(to, ta);
      return [
        [x > from.right ? from.right : from.left, from.cy],
        [x, from.cy],
        [x, to.top > from.cy ? to.top : to.bottom],
      ];
    }
    case 'vh': {
      const x = port(from, fa);
      return [
        [x, to.cy > from.bottom ? from.bottom : from.top],
        [x, to.cy],
        [to.left > x ? to.left : to.right, to.cy],
      ];
    }
    case 'elbow': {
      if (Math.abs(from.cy - to.cy) < 1)
        return [
          [from.right, from.cy],
          [to.left, to.cy],
        ];
      const m = (from.right + to.left) / 2;
      return [
        [from.right, from.cy],
        [m, from.cy],
        [m, to.cy],
        [to.left, to.cy],
      ];
    }
    case 'over':
    case 'under': {
      const up = kind === 'over',
        x1 = port(from, fa),
        x2 = port(to, ta),
        y = up ? Math.min(from.top, to.top) - ch : Math.max(from.bottom, to.bottom) + ch;
      return [
        [x1, up ? from.top : from.bottom],
        [x1, y],
        [x2, y],
        [x2, up ? to.top : to.bottom],
      ];
    }
    case 'gap': {
      const x1 = port(from, fa),
        x2 = port(to, ta),
        y = opts.band() + ch;
      return [
        [x1, from.bottom],
        [x1, y],
        [x2, y],
        [x2, to.top],
      ];
    }
    default: {
      const unknown: never = kind;
      throw new Error(`flow diagram: unknown route "${String(unknown)}"`);
    }
  }
}

/** A path through the points, each bend rounded by a quadratic curve (radius 6, at most half of either segment). */
export function line(p: Point[]): string {
  const first = p[0],
    last = p[p.length - 1];
  if (!first || !last) throw new Error('flow diagram: a line needs points');
  let s = `M${snap(first[0])} ${snap(first[1])}`;
  for (let i = 1; i < p.length - 1; i++) {
    const a = p[i - 1],
      b = p[i],
      c = p[i + 1];
    if (!a || !b || !c) continue;
    const [ax, ay] = a,
      [bx, by] = b,
      [cx, cy] = c;
    const l1 = Math.hypot(bx - ax, by - ay) || 1,
      l2 = Math.hypot(cx - bx, cy - by) || 1;
    const r = Math.min(RAD, l1 / 2, l2 / 2);
    s += `L${snap(bx + ((ax - bx) * r) / l1)} ${snap(by + ((ay - by) * r) / l1)}`;
    s += `Q${snap(bx)} ${snap(by)} ${snap(bx + ((cx - bx) * r) / l2)} ${snap(by + ((cy - by) * r) / l2)}`;
  }
  return `${s}L${snap(last[0])} ${snap(last[1])}`;
}

/** An open chevron at `tip`, pointing away from `from`. */
export function head(tip: Point, from: Point): string {
  const [tx, ty] = tip,
    [fx, fy] = from;
  const dx = tx - fx,
    dy = ty - fy,
    len = Math.hypot(dx, dy) || 1,
    ux = dx / len,
    uy = dy / len;
  const bx = tx - ux * HEAD,
    by = ty - uy * HEAD;
  return `M${snap(bx - uy * HALF)} ${snap(by + ux * HALF)}L${snap(tx)} ${snap(ty)}L${snap(bx + uy * HALF)} ${snap(by - ux * HALF)}`;
}
