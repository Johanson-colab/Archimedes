/** Equation detection uses PDF baselines, not the (font-dependent) DOM span boxes.
 * In particular, a script must never become a seed that grows through prose.
 */
export type EquationRect = { left: number; top: number; width: number; height: number };
export type EquationToken = EquationRect & { text: string; baseline: number; size: number };
type TextItem = { str: string; transform: number[]; width: number; fontName: string };
type TextContent = { items: (TextItem | { type: string })[]; styles: Record<string, { ascent?: number; descent?: number }> };
type Viewport = { transform: number[]; scale: number; width: number; height: number };

export function equationTokens(content: TextContent, viewport: Viewport): EquationToken[] {
  const [a, b, c, d, e, f] = viewport.transform;
  return content.items.flatMap((item) => {
    if (!("str" in item) || !item.str.trim()) return [];
    const t = item.transform;
    // Rotated text needs oriented regions; do not mislabel a vertical axis as math.
    if (Math.abs(b * t[0] + d * t[1]) > Math.abs(a * t[0] + c * t[1]) * .1) return [];
    const size = Math.hypot(a * t[2] + c * t[3], b * t[2] + d * t[3]);
    if (size <= 0) return [];
    const baseline = b * t[4] + d * t[5] + f;
    const ascent = content.styles[item.fontName]?.ascent ?? .85;
    const descent = content.styles[item.fontName]?.descent ?? -.2;
    return [{ text: item.str, left: a * t[4] + c * t[5] + e, top: baseline - size * ascent,
      width: Math.abs(item.width * viewport.scale), height: size * (ascent - descent), baseline, size }];
  });
}

function bounds(tokens: EquationRect[]): EquationRect {
  const left = Math.min(...tokens.map((t) => t.left));
  const top = Math.min(...tokens.map((t) => t.top));
  return { left, top, width: Math.max(...tokens.map((t) => t.left + t.width)) - left,
    height: Math.max(...tokens.map((t) => t.top + t.height)) - top };
}

const relation = /[=≈≠≤≥∼~≃≡∝←→↦]/u;
const mathSymbol = /[∑∏∫√∂∇∈∉∞α-ωΑ-Ω‖⟨⟩⊙⊗]/u;
const proseWord = /\b(?:the|is|are|was|were|this|that|these|those|we|our|with|which|where|denotes|represents|by|of|from|and|in|to|as|at|can|for|each|let)\b/gi;

function isProse(text: string) {
  const words = text.match(/[A-Za-z]{3,}/g) ?? [];
  const stops = text.match(proseWord) ?? [];
  // Mathematical qualifiers such as "for l = 1" and "where x = ..." are fine;
  // full sentences containing inline math are not display equations.
  return stops.length >= 3 || (stops.length >= 1 && words.length >= 4) || words.length >= 8;
}

export function findEquationRects(tokens: EquationToken[], pageWidth: number, pageHeight: number, excluded: EquationRect[] = []): EquationRect[] {
  const visible = tokens.filter((t) => !excluded.some((r) => t.left + t.width / 2 >= r.left && t.left + t.width / 2 <= r.left + r.width && t.baseline >= r.top && t.baseline <= r.top + r.height));
  if (!visible.length) return [];
  // Estimate body size from prose, not from the many tiny subscripts in a formula.
  const sizes = new Map<number, number>();
  for (const t of visible) {
    const weight = (t.text.match(/[A-Za-z]{3,}/g) ?? []).join("").length;
    const size = Math.round(t.size * 10) / 10;
    sizes.set(size, (sizes.get(size) ?? 0) + weight);
  }
  const body = [...sizes].sort((a, b) => b[1] - a[1])[0]?.[0] || visible[0].size;
  // Only split a page into columns when sustained prose supports a gutter.
  // Gaps on a single equation baseline are often fractions or long scripts,
  // not column boundaries.
  const prose = visible.filter((t) => (t.text.match(/[A-Za-z]{3,}/g) ?? []).length >= 4);
  const middle = pageWidth / 2;
  const leftProse = prose.filter((t) => t.left + t.width <= middle + body);
  const rightProse = prose.filter((t) => t.left >= middle - body);
  const crossing = prose.filter((t) => t.left < middle - body && t.left + t.width > middle + body);
  const columns = leftProse.length >= 3 && rightProse.length >= 3 && crossing.length < Math.min(leftProse.length, rightProse.length) * .5;
  const gutter = columns ? (Math.max(...leftProse.map((t) => t.left + t.width)) + Math.min(...rightProse.map((t) => t.left))) / 2 : null;
  type Row = { baseline: number; tokens: EquationToken[]; rect: EquationRect; text: string; prose: boolean };
  const baselines: { baseline: number; tokens: EquationToken[] }[] = [];
  for (const t of visible.filter((t) => t.size >= body * .83).sort((a, b) => a.baseline - b.baseline)) {
    const last = baselines.at(-1);
    if (last && Math.abs(last.baseline - t.baseline) <= body * .22) last.tokens.push(t);
    else baselines.push({ baseline: t.baseline, tokens: [t] });
  }
  const rows: Row[] = baselines.flatMap((line) => {
    const sorted = line.tokens.sort((a, b) => a.left - b.left);
    const groups = gutter === null ? [sorted] : [sorted.filter((t) => t.left < gutter), sorted.filter((t) => t.left >= gutter)].filter((g) => g.length);
    return groups.map((group) => {
      const text = group.map((t) => t.text).join(" ").normalize("NFKC");
      return { baseline: line.baseline, tokens: group, rect: bounds(group), text, prose: isProse(text) };
    });
  });
  const seeds = rows.filter((r) => !r.prose && !/^(?:figure|fig\.?|table)\s*\d+/i.test(r.text) &&
    (relation.test(r.text) || (mathSymbol.test(r.text) && (r.text.match(/[A-Za-z]{3,}/g) ?? []).length <= 2)) && r.rect.width > body * 2);
  // A root/sum in a numerator or denominator belongs to the nearby relation,
  // rather than becoming a competing display row that bisects the fraction.
  const candidates = seeds.filter((r) => relation.test(r.text) || !seeds.some((other) =>
    other !== r && relation.test(other.text) && Math.abs(other.baseline - r.baseline) <= body * 1.5 &&
    other.rect.left < r.rect.left + r.rect.width && other.rect.left + other.rect.width > r.rect.left));

  return candidates.flatMap((row) => {
    // Fixed bands measured from the original baseline. Never expand the search
    // radius using the growing rectangle (the former runaway-merge bug).
    let above = row.baseline - body * 2.1;
    let below = row.baseline + body * 1.25;
    const left = row.rect.left - body * 1.8;
    const right = row.rect.left + row.rect.width + body * 1.8;
    for (const other of rows) {
      if (other === row || other.rect.left >= right || other.rect.left + other.rect.width <= left) continue;
      if (!other.prose && !candidates.includes(other)) continue;
      if (other.baseline < row.baseline - body * .5) above = Math.max(above, (row.baseline + other.baseline) / 2);
      if (other.baseline > row.baseline + body * .5) below = Math.min(below, (row.baseline + other.baseline) / 2);
    }
    const members = visible.filter((t) => t.baseline >= above && t.baseline <= below && t.left >= left && t.left + t.width <= right);
    const rect = bounds(members.length ? members : row.tokens);
    const padding = body * .45;
    const x = Math.max(0, rect.left - padding);
    const y = Math.max(0, rect.top - padding);
    const endX = Math.min(pageWidth, rect.left + rect.width + padding);
    const endY = Math.min(pageHeight, rect.top + rect.height + padding);
    return [{ left: x, top: y, width: endX - x, height: endY - y }];
  }).filter((rect, index, all) => !all.some((other, j) => j < index && Math.abs(other.top - rect.top) < body * .4 && Math.abs(other.left - rect.left) < body));
}
