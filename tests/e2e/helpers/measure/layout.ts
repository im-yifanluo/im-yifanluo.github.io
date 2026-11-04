// measure() parts about layout: the media and right-hand edges, the vertical rhythm, and the homepage's project rows.
// Each part runs in the page with the shared toolkit and uses nothing else from outside its own body.
import type { Box, Toolkit } from './toolkit';

/** Left edges of media and of the header's name, the footer's parts, and every right-aligned edge. */
export function edges(k: Toolkit) {
  const mediaLeft = [...document.querySelectorAll('.tile, .portrait, .hero, .fig-media, .dg-plate')].map(
    (m) => k.box(m).l,
  );
  const homeLeft = [...document.querySelectorAll('.site-header .home')]
    .filter((e) => getComputedStyle(e).display !== 'none')
    .map((e) => k.box(e).l);
  const boxIf = (sel: string) => {
    const e = document.querySelector(sel);
    return e && k.visible(e) ? k.box(e) : null;
  };
  const texts = (sel: string) => [...document.querySelectorAll(sel)].map((e) => e.textContent!.trim());
  const footer = {
    bar: boxIf('.site-footer .bar'),
    copy: boxIf('.site-footer .copy'),
    links: boxIf('.site-footer .links'),
    upd: boxIf('.site-footer .upd'),
    text: document.querySelector('.site-footer')?.textContent!.replace(/\s+/g, ' ').trim() ?? '',
    order: texts('.site-footer .links a'),
    heroOrder: texts('.intro .links a'),
    updated: document.querySelector('.site-footer .upd time')?.getAttribute('datetime') ?? null,
    newestNews:
      [...document.querySelectorAll('#news .date time')]
        .map((t) => t.getAttribute('datetime')!)
        .sort()
        .at(-1) ?? null,
  };
  // right-aligned items: dates, the nav's end, hairlines, the pause control, the content's right edge
  const right = (sel: string, all = false) =>
    [...document.querySelectorAll(sel)]
      .filter(k.visible)
      .map((e) => k.box(e).r)
      .slice(0, all ? 99 : 1);
  const alignedRight = (sel: string, orFloat = false) =>
    [...document.querySelectorAll(sel)]
      .filter(k.visible)
      .filter((e) => {
        const cs = getComputedStyle(e);
        return cs.textAlign === 'right' || (orFloat && cs.float === 'right');
      })
      .map((e) => k.box(e).r);
  const rightEdges = {
    dates: alignedRight('.date'),
    headerBar: right('.site-header .bar'),
    navLast: right('.site-header nav li:last-child a'),
    footerBar: right('.site-footer .bar'),
    // a pause control counts only where it is right-aligned (on a phone hero caption it sits left, under the caption)
    motion: alignedRight('.motion', true),
    heroes: right('.hero, .fig-wide .fig-media, .fig-wide > .dg-plate', true),
    main: k.main ? [k.r2(k.rect(k.main).right - parseFloat(getComputedStyle(k.main).paddingRight) + k.sx)] : [],
  };
  return { mediaLeft, homeLeft, footer, rightEdges };
}

/** Vertical gaps between sibling blocks in main, between its sections, and from main to the footer. */
export function spacing(k: Toolkit) {
  const gaps: { g: number; a: string; b: string; metaPair: boolean }[] = [];
  // border boxes; absolutely positioned and floated boxes are left out, and the walk stops at text-level elements
  const kids = (e: Element) =>
    [...e.children].filter((c) => {
      const cs = getComputedStyle(c);
      return (
        k.visible(c) && cs.position !== 'absolute' && cs.float === 'none' && !['SCRIPT', 'STYLE'].includes(c.tagName)
      );
    });
  const inline = (e: Element) => getComputedStyle(e).display.startsWith('inline');
  const LEAVES = [
    'P',
    'H1',
    'H2',
    'H3',
    'A',
    'PICTURE',
    'VIDEO',
    'IMG',
    'TIME',
    'BUTTON',
    'SPAN',
    'FIGCAPTION',
    'DATA',
  ];
  const visit = (e: Element) => {
    const ks = kids(e);
    if (['block', 'list-item', 'flow-root'].includes(getComputedStyle(e).display))
      for (let i = 1; i < ks.length; i++) {
        const a = ks[i - 1]!,
          b = ks[i]!;
        if (inline(a) || inline(b)) continue;
        // a gap of 0 is allowed after a date, and between two stacked meta lines
        const metaPair = a.classList.contains('date') || (a.classList.contains('meta') && b.classList.contains('meta'));
        gaps.push({ g: k.r2(k.rect(b).top - k.rect(a).bottom), a: k.label(a), b: k.label(b), metaPair });
      }
    for (const c of ks) if (!LEAVES.includes(c.tagName)) visit(c);
  };
  if (k.main) visit(k.main);
  const sections = [
    ...document.querySelectorAll('main > section, main > .p-sec, main > figure, main > .lead, main > .pn'),
  ];
  const sectionGaps = sections.slice(1).map((s, i) => {
    const prev = sections[i]!;
    return { g: k.r2(k.rect(s).top - k.rect(prev).bottom), a: k.label(prev), b: k.label(s) };
  });
  const foot = document.querySelector('.site-footer');
  const footerGap = k.main && foot ? k.r2(k.rect(foot).top - k.rect(k.main).bottom) : null;
  return { gaps, sectionGaps, footerGap };
}

/** The homepage's project rows and tiles, the portrait, and cap heights against the media tops. */
export function rows(k: Toolkit) {
  // the cap height's top: the line box's centre minus k x the font size (--k-title, --k-name: from the font's metrics)
  const capTop = (el: Element, metric: string) => {
    const cs = getComputedStyle(el);
    return k.rect(el).top + parseFloat(cs.lineHeight) / 2 - parseFloat(k.token(metric)) * parseFloat(cs.fontSize);
  };
  const entries = [...document.querySelectorAll('.projects > .entry')];
  const tiles = entries.map((li) => {
    const t = li.querySelector('.tile')!;
    // a drawn tile (the order strip) is an SVG whose 16:9 viewBox fills its 16:9 frame: the same as cover
    const img = t.querySelector('img'),
      vb = t.querySelector<SVGSVGElement>(':scope > svg')?.viewBox.baseVal;
    const fit = img
      ? getComputedStyle(img).objectFit
      : vb && Math.abs(vb.width / vb.height - t.clientWidth / t.clientHeight) < 0.01
        ? 'cover'
        : 'none';
    const hairline = getComputedStyle(t, '::after').boxShadow;
    return { ...k.box(t), radius: getComputedStyle(t).borderRadius, fit, hairline, row: k.box(li).h };
  });
  const cap = entries.map((li) => ({
    which: li.id,
    d: k.r2(capTop(li.querySelector('.title')!, '--k-title') - k.rect(li.querySelector('.tile')!).top),
  }));
  const pt = document.querySelector('.portrait'),
    nm = document.querySelector('.intro .name');
  let portrait: (Box & { radius: string }) | null = null;
  if (pt && nm && getComputedStyle(pt.parentElement!).display === 'grid') {
    cap.push({ which: 'name', d: k.r2(capTop(nm, '--k-name') - k.rect(pt).top) });
    portrait = { ...k.box(pt), radius: getComputedStyle(pt).borderRadius };
  }
  const rowGaps = entries.slice(1).map((li) => k.r2(k.rect(li).top - k.rect(li.previousElementSibling!).bottom));
  return { tiles, cap, portrait, rowGaps };
}
