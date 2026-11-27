export type Dataset = { headers: string[]; rows: string[][] };

import { isMissing, numericValue, parseDelimited, summarizeColumn } from "../shared/analysis-dataset.mjs";
export { isMissing, numericValue, parseDelimited, summarizeColumn };

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

export function groupPlotPoints(points: PlotPoint[]) {
  const groups = new Map<string, PlotPoint[]>();
  for (const point of points) {
    const group = groups.get(point.group) ?? [];
    group.push(point);
    groups.set(point.group, group);
  }
  return groups;
}

function sampleEvenly(points: PlotPoint[], count: number) {
  if (points.length <= count) return points;
  return Array.from({ length: count }, (_, i) => points[Math.floor(i * (points.length - 1) / (count - 1))]);
}

function sampleLinePoints(points: PlotPoint[], limit: number) {
  const groups = [...groupPlotPoints(points).values()];
  // Reserve each series' endpoints, then allocate the remaining positions by group size.
  const reserved = groups.reduce((total, group) => total + Math.min(2, group.length), 0);
  const sampled = new Set<PlotPoint>();
  const remainingPoints = points.length - reserved;
  const remainingSlots = limit - reserved;
  let seen = 0;
  let allocated = 0;
  for (const group of groups) {
    const endpoints = Math.min(2, group.length);
    seen += group.length - endpoints;
    const next = Math.floor(seen * remainingSlots / remainingPoints);
    for (const point of sampleEvenly(group, endpoints + next - allocated)) sampled.add(point);
    allocated = next;
  }
  return points.filter((point) => sampled.has(point));
}

function scatterCorrelation(points: PlotPoint[]) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const { x, y } of points) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x);
    minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  if (minX === maxX || minY === maxY) return null;

  // Center before scaling to keep differences when values share a large offset.
  // Halving the endpoints keeps the midpoint finite even at the numeric limits.
  const originX = minX / 2 + maxX / 2, originY = minY / 2 + maxY / 2;
  const scaleX = Math.max(maxX - originX, originX - minX);
  const scaleY = Math.max(maxY - originY, originY - minY);
  let sumX = 0, sumY = 0;
  for (const { x, y } of points) {
    sumX += (x - originX) / scaleX;
    sumY += (y - originY) / scaleY;
  }
  const meanX = sumX / points.length, meanY = sumY / points.length;
  let xx = 0, yy = 0, xy = 0;
  for (const { x, y } of points) {
    const dx = (x - originX) / scaleX - meanX;
    const dy = (y - originY) / scaleY - meanY;
    xx += dx * dx;
    yy += dy * dy;
    xy += dx * dy;
  }
  return Math.max(-1, Math.min(1, xy / Math.sqrt(xx * yy)));
}

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
  if (type === "scatter" && all.length > 1) result.correlation = scatterCorrelation(all);
  const groups = [...new Set(all.map((point) => point.group))];
  const accepted = new Set(groups.slice(0, 6));
  result.omittedGroups = Math.max(0, groups.length - accepted.size);
  const filtered = all.filter((point) => accepted.has(point.group));
  const limit = 2000;
  result.points = type === "line" && accepted.size > 1 && filtered.length > limit
    ? sampleLinePoints(filtered, limit) : sampleEvenly(filtered, limit);
  return result;
}
