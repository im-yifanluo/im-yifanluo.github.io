// Printing shows every <details> (the Awards "Show all" rows). CSS does it where ::details-content exists; elsewhere a
// closed one opens for the print and closes after.

export function initPrint(): void {
  if (CSS.supports('selector(::details-content)')) return;
  let opened: HTMLDetailsElement[] = [];
  addEventListener('beforeprint', () => {
    opened = [...document.querySelectorAll<HTMLDetailsElement>('details:not([open])')];
    for (const d of opened) d.open = true;
  });
  addEventListener('afterprint', () => {
    for (const d of opened) d.open = false;
    opened = [];
  });
}
