// Lazy posters that are still loading fade in over the surface (global.css img.fade). Never the eager LCP image, and
// never one that has already loaded.

export function initPosterFade(): void {
  for (const img of document.querySelectorAll<HTMLImageElement>('.tile img, .hero img, .fig-media img')) {
    if (img.loading === 'eager' || (img.complete && img.naturalWidth)) continue;
    img.classList.add('fade');
    const show = () => img.classList.add('in');
    img.addEventListener('load', show, { once: true });
    img.addEventListener('error', show, { once: true });
  }
}
