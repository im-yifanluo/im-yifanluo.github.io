// measure() parts about what a page holds: links, images and videos; the diagrams; the Awards list.
// Each part runs in the page with the shared toolkit and uses nothing else from outside its own body.
import type { Toolkit } from './toolkit';

/** Links and their target sizes, images, videos, headings, and the page's scroll size. */
export function content(k: Toolkit) {
  // a project title's link is stretched over its whole row
  const links = [...document.querySelectorAll('a[href]')]
    .filter((a) => k.visible(a) && a.getAttribute('tabindex') !== '-1' && !a.closest('.skip'))
    .map((a) => {
      const r = k.rect(a.matches('.entry .title a') ? a.closest('.entry')! : a);
      const inline = !!a.closest('.prose') && !a.closest('.links');
      return { href: a.getAttribute('href'), inline, h: k.r2(r.height), w: k.r2(r.width) };
    });
  const imgs = [...document.querySelectorAll('img')].map((i) => ({
    wh: i.hasAttribute('width') && i.hasAttribute('height'),
    alt: i.hasAttribute('alt'),
    loading: i.loading,
    fetchpriority: i.fetchPriority,
    top: k.r2(k.rect(i).top + k.sy),
    hidden: !!i.closest('[aria-hidden="true"]'),
    alt0: i.alt === '',
  }));
  const videos = [...document.querySelectorAll('video')].map((v) => ({
    muted: v.muted && v.hasAttribute('muted'),
    loop: v.loop,
    pi: v.hasAttribute('playsinline'),
    preload: v.getAttribute('preload'),
    wh: v.hasAttribute('width') && v.hasAttribute('height'),
    autoplay: v.autoplay,
  }));
  const { scrollWidth, clientWidth, scrollHeight: pageHeight } = document.documentElement;
  return {
    links,
    imgs,
    videos,
    h1: document.querySelectorAll('h1').length,
    scrollWidth,
    clientWidth,
    pageHeight,
  };
}

/** Each diagram: grid or list, whether every edge is drawn, and anything painted outside its plate. */
export function diagrams(k: Toolkit) {
  // the drawn grid only where the figure is >= 840 px wide (and JS runs), the list otherwise; a detail clipped for
  // screen readers does not paint
  const dg = [...document.querySelectorAll('.dg-fig')].map((f) => {
    const plate = k.rect(f.querySelector('.dg-plate')!),
      grid = f.querySelector('.dg-grid');
    const clipped = (e: Element) => {
      for (let x: Element | null = e; x && x !== f; x = x.parentElement)
        if (getComputedStyle(x).clipPath !== 'none') return true;
      return false;
    };
    const over = [...f.querySelectorAll('.dg-plate *')]
      .filter((e) => {
        if (clipped(e) || e.closest('.sr')) return false;
        const r = k.rect(e),
          cs = getComputedStyle(e);
        const outside = r.right > plate.right + 0.5 || r.left < plate.left - 0.5;
        return r.width > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' && outside;
      })
      .map(k.label);
    return {
      id: f.id,
      kind: grid ? ('flow' as const) : ('bars' as const),
      figW: k.r2(k.rect(f).width),
      grid: !!grid && getComputedStyle(grid).display === 'grid',
      drawn: f.classList.contains('is-drawn'),
      nodes: f.querySelectorAll('.dg-node').length,
      undrawn: [...f.querySelectorAll('.dg-e .ln')].filter((e) => !/^M/.test(e.getAttribute('d') ?? '')).length,
      over,
      plateR: k.r2(plate.right),
      vw: innerWidth,
    };
  });
  return { dg };
}

/** The Awards list: the groups shown, the <details> holding the rest, its summary and the gaps around it. */
export function awards(k: Toolkit) {
  const more = document.querySelector<HTMLDetailsElement>('#awards .awards-more');
  if (!more) return { awards: null };
  const sum = more.querySelector<HTMLElement>(':scope > summary')!,
    shown = [...document.querySelectorAll('#awards > .award-group')],
    hid = [...more.querySelectorAll(':scope > .award-group')],
    rows = [...document.querySelectorAll('#awards li')];
  const lastShown = shown.at(-1)!;
  const tops = (els: Element[]) => els.map((e) => k.r2(k.rect(e).top + k.sy));
  const groupLabel = (g: Element) => g.querySelector('.group')?.textContent!.trim() ?? '';
  // the tap area: what a tap 21 px above and below the line's centre hits (the summary on touch, through its ::after)
  const tap = () => {
    const y0 = scrollY;
    scrollTo({ top: k.rect(sum).top + scrollY - innerHeight / 2, behavior: 'instant' });
    const r = k.rect(sum),
      cx = r.left + r.width / 2,
      cy = r.top + r.height / 2;
    const hit = (y: number) => {
      const e = document.elementFromPoint(cx, y);
      return !!e && (e === sum || sum.contains(e));
    };
    const t = { h: k.r2(r.height), up: hit(cy - 21), down: hit(cy + 21) };
    scrollTo({ top: y0, behavior: 'instant' });
    return t;
  };
  const gapsOpen = more.open
    ? [
        k.r2(k.rect(hid[0]!).top - k.rect(lastShown).bottom),
        ...hid.slice(1).map((g, i) => k.r2(k.rect(g).top - k.rect(hid[i]!).bottom)),
        k.r2(k.rect(sum).top - k.rect(hid.at(-1)!).bottom),
      ]
    : [];
  const sumBelowRows = more.open
    ? k.rect(sum).top >= Math.max(...rows.map((r) => k.rect(r).bottom))
    : k.rect(sum).top >= k.rect(lastShown).bottom;
  return {
    awards: {
      open: more.open,
      rows: rows.length,
      visibleRows: rows.filter(k.visible).length,
      shownRows: shown.reduce((n, g) => n + g.querySelectorAll('li').length, 0),
      label: sum.innerText.replace(/\s+/g, ' ').trim(),
      sumVisible: k.visible(sum),
      sumLeft: k.r2(k.rect(sum).left + k.sx),
      gapShownToMore: k.r2(k.rect(more).top - k.rect(lastShown).bottom),
      gapsOpen,
      sumBelowRows,
      above: tops([document.getElementById('awards-h')!, ...shown.flatMap((g) => [...g.querySelectorAll('li')])]),
      shownGroups: shown.map(groupLabel),
      hiddenGroups: hid.map(groupLabel),
      tap: tap(),
    },
  };
}
