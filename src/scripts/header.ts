// The sticky header's states, as attributes that global.css reads. IntersectionObservers only, no scroll listener.
//   html[data-scrolled]  frosted glass and a hairline, once anything has scrolled under the header
//   html[data-name]      homepage: the name in the bar, once the h1 has left the glass too
//   a[aria-current]      the nav item of the section being read

/** The reading line, as a fraction of the viewport height: a section is current once its top has passed it. */
const READING_LINE = 0.41;

/** Sets data-scrolled while a 1 px sentinel at the top of the page is out of view. */
function watchScroll(root: HTMLElement): void {
  const sentinel = document.createElement('div');
  sentinel.setAttribute('aria-hidden', 'true');
  sentinel.style.cssText = 'position:absolute;top:0;left:0;width:1px;height:1px;pointer-events:none';
  document.body.prepend(sentinel);
  new IntersectionObserver(([e]) => root.toggleAttribute('data-scrolled', !e.isIntersecting)).observe(sentinel);
}

/** Homepage: the name arrives in the bar only once the h1 is above the viewport (never two names in the bar). */
function watchName(root: HTMLElement, header: HTMLElement): void {
  const h1 = document.getElementById('name');
  const nameOnScroll = header.querySelector<HTMLElement>('.hn');
  if (!h1 || !nameOnScroll) return;
  new IntersectionObserver(([e]) =>
    root.toggleAttribute('data-name', !e.isIntersecting && e.boundingClientRect.bottom <= 0),
  ).observe(h1);
}

/**
 * Marks the nav item of the last section whose top has passed the reading line (none above the first). The observer
 * watches a 1 %-tall band just above that line and only says when to look again.
 */
function watchSections(header: HTMLElement): void {
  const links = [...header.querySelectorAll<HTMLAnchorElement>('nav a[href^="#"]')];
  const linkById = new Map(links.map((a) => [a.hash.slice(1), a]));
  const sections = [...document.querySelectorAll<HTMLElement>('main section[id]')];
  if (!linkById.size || !sections.length) return;
  const markCurrent = () => {
    const line = innerHeight * READING_LINE;
    let current: HTMLElement | null = null;
    for (const s of sections) if (s.getBoundingClientRect().top <= line) current = s;
    const currentLink = current && linkById.get(current.id);
    for (const a of links) {
      if (a === currentLink) a.setAttribute('aria-current', 'location');
      else a.removeAttribute('aria-current');
    }
  };
  const observer = new IntersectionObserver(markCurrent, { rootMargin: '-40% 0px -59% 0px' });
  for (const s of sections) observer.observe(s);
}

export function initHeader(): void {
  const root = document.documentElement;
  const header = document.querySelector<HTMLElement>('.site-header')!; // BaseLayout always renders it
  watchScroll(root);
  watchName(root, header);
  watchSections(header);
}
