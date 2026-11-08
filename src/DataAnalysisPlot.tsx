import { forwardRef, memo, useEffect, useRef, useState } from "react";
import { type Dataset, type PlotConfig, type PlotResult } from "./data-analysis";

export function formatAnalysisNumber(value: number | null) {
  if (value === null || !Number.isFinite(value)) return "—";
  return Math.abs(value) >= 1000000 || (value !== 0 && Math.abs(value) < 0.001)
    ? value.toExponential(2) : Number(value.toPrecision(4)).toLocaleString();
}

function numericDomain(low: number, high: number) {
  if (low === high) { low -= Math.abs(low) * .1 || 1; high += Math.abs(high) * .1 || 1; }
  const rough = (high - low) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const fraction = rough / magnitude;
  const step = (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10) * magnitude;
  const min = Math.floor(low / step) * step, max = Math.ceil(high / step) * step;
  return { min, max, ticks: Array.from({ length: Math.round((max - min) / step) + 1 }, (_, i) => min + i * step) };
}

export const DataAnalysisPlot = memo(forwardRef<SVGSVGElement, { dataset: Dataset; config: PlotConfig; plot: PlotResult; dateAxis: boolean; t: (key: string) => string }>(function DataAnalysisPlot({ dataset, config, plot, dateAxis, t }, ref) {
  const wrapper = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(960);
  useEffect(() => {
    if (!wrapper.current || typeof ResizeObserver === "undefined") return;
    const node = wrapper.current;
    const observer = new ResizeObserver(() => setWidth(Math.max(280, node.clientWidth)));
    observer.observe(node);
    return () => observer.disconnect();
  }, [plot.points.length > 0]);
  const { points } = plot;
  if (!points.length) return <div className="analysis-no-plot">{t("Choose numeric fields to create a chart. Text columns can still be explored in the data table.")}</div>;
  const bar = config.type === "bar";
  const columns = bar || config.type === "histogram";
  let minY = points.reduce((min, p) => Math.min(min, p.y), Infinity);
  let maxY = points.reduce((max, p) => Math.max(max, p.y), -Infinity);
  if (columns) { minY = Math.min(0, minY); maxY = Math.max(0, maxY); }
  const yDomain = numericDomain(minY, maxY);
  minY = yDomain.min; maxY = yDomain.max;
  let minX = points.reduce((min, p) => Math.min(min, p.x), Infinity);
  let maxX = points.reduce((max, p) => Math.max(max, p.x), -Infinity);
  if (dateAxis && minX === maxX) { minX -= 43200000; maxX += 43200000; }
  const binWidth = config.type === "histogram" ? points.length > 1 ? points[1].x - points[0].x : 1 : 0;
  if (binWidth) { minX -= binWidth / 2; maxX += binWidth / 2; }
  const xDomain = dateAxis ? { min: minX, max: maxX, ticks: Array.from({ length: 5 }, (_, i) => minX + i / 4 * (maxX - minX)) } : numericDomain(minX, maxX);
  minX = xDomain.min; maxX = xDomain.max;
  const fontSize = 13 * Math.max(1, 960 / width);
  const left = Math.max(85, fontSize * 5), right = 925, top = 30, bottom = 415;
  const xp = (point: typeof points[number], i: number) => bar ? left + (i + .5) / points.length * (right - left) : left + (point.x - minX) / (maxX - minX) * (right - left);
  const yp = (value: number) => bottom - (value - minY) / (maxY - minY) * (bottom - top);
  const series = [...new Set(points.map((p) => p.group))];
  const color = (group: string) => `var(--analysis-series-${series.indexOf(group) % 6 + 1})`;
  const xLabel = config.type === "histogram" ? dataset.headers[config.y] : dataset.headers[config.x];
  const yLabel = config.type === "histogram" ? t("Observations") : config.type === "bar" ? `${t("Mean")} · ${dataset.headers[config.y]}` : dataset.headers[config.y];
  const tick = (value: number) => dateAxis ? new Date(value).toISOString().slice(0, 7) : formatAnalysisNumber(value);
  return <div ref={wrapper} className="analysis-plot-area"><svg ref={ref} className="analysis-plot" style={{ fontSize }} viewBox="0 0 960 500" role="img" aria-label={`${yLabel} / ${xLabel}`}>
    {yDomain.ticks.map((value) => <g key={value}><line className="analysis-grid" x1={left} x2={right} y1={yp(value)} y2={yp(value)} /><text x={left - 14} y={yp(value) + 4} textAnchor="end">{formatAnalysisNumber(value)}</text></g>)}
    {config.type === "line" && series.map((group) => <polyline key={group} fill="none" stroke={color(group)} strokeWidth="2" points={points.filter((p) => p.group === group).map((p, i) => `${xp(p, i)},${yp(p.y)}`).join(" ")} />)}
    {points.map((point, i) => {
      const tooltip = `${point.label}\n${yLabel}: ${formatAnalysisNumber(point.y)}${point.group ? `\n${point.group}` : ""}${point.count !== undefined ? `\nn = ${point.count}` : ""}`;
      if (columns) { const width = bar ? (right - left) / points.length * .72 : binWidth / (maxX - minX) * (right - left) * .94; return <rect key={i} className="analysis-mark" x={xp(point, i) - width / 2} y={Math.min(yp(0), yp(point.y))} width={width} height={Math.max(0, Math.abs(yp(0) - yp(point.y)))} fill={bar ? color(point.group) : "var(--analysis-series-1)"}><title>{tooltip}</title></rect>; }
      return <circle key={i} className="analysis-mark" cx={xp(point, i)} cy={yp(point.y)} r={config.type === "line" ? 2.4 : 4.1} opacity={config.type === "line" && points.length > 1 ? 0 : .72} fill={color(point.group)}><title>{tooltip}</title></circle>;
    })}
    {config.type === "bar" ? points.map((point, i) => <text key={i} x={xp(point, i)} y={bottom + fontSize + 10} textAnchor="middle">{point.label.slice(0, points.length > 10 ? 7 : 18)}</text>) : xDomain.ticks.map((value, i, ticks) => <text key={i} x={left + (value - minX) / (maxX - minX) * (right - left)} y={bottom + fontSize + 10} textAnchor={i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle"}>{tick(value)}</text>)}
    <text className="analysis-axis-title" x={(left + right) / 2} y="493" textAnchor="middle">{xLabel}</text><text className="analysis-axis-title" transform={`translate(${fontSize * .8} 225) rotate(-90)`} textAnchor="middle">{yLabel}</text>
  </svg>{series.some(Boolean) && config.group >= 0 && !bar && <div className="analysis-legend">{series.map((group) => <span key={group}><i style={{ background: color(group) }} />{group || t("Missing")}</span>)}</div>}</div>;
}));
