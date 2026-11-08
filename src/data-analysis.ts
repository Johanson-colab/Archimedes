export type Dataset = { headers: string[]; rows: string[][] };

export function isMissing(value: string) {
  return /^(?:|NA|N\/A|NaN|null)$/i.test(value.trim());
}

/** RFC-style delimited text, including quoted newlines and escaped quotes. */
export function parseDelimited(text: string, delimiter: string): Dataset {
  const input = text.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, closed = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === '"' && cell === "" && !closed) quoted = true;
    else if (char === delimiter) { row.push(cell); if (row.length >= 200) throw new Error("Dataset is too large"); cell = ""; closed = false; }
    else if (char === "\n" || char === "\r") {
      row.push(cell); records.push(row); row = []; cell = ""; closed = false;
      if (records.length > 100001) throw new Error("Dataset is too large");
      if (char === "\r" && input[i + 1] === "\n") i++;
    } else if (closed || char === '"') throw new Error("Malformed quoted field");
    else cell += char;
  }
  if (quoted) throw new Error("Unclosed quoted field");
  if (cell !== "" || row.length || closed) { row.push(cell); records.push(row); }
  if (!records.length) throw new Error("Empty file");
  const headers = records.shift()!.map((name, i) => name.trim() || `Column ${i + 1}`);
  if (headers.length > 200 || records.length > 100000) throw new Error("Dataset is too large");
  if (records.some((record) => record.length !== headers.length)) throw new Error("Inconsistent column count");
  if (!records.length) throw new Error("No data rows");
  return { headers, rows: records };
}

export function numericValue(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
}

export function summarizeColumn(rows: string[][], index: number) {
  let missing = 0, invalid = 0;
  const values: number[] = [];
  for (const row of rows) {
    const value = row[index] ?? "";
    if (isMissing(value)) missing++;
    else { const number = numericValue(value); if (number === null) invalid++; else values.push(number); }
  }
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  const median = values.length ? values.length % 2 ? values[middle] : values[middle - 1] / 2 + values[middle] / 2 : null;
  const mean = values.length ? values.reduce((total, value) => total + value / values.length, 0) : null;
  return { missing, invalid, count: values.length, min: values[0] ?? null, max: values.at(-1) ?? null, mean, median };
}

export type ColumnProfile = { index: number; kind: "number" | "date" | "text"; missing: number; distinct: number; common: { value: string; count: number }[] };

export function dateValue(value: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const date = Date.parse(`${value}T00:00:00Z`);
  return Number.isFinite(date) && new Date(date).toISOString().slice(0, 10) === value ? date : null;
}

export function profileDataset(dataset: Dataset): ColumnProfile[] {
  return dataset.headers.map((_, index) => {
    let missing = 0, numbers = 0, dates = 0;
    const counts = new Map<string, number>();
    for (const row of dataset.rows) {
      const value = row[index];
      if (isMissing(value)) { missing++; continue; }
      counts.set(value, (counts.get(value) ?? 0) + 1);
      if (numericValue(value) !== null) numbers++;
      if (dateValue(value) !== null) dates++;
    }
    const valid = dataset.rows.length - missing;
    return { index, kind: valid && numbers === valid ? "number" : valid && dates === valid ? "date" : "text", missing, distinct: counts.size, common: [...counts].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([value, count]) => ({ value, count })) };
  });
}

export type PlotConfig = { type: "scatter" | "bar" | "line" | "histogram"; x: number; y: number; group: number };
export type PlotPoint = { x: number; y: number; label: string; group: string; count?: number; row?: number };
export type PlotResult = { points: PlotPoint[]; valid: number; omittedGroups: number; correlation: number | null };

/** Calculations use every valid row; only the scatter/line display is bounded. */
export function buildPlot(dataset: Dataset, config: PlotConfig): PlotResult {
  const { type, x, y, group } = config;
  const result: PlotResult = { points: [], valid: 0, omittedGroups: 0, correlation: null };
  if (y < 0 || y >= dataset.headers.length || x < 0 || x >= dataset.headers.length) return result;
  if (type === "bar") {
    const groups = new Map<string, { total: number; count: number }>();
    for (const row of dataset.rows) {
      const value = numericValue(row[y]);
      if (isMissing(row[x]) || value === null) continue;
      const entry = groups.get(row[x]) ?? { total: 0, count: 0 };
      entry.total += value; entry.count++; groups.set(row[x], entry); result.valid++;
    }
    const entries = [...groups].sort((a, b) => b[1].count - a[1].count);
    result.omittedGroups = Math.max(0, entries.length - 30);
    result.points = entries.slice(0, 30).map(([label, value], i) => ({ x: i, y: value.total / value.count, label, count: value.count, group: label }));
    return result;
  }
  if (type === "histogram") {
    const values = dataset.rows.map((row) => numericValue(row[y])).filter((value): value is number => value !== null);
    result.valid = values.length;
    if (!values.length) return result;
    const min = values.reduce((a, b) => Math.min(a, b)), max = values.reduce((a, b) => Math.max(a, b));
    const bins = min === max ? 1 : Math.min(20, Math.max(5, Math.ceil(Math.sqrt(values.length))));
    const width = (max - min || 1) / bins;
    const counts = Array<number>(bins).fill(0);
    for (const value of values) counts[Math.min(bins - 1, Math.floor((value - min) / width))]++;
    result.points = counts.map((count, i) => ({ x: min + (i + 0.5) * width, y: count, label: `${(min + i * width).toPrecision(4)} – ${(min + (i + 1) * width).toPrecision(4)}`, group: "", count }));
    return result;
  }
  const all: PlotPoint[] = [];
  for (let i = 0; i < dataset.rows.length; i++) {
    const row = dataset.rows[i];
    const xv = numericValue(row[x]) ?? (type === "line" ? dateValue(row[x]) : null);
    const yv = numericValue(row[y]);
    if (xv === null || yv === null) continue;
    all.push({ x: xv, y: yv, label: row[x], group: group >= 0 && !isMissing(row[group]) ? row[group] : "", row: i + 1 });
  }
  result.valid = all.length;
  if (type === "line") all.sort((a, b) => a.x - b.x);
  if (type === "scatter" && all.length > 1) {
    const mx = all.reduce((sum, point) => sum + point.x / all.length, 0), my = all.reduce((sum, point) => sum + point.y / all.length, 0);
    let xx = 0, yy = 0, xy = 0;
    for (const point of all) { xx += (point.x - mx) ** 2; yy += (point.y - my) ** 2; xy += (point.x - mx) * (point.y - my); }
    result.correlation = xx && yy ? Math.max(-1, Math.min(1, xy / Math.sqrt(xx * yy))) : null;
  }
  const groups = [...new Set(all.map((point) => point.group))];
  const accepted = new Set(groups.slice(0, 6));
  result.omittedGroups = Math.max(0, groups.length - accepted.size);
  const filtered = all.filter((point) => accepted.has(point.group));
  // Even spacing retains the extent of a time series instead of showing only its first rows.
  result.points = filtered.length > 2000 ? Array.from({ length: 2000 }, (_, i) => filtered[Math.floor(i * (filtered.length - 1) / 1999)]) : filtered;
  return result;
}
