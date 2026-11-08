import { useMemo, useRef, useState } from "react";
import { BarChart3, Download, FileSpreadsheet, Upload, X } from "lucide-react";
import { useUISettings } from "./i18n";
import { numericValue, parseDelimited, summarizeColumn, type Dataset } from "./data-analysis";
import "./data-analysis.css";

const MAX_BYTES = 10 * 1024 * 1024;
const EXAMPLE = "model,accuracy,latency_ms\nBaseline,0.72,120\nMethod A,0.81,135\nMethod B,0.86,148\nMethod C,0.83,110\n";

function format(value: number | null) {
  return value === null ? "—" : Number(value.toPrecision(5)).toLocaleString();
}

export default function DataAnalysisView() {
  const { t } = useUISettings();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [column, setColumn] = useState(0);
  const [xColumn, setXColumn] = useState(0);
  const [chart, setChart] = useState<"bar" | "line" | "scatter">("bar");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const chartRef = useRef<SVGSVGElement>(null);
  const fileRequest = useRef(0);
  const summary = useMemo(() => dataset ? summarizeColumn(dataset.rows, column) : null, [dataset, column]);
  const points = useMemo(() => {
    if (!dataset) return [];
    return dataset.rows.flatMap((row, i) => {
      const y = numericValue(row[column] ?? "");
      const x = chart === "scatter" ? numericValue(row[xColumn] ?? "") : i;
      return y === null || x === null ? [] : [{ x, y, label: row[xColumn] || String(i + 1), row: i + 1 }];
    });
  }, [dataset, column, xColumn, chart]);

  function load(text: string, filename: string) {
    try {
      const parsed = parseDelimited(text, filename.toLowerCase().endsWith(".tsv") ? "\t" : ",");
      setDataset(parsed); setName(filename); setError(""); setXColumn(0); setChart("bar");
      const firstNumeric = parsed.headers.findIndex((_, i) => parsed.rows.some((row) => numericValue(row[i]) !== null));
      setColumn(firstNumeric < 0 ? 0 : firstNumeric);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not read the file");
    }
  }

  async function openFile(file?: File) {
    const request = ++fileRequest.current;
    if (!file) return;
    if (!/\.(csv|tsv)$/i.test(file.name)) { setError("Choose a CSV or TSV file"); return; }
    if (file.size > MAX_BYTES) { setError("File exceeds the 10 MB limit"); return; }
    try { const text = await file.text(); if (request === fileRequest.current) load(text, file.name); }
    catch { if (request === fileRequest.current) setError("Could not read the file"); }
  }

  function downloadChart() {
    const source = chartRef.current;
    if (!source) return;
    const copy = source.cloneNode(true) as SVGSVGElement;
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    copy.setAttribute("width", "1180"); copy.setAttribute("height", "440");
    copy.style.background = getComputedStyle(source.parentElement!).backgroundColor;
    const originals = source.querySelectorAll("text, line, polyline, rect, circle");
    copy.querySelectorAll("text, line, polyline, rect, circle").forEach((element, index) => {
      const style = getComputedStyle(originals[index]);
      for (const property of ["fill", "stroke", "stroke-width", "font-size", "font-family"]) element.setAttribute(property, style.getPropertyValue(property));
    });
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = "data-analysis-chart.svg"; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const displayed = points.slice(0, 100);
  const minY = displayed.length ? Math.min(0, ...displayed.map((p) => p.y)) : 0;
  const maxY = displayed.length ? Math.max(0, ...displayed.map((p) => p.y)) : 1;
  const minX = displayed.length ? Math.min(...displayed.map((p) => p.x)) : 0;
  const maxX = displayed.length ? Math.max(...displayed.map((p) => p.x)) : 1;
  const yPos = (value: number) => 185 - (value - minY) / (maxY - minY || 1) * 155;
  const xPos = (value: number, index: number) => chart === "scatter" ? 55 + (value - minX) / (maxX - minX || 1) * 500 : 55 + (index + 0.5) / Math.max(displayed.length, 1) * 500;
  const zero = yPos(0);

  return <main className="data-analysis" aria-label={t("Data analysis")}>
    <header className="data-analysis-header"><div><span className="data-analysis-eyebrow">{t("RESEARCH APPS / ANALYSIS")}</span><h1>{t("Data analysis")}</h1><p>{t("Explore your data, understand its shape, and make a chart.")}</p></div>{dataset && <button className="data-analysis-button" onClick={() => inputRef.current?.click()}><Upload size={15} />{t("Open another file")}</button>}</header>
    <input ref={inputRef} className="data-analysis-file" type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={(event) => { void openFile(event.target.files?.[0]); event.target.value = ""; }} />
    {error && <div className="data-analysis-error" role="alert">{t(error)} <button aria-label={t("Dismiss")} onClick={() => setError("")}><X size={15} /></button></div>}
    {!dataset ? <section className={`data-analysis-empty${dragging ? " dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void openFile(event.dataTransfer.files[0]); }}>
      <div className="data-analysis-empty-icon"><FileSpreadsheet size={28} /></div><h2>{t("Start with a dataset")}</h2><p>{t("Drop a CSV or TSV file here, or choose one from your computer. The first row is used as column names.")}</p><div className="data-analysis-empty-actions"><button className="data-analysis-primary" onClick={() => inputRef.current?.click()}><Upload size={15} />{t("Choose a file")}</button><button className="data-analysis-button" onClick={() => { fileRequest.current++; load(EXAMPLE, "example.csv"); }}>{t("Try example data")}</button></div><small>{t("Processed locally · up to 10 MB · session only")}</small>
    </section> : <>
      <section className="data-analysis-overview"><div><span>{t("DATASET")}</span><strong title={name}>{name}</strong></div><div><span>{t("ROWS")}</span><strong>{dataset.rows.length.toLocaleString()}</strong></div><div><span>{t("COLUMNS")}</span><strong>{dataset.headers.length}</strong></div><div><span>{t("MISSING CELLS")}</span><strong>{dataset.rows.reduce((sum, row) => sum + row.filter((cell) => !cell.trim()).length, 0).toLocaleString()}</strong></div></section>
      <div className="data-analysis-grid"><section className="data-analysis-card"><div className="data-analysis-card-head"><div><h2>{t("Column summary")}</h2><p>{t("Select a column to inspect its values.")}</p></div><select aria-label={t("Summary column")} value={column} onChange={(event) => setColumn(Number(event.target.value))}>{dataset.headers.map((header, i) => <option key={i} value={i}>{header}</option>)}</select></div>
        {summary && <><div className="data-analysis-stats">{[["Numeric values", summary.count], ["Missing", summary.missing], ["Non-numeric", summary.invalid], ["Mean", format(summary.mean)], ["Median", format(summary.median)], ["Minimum", format(summary.min)], ["Maximum", format(summary.max)]].map(([label, value]) => <div key={label}><span>{t(String(label))}</span><strong>{value}</strong></div>)}</div><p className="data-analysis-note">{t("Statistics use numeric values only; missing and non-numeric cells are excluded.")}</p></>}
      </section><section className="data-analysis-card"><div className="data-analysis-card-head"><div><h2>{t("Chart builder")}</h2><p>{t("Plot individual rows from your dataset.")}</p></div>{displayed.length ? <button className="data-analysis-button" onClick={downloadChart}><Download size={14} />{t("Export SVG")}</button> : <BarChart3 size={19} />}</div><div className="data-analysis-controls"><label>{t("Chart type")}<select value={chart} onChange={(event) => setChart(event.target.value as typeof chart)}><option value="bar">{t("Bar")}</option><option value="line">{t("Line chart")}</option><option value="scatter">{t("Scatter")}</option></select></label><label>{chart === "scatter" ? t("X: numeric column") : t("Row label")}<select value={xColumn} onChange={(event) => setXColumn(Number(event.target.value))}>{dataset.headers.map((header, i) => <option key={i} value={i}>{header}</option>)}</select></label><label>{t("Y: numeric column")}<select value={column} onChange={(event) => setColumn(Number(event.target.value))}>{dataset.headers.map((header, i) => <option key={i} value={i}>{header}</option>)}</select></label></div>
        {displayed.length ? <><svg ref={chartRef} className="data-analysis-chart" viewBox="0 0 590 220" role="img" aria-label={`${t("Chart")}: ${dataset.headers[column]}`}><line x1="55" x2="555" y1={zero} y2={zero} className="chart-axis" /><text x="48" y="35" textAnchor="end">{format(maxY)}</text><text x="48" y="190" textAnchor="end">{format(minY)}</text>{chart === "line" && <polyline className="chart-line" points={displayed.map((p, i) => `${xPos(p.x, i)},${yPos(p.y)}`).join(" ")} />}{displayed.map((p, i) => chart === "bar" ? <rect key={p.row} className="chart-mark" x={xPos(p.x, i) - Math.min(16, 220 / displayed.length)} y={Math.min(zero, yPos(p.y))} width={Math.min(32, 440 / displayed.length)} height={Math.max(1, Math.abs(zero - yPos(p.y)))}><title>{`${p.label}: ${p.y}`}</title></rect> : <circle key={p.row} className="chart-mark" cx={xPos(p.x, i)} cy={yPos(p.y)} r="3.5"><title>{`${p.label}: ${p.y}`}</title></circle>)}<text x="55" y="210">{chart === "scatter" ? format(minX) : displayed[0].label}</text><text x="555" y="210" textAnchor="end">{chart === "scatter" ? format(maxX) : displayed[displayed.length - 1].label}</text></svg><p className="data-analysis-note">{t("Showing up to 100 valid rows in file order. Hover points for values.")} {points.length > 100 ? `(${t("Valid rows")}: ${points.length.toLocaleString()})` : ""}</p></> : <div className="data-analysis-no-chart">{t("Choose columns with numeric values to draw a chart.")}</div>}
      </section></div>
      <section className="data-analysis-card data-analysis-preview"><div className="data-analysis-card-head"><div><h2>{t("Data preview")}</h2><p>{t("First 50 rows · scroll horizontally to see all columns")}</p></div></div><div className="data-analysis-table-wrap"><table><thead><tr><th>#</th>{dataset.headers.map((header, i) => <th key={i}>{header}</th>)}</tr></thead><tbody>{dataset.rows.slice(0, 50).map((row, i) => <tr key={i}><td>{i + 1}</td>{row.map((cell, j) => <td key={j}>{cell || "—"}</td>)}</tr>)}</tbody></table></div></section>
    </>}
  </main>;
}
