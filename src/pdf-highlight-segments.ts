export type PdfHighlightSegmentInput = {
  quote: string;
  color: string;
  note?: string | null;
};

export type PdfHighlightSegment = {
  spanIndex: number;
  start: number;
  end: number;
  color: string;
  note: boolean;
  noteText: string;
};

export const PDF_HIGHLIGHT_COLORS: Record<string, string> = {
  yellow: "rgba(255, 219, 82, .52)",
  red: "rgba(242, 116, 106, .42)",
  blue: "rgba(94, 163, 238, .40)",
  green: "rgba(90, 191, 136, .42)",
  pink: "rgba(235, 126, 180, .40)",
};

function compactText(value: string) {
  return value.replace(/\s+/g, "");
}

/**
 * PDF.js places text in absolutely positioned spans. Painting a whole span for
 * a partial quote makes the highlight run to the end of the line/column, so map
 * the quote back to exact character offsets inside each touched span instead.
 */
export function buildPdfHighlightSegments(
  spanTexts: string[],
  highlights: PdfHighlightSegmentInput[],
): PdfHighlightSegment[] {
  const positions: Array<{ spanIndex: number; offset: number }> = [];
  let source = "";

  for (let spanIndex = 0; spanIndex < spanTexts.length; spanIndex += 1) {
    const text = spanTexts[spanIndex] || "";
    for (let offset = 0; offset < text.length; offset += 1) {
      if (/\s/.test(text[offset])) continue;
      source += text[offset];
      positions.push({ spanIndex, offset });
    }
  }

  if (!source) return [];

  const spanRanges: Array<{ spanIndex: number; start: number; end: number }> = [];
  let cursor = 0;
  for (let spanIndex = 0; spanIndex < spanTexts.length; spanIndex += 1) {
    const length = compactText(spanTexts[spanIndex] || "").length;
    spanRanges.push({ spanIndex, start: cursor, end: cursor + length });
    cursor += length;
  }

  const segments: PdfHighlightSegment[] = [];
  for (const highlight of highlights) {
    const quote = compactText(highlight.quote || "");
    if (!quote) continue;
    let start = source.indexOf(quote);
    while (start >= 0) {
      const end = start + quote.length;
      for (const range of spanRanges) {
        if (range.start >= end || range.end <= start || range.end === range.start) continue;
        const localStart = Math.max(start, range.start) - range.start;
        const localEnd = Math.min(end, range.end) - range.start;
        const first = positions[range.start + localStart];
        const last = positions[range.start + localEnd - 1];
        if (!first || !last || first.spanIndex !== range.spanIndex || last.spanIndex !== range.spanIndex) continue;
        segments.push({
          spanIndex: range.spanIndex,
          start: first.offset,
          end: last.offset + 1,
          color: highlight.color,
          note: Boolean(highlight.note),
          noteText: highlight.note?.trim() || "",
        });
      }
      // Keep the first occurrence as the canonical paint target. Repeating the
      // same quote later would make one saved highlight paint multiple places.
      break;
    }
  }
  return segments;
}
