/** Plain text cut at a word boundary (meta descriptions): never splits a number, adds "…" when shortened. */
export function summarize(text: string, max = 155): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const at = cut.lastIndexOf(' ');
  return `${(at > max * 0.5 ? cut.slice(0, at) : cut).replace(/[\s,;:·–—-]+$/, '')}…`;
}
