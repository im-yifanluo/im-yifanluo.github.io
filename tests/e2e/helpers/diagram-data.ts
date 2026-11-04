// The diagrams the project pages render, read from the content (src/content/projects, src/data/diagrams.ts), and what
// each drawing promises, derived from its grid: the labels that share a row gap, the edges that drop into the middle of
// a box, the rows of boxes, and the row a frame's header sits in.
import { readFileSync } from 'node:fs';
import { DIAGRAMS } from '../../../src/data/diagrams';
import type { Cell, DiagramSpec, FlowDiagram } from '../../../src/lib/diagrams';
import { projects } from './data';

export interface PageDiagram {
  spec: DiagramSpec;
  /** The figure's caption: the project's own (its figure entry) or else the diagram's. */
  caption: string;
}
export interface DiagramPage {
  path: string;
  /** In figure order. */
  diagrams: PageDiagram[];
  /** The flow diagrams among them: drawn on a grid, with boxes that take the keyboard and the diagram script. */
  flows: FlowDiagram[];
}

function diagramOf(id: string): DiagramSpec {
  const spec = DIAGRAMS[id];
  if (!spec) throw new Error(`src/data/diagrams.ts: no diagram "${id}"`);
  return spec;
}

/** Every project page with a diagram, in homepage order. */
export const DIAGRAM_PAGES: DiagramPage[] = projects.flatMap(({ slug, figures }) => {
  const diagrams = figures.flatMap(({ diagram, caption }) =>
    diagram ? [{ spec: diagramOf(diagram), caption: caption ?? diagramOf(diagram).caption.text }] : [],
  );
  const flows = diagrams.flatMap(({ spec }) => (spec.kind === 'flow' ? [spec] : []));
  return diagrams.length ? [{ path: `/${slug}/`, diagrams, flows }] : [];
});

/** The pages with a flow diagram. */
export const FLOW_PAGES = DIAGRAM_PAGES.filter(({ flows }) => flows.length > 0);

const styles = readFileSync(new URL('../../../src/styles/diagrams.css', import.meta.url), 'utf8');
/** The figure width from which a flow diagram is drawn as a grid: the `@container dg` query in src/styles/diagrams.css. */
export const GRID_FROM = Number(/@container dg \(min-width: (\d+)px\)/.exec(styles)?.[1]);
if (!GRID_FROM) throw new Error('src/styles/diagrams.css: no `@container dg (min-width: …px)` query');

/** The first and last grid row of a cell. */
const rowsOf = (at: Cell): [number, number] => [at.row, at.row + (at.rowSpan ?? 1) - 1];

/** The cell of an edge's end: a node, or a frame (`#group`). */
function cellOf(d: FlowDiagram, end: string): Cell {
  const at = end.startsWith('#')
    ? d.groups?.find(({ id }) => id === end.slice(1))?.at
    : d.nodes.find(({ id }) => id === end)?.at;
  if (!at) throw new Error(`src/data/diagrams.ts: diagram ${d.id} has no node or frame "${end}"`);
  return at;
}

/**
 * The labelled edges whose labels share a row gap, one list per gap of two labels or more, each edge as its index (the
 * label's `data-k`). A `v` edge's label sits beside its drop between two rows and an `hv` edge's beside the drop into its
 * target (components/diagrams/flow.ts), so the labels in one gap sit on one line.
 */
export function rowGapLabels(d: FlowDiagram): number[][] {
  const gaps = new Map<string, number[]>();
  d.edges.forEach(({ from, to, route, label }, k) => {
    if (!label || (route !== 'v' && route !== 'hv')) return;
    const [upper, lower] = [rowsOf(cellOf(d, from)), rowsOf(cellOf(d, to))].sort((a, b) => a[0] - b[0]);
    if (upper[1] >= lower[0]) return; // the ends share a row: no gap between them
    const gap = `${upper[1]}-${lower[0]}`;
    gaps.set(gap, [...(gaps.get(gap) ?? []), k]);
  });
  return [...gaps.values()].filter((edges) => edges.length > 1);
}

/** The `hv` edges that drop into the middle of their target (no `toAt`), by index. */
export const centreDrops = (d: FlowDiagram) =>
  d.edges.flatMap(({ route, toAt }, k) => (route === 'hv' && toAt === undefined ? [k] : []));

/** Per grid row of two boxes or more, the boxes that start in it and span one row (a frame's header is not a box). */
export function boxRows(d: FlowDiagram): string[][] {
  const rows = new Map<number, string[]>();
  for (const { id, at, header } of d.nodes) {
    if (!header && !at.rowSpan) rows.set(at.row, [...(rows.get(at.row) ?? []), id]);
  }
  return [...rows.values()].filter((ids) => ids.length > 1);
}

/** Each frame that has a header, with the nodes that start in the header's row (the header among them). */
export function framedRows(d: FlowDiagram): { frame: string; row: { id: string; header: boolean }[] }[] {
  return (d.groups ?? []).flatMap(({ id }) => {
    const header = d.nodes.find((n) => n.header && n.group === id);
    if (!header) return [];
    const row = d.nodes.filter((n) => n.at.row === header.at.row).map((n) => ({ id: n.id, header: !!n.header }));
    return [{ frame: id, row }];
  });
}

/** The letters and digits of a text, in lower case: compares texts across typesetting (quotes, spaces, code marks). */
export const letters = (text: string) =>
  text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
