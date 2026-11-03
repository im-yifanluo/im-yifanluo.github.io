// The project diagrams: real boxes and arrows, drawn from typed data by components/diagrams/Diagram.astro.
// Two kinds share one look (the plate, the site's tokens and type roles):
//   flow  boxes on a desktop grid, joined by drawn edges; a vertical list on phones and without JS
//   bars  a small table with an in-cell bar per value (a chart that stays readable as text)
// Every string may hold the site's inline markup (lib/rich-text.ts `rich`: `code`, [label](href)) and is typeset at
// render time. Glyphs: the subset font has → ← ≈ × · – — ≤ ≥ and curly quotes, but no α ↔ ↑ ↓ ↺ ° ± ³ (arrows are
// drawn in SVG).

import { DIAGRAMS } from '@/data/diagrams';

/** A cell of the desktop grid (1-based; spans default to 1). */
export interface Cell {
  col: number;
  row: number;
  colSpan?: number;
  rowSpan?: number;
}

export interface FlowNode {
  /** Unique within the diagram; the button's id is `dg-<diagram>-<id>`. */
  id: string;
  /** The step's name: navy, at most ~26 characters, may wrap to two lines. */
  label: string;
  /** The key technique or number, visible at rest: at most ~32 characters. */
  sub?: string;
  /** One to three sentences (≤ ~215 characters, three lines of the caption column), shown on hover, focus or tap. */
  detail: string;
  at: Cell;
  /** List layout: an input hanging beside the spine (indented), not a step of the main flow. */
  side?: true;
  /** List layout: nodes sharing a set id are one bracketed group of parallel steps. */
  set?: string;
  /** Member of a frame (`groups`). */
  group?: string;
  /** The frame's own header node: text only (no box) at the top of its frame. */
  header?: true;
  /** Small tags inside the box (not focusable). */
  chips?: string[];
  /** A numbered step inside a frame (the number is a CSS counter, never a digit in the HTML). */
  step?: true;
  /** Spans several rows but stays a normal-height box, centred in its band. */
  center?: true;
  /** Phrases never broken across lines (lib/typography.ts glue). */
  keep?: string[];
}

export type Route = 'h' | 'v' | 'hv' | 'vh' | 'elbow' | 'over' | 'under' | 'gap';

export interface FlowEdge {
  /** Node ids; `#group` attaches the edge to a frame. */
  from: string;
  to: string;
  /**
   * h      facing sides, at the middle of the two boxes' vertical overlap
   * v      top/bottom, at the middle of their horizontal overlap (or `fromAt`)
   * hv     out of the source's side, then down/up into the target at `toAt`
   * vh     out of the source's bottom/top at `fromAt`, then across into the target's side
   * elbow  horizontal, vertical in the middle of the gap, horizontal (fans and fan-ins)
   * over / under  a channel above / below both boxes, from `fromAt` to `toAt`
   * gap    down from the source, along a channel under its whole band, into the target's top
   */
  route: Route;
  /** Port position along the side, 0–1 (default 0.5). */
  fromAt?: number;
  toAt?: number;
  /** Distance of the `gap` / `over` / `under` channel from the boxes, px (default 14). */
  channel?: number;
  label?: string;
  /** Beside a vertical segment: which side the label sits on (default right). */
  labelSide?: 'left' | 'right';
  /** Arrowheads at both ends. */
  both?: true;
  /** A past or optional path. */
  dashed?: true;
  /** The list layout's line for an edge the spine cannot draw (default "Into: <target>" / "Back to: <target>"). */
  relText?: string;
}

export interface FlowGroup {
  id: string;
  at: Cell;
}
export interface FlowHead {
  text: string;
  at: Cell;
  /** Also shown in the list layout, as a small sub-heading. */
  list?: true;
  /** List layout: emitted right before this node (otherwise at the top). */
  before?: string;
}

/** The figure's caption (visible at rest). A project's figure may give its own, which then wins. */
export interface Caption {
  text: string;
}

export interface FlowDiagram {
  kind: 'flow';
  id: string;
  /** Default figure width: the content column (880 px) or the text column. */
  width: 'wide' | 'text';
  /** Accessible name of the step list ("How … works"). No numbers. */
  label: string;
  caption: Caption;
  cols: number;
  /** CSS grid-template-rows of the desktop grid; spacer rows are rows of their own (they hold edge labels). */
  rows: string;
  /** In reading order: DOM order = Tab order = phone order. */
  nodes: FlowNode[];
  edges: FlowEdge[];
  groups?: FlowGroup[];
  heads?: FlowHead[];
}

export interface BarTable {
  kind: 'bars';
  id: string;
  width: 'wide' | 'text';
  /** The table's accessible caption (short). */
  label: string;
  caption: Caption;
  /** Header over the row names ("Task") and over the value columns ("Context budget (tokens)"). */
  rowHead: string;
  colHead: string;
  cols: string[];
  /** Values 0–100, printed with `unit`. */
  rows: { name: string; values: number[] }[];
  unit: string;
}

export type DiagramSpec = FlowDiagram | BarTable;

export function diagram(id: string): DiagramSpec {
  const d = Object.hasOwn(DIAGRAMS, id) ? DIAGRAMS[id] : undefined;
  if (!d) throw new Error(`lib/diagrams.ts: no diagram "${id}" (have ${Object.keys(DIAGRAMS).join(', ')})`);
  return d;
}

// ---- list layout model (phones, print and no-JS) -------------------------------------------------------------------
// The spine joins blocks in reading order: a plain node, a set (parallel nodes) or a group (header + members) is one
// block; side nodes hang beside the spine. An edge is drawn by the spine when it joins a block to the next block (into
// that block's first item) or a side node to the side node right after it. Every other edge (a loop back, a skip, a
// side node's way into the flow) is written out under its source node as a line: "Into: …", "Back to: …".

export interface ListModel {
  /** Nodes that the spine enters from above (they get the connector). */
  linkIn: Set<string>;
  /** Per source node: the lines for edges the spine cannot draw. */
  rel: Map<string, { text: string }[]>;
}

const bare = (id: string) => id.replace(/^#/, '');

export function listModel(d: FlowDiagram): ListModel {
  const ids = d.nodes.map((n) => n.id);
  const byId = new Map(d.nodes.map((n) => [n.id, n]));
  const blockOf = (n: FlowNode) => (n.side ? null : n.set ? `set:${n.set}` : n.group ? `grp:${n.group}` : `n:${n.id}`);
  const blocks: string[] = [];
  for (const n of d.nodes) {
    const b = blockOf(n);
    if (b && blocks[blocks.length - 1] !== b) blocks.push(b);
  }
  const blockIdx = (id: string) => blocks.indexOf(blockOf(byId.get(id)!) ?? '');
  const linkIn = new Set<string>();
  const rel = new Map<string, { text: string }[]>();
  for (const e of d.edges) {
    const a = bare(e.from),
      b = bare(e.to);
    const A = byId.get(a),
      B = byId.get(b);
    if (!A || !B) throw new Error(`diagram ${d.id}: edge ${e.from} → ${e.to} names no node`);
    const ia = ids.indexOf(a),
      ib = ids.indexOf(b);
    if (A.side || B.side) {
      if (A.side && B.side && ib === ia + 1) {
        linkIn.add(b);
        continue;
      }
    } else {
      const ba = blockIdx(a),
        bb = blockIdx(b);
      if (ba === bb) continue; // inside one set or group: the bracket or frame says it
      if (bb === ba + 1) {
        linkIn.add(d.nodes.find((m) => blockOf(m) === blocks[bb])!.id);
        continue;
      }
    }
    const text = e.relText ?? `${ib < ia ? 'Back to' : 'Into'}: ${B.label}${e.label ? ` (${e.label})` : ''}`;
    const list = rel.get(a) ?? [];
    list.push({ text });
    rel.set(a, list);
  }
  return { linkIn, rel };
}
