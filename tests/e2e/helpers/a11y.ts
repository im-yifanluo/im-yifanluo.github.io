// What assistive technology gets from a page: the accessibility nodes Chrome exposes, and the focus indicator of the
// element that has the keyboard focus.
import type { Page } from '@playwright/test';

export interface AxNode {
  role: string;
  name: string;
  /** The node's states and properties by name (expanded, pressed, …), with the values Chrome gives them. */
  states: Record<string, unknown>;
}

/** The accessibility node of each element matching `selector`, in document order, as Chrome exposes it. */
export async function axNodes(page: Page, selector: string): Promise<AxNode[]> {
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send('DOM.enable');
    await cdp.send('Accessibility.enable');
    const { root } = await cdp.send('DOM.getDocument', { depth: -1 });
    const { nodeIds } = await cdp.send('DOM.querySelectorAll', { nodeId: root.nodeId, selector });
    const found: AxNode[] = [];
    for (const nodeId of nodeIds) {
      const { nodes } = await cdp.send('Accessibility.getPartialAXTree', { nodeId, fetchRelatives: false });
      const node = nodes.find((x) => !x.ignored) ?? nodes[0];
      found.push({
        role: String(node?.role?.value ?? ''),
        name: String(node?.name?.value ?? ''),
        states: Object.fromEntries((node?.properties ?? []).map(({ name, value }) => [name, value.value])),
      });
    }
    return found;
  } finally {
    await cdp.detach();
  }
}

/** The accessibility node of the first element matching `selector`. */
export async function axNode(page: Page, selector: string): Promise<AxNode> {
  const [node] = await axNodes(page, selector);
  if (!node) throw new Error(`${page.url()}: nothing matches ${selector}`);
  return node;
}

export interface FocusStop {
  element: string;
  /** The focus indicator the stop must show: the accent ring, the in-text highlight, or the ring on a title's tile. */
  expects: 'ring' | 'highlight' | 'tile';
  shown: boolean;
  outline: string;
  background: string;
  underline: string;
}

/**
 * The element that has the keyboard focus, the focus indicator it must show and whether it shows it. Standalone
 * controls show the 2 px accent ring; a link inside a line of text the tinted highlight with a 2 px underline (a ring
 * would touch the next glyph); a project title rings its tile (2 px accent). Null once the focus has left the page or
 * comes back to an element it was on before.
 */
export const focusStop = (page: Page) =>
  page.evaluate((): FocusStop | null => {
    const e = document.activeElement;
    if (!e || e === document.body) return null;
    // by element, not markup: two "Résumé" links share theirs
    const w = window as unknown as { e2eFocusSeen?: WeakSet<Element> };
    const seen = (w.e2eFocusSeen ??= new WeakSet());
    if (seen.has(e)) return null;
    seen.add(e);
    const colour = (name: string) => {
      const probe = document.createElement('i');
      probe.style.color = `var(${name})`;
      document.body.append(probe);
      const value = getComputedStyle(probe).color;
      probe.remove();
      return value;
    };
    const accent = colour('--accent');
    const cs = getComputedStyle(e);
    const underline = parseFloat(cs.textDecorationThickness) >= 2;
    const title = e.matches('.entry .title a');
    const inText = e.matches('a') && !!e.closest('.prose, .desc, .lead, .did, .cap, .credits, .links, .site-footer');
    const expects = title ? 'tile' : inText ? 'highlight' : 'ring';
    const shows = {
      ring: () => cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2 && cs.outlineColor === accent,
      highlight: () => cs.backgroundColor === colour('--selection') && underline && cs.outlineStyle === 'none',
      tile: () => {
        const frame = getComputedStyle(e.closest('.entry')!.querySelector('.tile')!, '::after').boxShadow;
        return frame.includes(accent) && /\b2px\b/.test(frame) && underline;
      },
    };
    return {
      element: e.outerHTML.slice(0, 80),
      expects,
      shown: shows[expects](),
      outline: `${cs.outlineWidth} ${cs.outlineStyle} ${cs.outlineColor}`,
      background: cs.backgroundColor,
      underline: cs.textDecorationThickness,
    };
  });
