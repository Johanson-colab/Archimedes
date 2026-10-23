/** Paints PDF.js text-layer spans for the currently active paper search. */
export function normalizePdfSearchText(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase()
    .replace(/[\s\u00ad\u200b]/g, "")
    .replace(/[‐‑‒–—]/g, "-");
}

export function applyPdfSearchHighlights(textLayer: HTMLElement, query: string) {
  const spans = Array.from(textLayer.querySelectorAll<HTMLSpanElement>("span"));
  for (const span of spans) span.classList.remove("arch-pdf-search-match");
  const needle = normalizePdfSearchText(query);
  if (!needle) return;
  const ranges: Array<{ span: HTMLSpanElement; start: number; end: number }> = [];
  let cursor = 0;
  for (const span of spans) {
    const length = normalizePdfSearchText(span.textContent || "").length;
    ranges.push({ span, start: cursor, end: cursor + length });
    cursor += length;
  }
  const source = ranges.map(({ span }) => normalizePdfSearchText(span.textContent || "")).join("");
  for (let match = source.indexOf(needle); match >= 0; match = source.indexOf(needle, match + Math.max(1, needle.length))) {
    const end = match + needle.length;
    for (const range of ranges) if (range.start < end && range.end > match) range.span.classList.add("arch-pdf-search-match");
  }
}
