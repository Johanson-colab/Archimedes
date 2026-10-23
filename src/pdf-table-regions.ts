export type PdfTableRect = { left: number; top: number; width: number; height: number };
export type PdfTableFragment = PdfTableRect & { text: string };
export type PdfTableRule = { left: number; right: number; y: number };

const right = (rect: PdfTableRect) => rect.left + rect.width;
const bottom = (rect: PdfTableRect) => rect.top + rect.height;

function union(rects: PdfTableRect[]): PdfTableRect {
  const left = Math.min(...rects.map((rect) => rect.left));
  const top = Math.min(...rects.map((rect) => rect.top));
  return { left, top, width: Math.max(...rects.map(right)) - left, height: Math.max(...rects.map(bottom)) - top };
}

function pad(rect: PdfTableRect, padding: number, pageWidth: number, pageHeight: number): PdfTableRect {
  const left = Math.max(0, rect.left - padding);
  const top = Math.max(0, rect.top - padding);
  const endX = Math.min(pageWidth, right(rect) + padding);
  const endY = Math.min(pageHeight, bottom(rect) + padding);
  return { left, top, width: endX - left, height: endY - top };
}

/** Extract continuous dark horizontal strokes (booktabs/grid rules), not text. */
export function findPdfHorizontalRules(pixels: Uint8ClampedArray, imageWidth: number, imageHeight: number, scaleX: number, scaleY: number, pageWidth: number): PdfTableRule[] {
  const minRun = Math.max(1, Math.round(pageWidth * .34 * scaleX));
  const rows: PdfTableRule[] = [];
  for (let y = 0; y < imageHeight; y += 1) {
    let start = 0;
    let run = 0;
    let bestStart = 0;
    let bestLength = 0;
    for (let x = 0; x < imageWidth; x += 1) {
      const offset = (y * imageWidth + x) * 4;
      const darkness = (pixels[offset] + pixels[offset + 1] + pixels[offset + 2]) / 3;
      if (pixels[offset + 3] > 30 && darkness < 160) {
        if (!run) start = x;
        run += 1;
      } else { if (run > bestLength) { bestStart = start; bestLength = run; } run = 0; }
    }
    if (run > bestLength) { bestStart = start; bestLength = run; }
    if (bestLength >= minRun) rows.push({ left: bestStart / scaleX, right: (bestStart + bestLength) / scaleX, y: y / scaleY });
  }
  const merged: Array<PdfTableRule & { count: number }> = [];
  for (const row of rows) {
    const previous = merged.at(-1);
    if (previous && row.y - previous.y <= Math.max(1.8 / scaleY, 1.5)) {
      previous.left = Math.min(previous.left, row.left);
      previous.right = Math.max(previous.right, row.right);
      previous.y = (previous.y * previous.count + row.y) / (previous.count + 1);
      previous.count += 1;
    } else merged.push({ ...row, count: 1 });
  }
  return merged.map(({ count: _count, ...rule }) => rule);
}

function ruleGroup(caption: PdfTableRect, rules: PdfTableRule[], direction: "above" | "below", pageHeight: number) {
  const ordered = rules
    .filter((rule) => direction === "below" ? rule.y > bottom(caption) + 2 : rule.y < caption.top - 2)
    .sort((first, second) => direction === "below" ? first.y - second.y : second.y - first.y);
  const maxGap = Math.max(pageHeight * .42, caption.height * 24);
  const group: PdfTableRule[] = [];
  for (const rule of ordered) {
    if (group.length && Math.abs(rule.y - group.at(-1)!.y) > maxGap) break;
    group.push(rule);
  }
  if (group.length < 2) return null;
  const spanTop = Math.min(...group.map((rule) => rule.y));
  const spanBottom = Math.max(...group.map((rule) => rule.y));
  const distance = direction === "below" ? spanTop - bottom(caption) : caption.top - spanBottom;
  const averageWidth = group.reduce((sum, rule) => sum + rule.right - rule.left, 0) / group.length;
  return { group, distance, score: group.length * 1_000 + averageWidth - distance * 4 };
}

/** Uses the first and last rules of the caption-adjacent table, never caption heuristics. */
export function findRuledTableRect(caption: PdfTableRect, rules: PdfTableRule[], pageWidth: number, pageHeight: number): PdfTableRect | null {
  const candidates = ([ruleGroup(caption, rules, "above", pageHeight), ruleGroup(caption, rules, "below", pageHeight)]).filter(Boolean) as Array<NonNullable<ReturnType<typeof ruleGroup>>>;
  const selected = candidates.sort((first, second) => second.score - first.score)[0];
  if (!selected) return null;
  const rect: PdfTableRect = {
    left: Math.min(...selected.group.map((rule) => rule.left)), top: Math.min(...selected.group.map((rule) => rule.y)),
    width: Math.max(...selected.group.map((rule) => rule.right)) - Math.min(...selected.group.map((rule) => rule.left)),
    height: Math.max(...selected.group.map((rule) => rule.y)) - Math.min(...selected.group.map((rule) => rule.y)),
  };
  return pad(rect, 5, pageWidth, pageHeight);
}

function fragmentRows(fragments: PdfTableFragment[]) {
  const medianHeight = [...fragments].sort((a, b) => a.height - b.height)[Math.floor(fragments.length / 2)]?.height || 10;
  const rows: Array<{ center: number; fragments: PdfTableFragment[] }> = [];
  for (const fragment of [...fragments].sort((a, b) => a.top - b.top || a.left - b.left)) {
    const center = fragment.top + fragment.height / 2;
    const row = rows.at(-1);
    if (row && Math.abs(row.center - center) <= Math.max(3, medianHeight * .6)) row.fragments.push(fragment);
    else rows.push({ center, fragments: [fragment] });
  }
  return { rows, medianHeight };
}

/** Fallback for borderless tables: repeated, wide multi-cell text rows. */
export function findTextTableRect(caption: PdfTableRect, fragments: PdfTableFragment[], pageWidth: number, pageHeight: number): PdfTableRect | null {
  const { rows, medianHeight } = fragmentRows(fragments);
  const dense = rows.map((row) => ({ ...row, rect: union(row.fragments) }))
    .filter((row) => row.fragments.length >= 4 && row.rect.width >= pageWidth * .32);
  const evaluate = (direction: "above" | "below") => {
    const candidates = dense.filter((row) => direction === "below" ? row.rect.top >= bottom(caption) + 2 : bottom(row.rect) <= caption.top - 2)
      .sort((a, b) => direction === "below" ? a.center - b.center : b.center - a.center);
    const cluster: typeof candidates = [];
    for (const row of candidates) {
      if (cluster.length && Math.abs(row.center - cluster.at(-1)!.center) > Math.max(medianHeight * 2.2, pageHeight * .028)) break;
      cluster.push(row);
    }
    if (cluster.length < 2) return null;
    const rect = union(cluster.map((row) => row.rect));
    const distance = direction === "below" ? rect.top - bottom(caption) : caption.top - bottom(rect);
    return { rect: pad(rect, 6, pageWidth, pageHeight), score: cluster.length * 1_000 + rect.width - distance * 4 };
  };
  const selected = [evaluate("above"), evaluate("below")].filter(Boolean).sort((a, b) => b!.score - a!.score)[0];
  return selected?.rect ?? null;
}
