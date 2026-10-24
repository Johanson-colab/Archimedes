export type PdfVisualRectLike = { left: number; top: number; width: number; height: number };
export type PdfVisualTextLine = PdfVisualRectLike & { text: string };

export type PdfVisualRegionLike = {
  rect: PdfVisualRectLike;
  kind: "equation" | "table" | "figure";
  source: "caption" | "equation" | "image";
};

const ENGLISH_CAPTION = /^(figure|fig\.?|table)\s*\d+[a-z]?\s*(?::|\.|\||｜|$)/i;
const CHINESE_CAPTION = /^(图|表)\s*[一二三四五六七八九十百零\d]+\s*(?::|：|\.|。|\||｜|$)/;

/**
 * Recognises an actual caption label, rather than an in-prose reference such as
 * “Figure 5 compares …”. Requiring caption punctuation (or the bare label and
 * number) is important on two-column papers where references often begin a line.
 */
export function pdfCaptionKind(text: string): "figure" | "table" | null {
  const normalized = text.replace(/\s+/g, " ").trim();
  const english = normalized.match(ENGLISH_CAPTION);
  if (english) return english[1].toLowerCase() === "table" ? "table" : "figure";
  const chinese = normalized.match(CHINESE_CAPTION);
  if (chinese) return chinese[1] === "表" ? "table" : "figure";
  return null;
}

function rectArea(rect: PdfVisualRectLike) {
  return Math.max(0, rect.width) * Math.max(0, rect.height);
}

function rectIntersection(first: PdfVisualRectLike, second: PdfVisualRectLike) {
  const left = Math.max(first.left, second.left);
  const top = Math.max(first.top, second.top);
  const right = Math.min(first.left + first.width, second.left + second.width);
  const bottom = Math.min(first.top + first.height, second.top + second.height);
  return Math.max(0, right - left) * Math.max(0, bottom - top);
}

/** Reject caption guesses that mostly cover a paragraph instead of a visual. */
export function isDensePdfProse(lines: PdfVisualTextLine[], rect: PdfVisualRectLike) {
  const longLines = lines
    .filter((line) => rectIntersection(line, rect) > 0)
    .filter((line) => line.text.replace(/\s+/g, " ").trim().length >= 30)
    .filter((line) => line.width >= Math.min(rect.width * .48, 180))
    .sort((first, second) => first.top - second.top);
  let run = 0;
  let previous: PdfVisualTextLine | null = null;
  for (const line of longLines) {
    const gap = previous ? line.top - (previous.top + previous.height) : Number.POSITIVE_INFINITY;
    const aligned = previous ? Math.abs(line.left - previous.left) <= Math.max(20, rect.width * .09) : false;
    run = previous && gap <= Math.max(14, line.height * 1.8) && aligned ? run + 1 : 1;
    if (run >= 4) return true;
    previous = line;
  }
  return false;
}

/**
 * Figure and table candidates can overlap when chart grid lines look like table
 * rules. Prefer operator-backed image regions before heuristic caption regions.
 * Equations stay independent because they can legitimately sit inside a figure.
 */
export function mergePdfVisualRegions<T extends PdfVisualRegionLike>(regions: T[]) {
  const priority = (region: T) => region.source === "equation" ? 3 : region.source === "image" ? 2 : 1;
  const accepted: T[] = [];
  for (const region of [...regions].sort((first, second) => priority(second) - priority(first) || rectArea(first.rect) - rectArea(second.rect))) {
    const isDuplicate = accepted.some((other) => {
      if (other.kind === "equation" || region.kind === "equation") return other.kind === region.kind
        && rectIntersection(other.rect, region.rect) / Math.max(1, Math.min(rectArea(other.rect), rectArea(region.rect))) > .72;
      return rectIntersection(other.rect, region.rect) / Math.max(1, Math.min(rectArea(other.rect), rectArea(region.rect))) > .64;
    });
    if (!isDuplicate) accepted.push(region);
  }
  return accepted;
}
