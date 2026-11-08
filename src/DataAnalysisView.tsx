import { useMemo, useRef, useState } from "react";
import { ArrowRight, BarChart3, ChartNoAxesCombined, Download, FileSpreadsheet, LayoutGrid, LineChart, ScatterChart, Sparkles, Table2, Upload, X } from "lucide-react";
import { useUISettings } from "./i18n";
import { numericValue, parseDelimited, summarizeColumn, type Dataset } from "./data-analysis";
import "./data-analysis.css";

const MAX_BYTES = 10 * 1024 * 1024;
const EXAMPLE = "model,accuracy,latency_ms\nBaseline,0.72,120\nMethod A,0.81,135\nMethod B,0.86,148\nMethod C,0.83,110\n";

function format(value: number | null) {
  return value === null ? "—" : Number(value.toPrecision(5)).toLocaleString();
}

export default function DataAnalysisView({ onAskAI }: { onAskAI?: (text: string) => void }) {
  const { t } = useUISettings();
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [column, setColumn] = useState(0);
  const [xColumn, setXColumn] = useState(0);
  const [chart, setChart] = useState<"bar" | "line" | "scatter">("bar");
  const [question, setQuestion] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const chartRef = useRef<SVGSVGElement>(null);
  const fileRequest = useRef(0);
  const summary = useMemo(() => dataset ? summarizeColumn(dataset.rows, column) : null, [dataset, column]);
  const missing = useMemo(() => dataset ? dataset.rows.reduce((sum, row) => sum + row.filter((cell) => !cell.trim()).length, 0) : 0, [dataset]);
  const numericColumns = useMemo(() => dataset ? dataset.headers.map((_, i) => dataset.rows.some((row) => numericValue(row[i]) !== null)) : [], [dataset]);
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
      setDataset(parsed); setName(filename); setError(""); setXColumn(0); setChart("bar"); setQuestion("");
      const firstNumeric = parsed.headers.findIndex((_, i) => parsed.rows.some((row) => numericValue(row[i]) !== null));
      setColumn(firstNumeric < 0 ? 0 : firstNumeric);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not read the file"); }
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
    copy.setAttribute("width", "1180"); copy.setAttribute("height", "520");
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

  function askAI() {
    if (!dataset || !question.trim() || !onAskAI) return;
    const sample = {
      file: name.slice(0, 200), rows: dataset.rows.length, columns: dataset.headers.length, missingCells: missing,
      selectedColumn: { name: dataset.headers[column].slice(0, 200), ...summary },
      sampleHeaders: dataset.headers.slice(0, 20).map((header) => header.slice(0, 200)),
      sampleRows: dataset.rows.slice(0, 5).map((row) => row.slice(0, 20).map((cell) => cell.slice(0, 200))),
    };
    onAskAI(`${question.trim()}\n\nDataset context (summary and at most 5 sample rows / 20 columns only; the full dataset is not attached):\n${JSON.stringify(sample, null, 2)}\n\nTreat sample observations as illustrative; do not claim to have analyzed the full dataset.`);
  }

  const displayed = points.slice(0, 100);
  const minY = displayed.length ? Math.min(0, ...displayed.map((p) => p.y)) : 0;
  const maxY = displayed.length ? Math.max(0, ...displayed.map((p) => p.y)) : 1;
  const minX = displayed.length ? Math.min(...displayed.map((p) => p.x)) : 0;
  const maxX = displayed.length ? Math.max(...displayed.map((p) => p.x)) : 1;
  const yPos = (value: number) => 195 - (value - minY) / (maxY - minY || 1) * 150;
  const xPos = (value: number, index: number) => chart === "scatter" ? 60 + (value - minX) / (maxX - minX || 1) * 490 : 60 + (index + 0.5) / Math.max(displayed.length, 1) * 490;
  const zero = yPos(0);

  return <main className="data-analysis" aria-label={t("Data analysis")}>
    <header className="da-header"><div><div className="da-breadcrumb">{t("RESEARCH APPS / ANALYSIS")}</div><h1>{t("Data analysis")}</h1><p>{t("From raw data to research insight.")}</p></div><button className="da-button" onClick={() => inputRef.current?.click()}><Upload size={15} />{t(dataset ? "Open another file" : "Choose a file")}</button></header>
    <input ref={inputRef} className="da-file" type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={(event) => { void openFile(event.target.files?.[0]); event.target.value = ""; }} />
    {error && <div className="da-error" role="alert">{t(error)} <button aria-label={t("Dismiss")} onClick={() => setError("")}><X size={15} /></button></div>}
    {!dataset ? <div className="da-welcome"><div className="da-welcome-copy"><span className="da-kicker"><Sparkles size={14} /> {t("YOUR DATA WORKSPACE")}</span><h2>{t("Start with a question. Explore with your data.")}</h2><p>{t("Bring your research data into one place to inspect, visualize and ask better questions.")}</p><div className="da-feature-list"><span><LayoutGrid size={16} />{t("Understand your dataset")}</span><span><ChartNoAxesCombined size={16} />{t("Build visualizations")}</span><span><Sparkles size={16} />{t("Continue the analysis with AI")}</span></div></div><section className={`da-drop${dragging ? " dragging" : ""}`} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); void openFile(event.dataTransfer.files[0]); }}><div className="da-drop-icon"><FileSpreadsheet size={25} /></div><h2>{t("Start with a dataset")}</h2><p>{t("Drop a CSV or TSV file here, or choose one from your computer. The first row is used as column names.")}</p><button className="da-primary" onClick={() => inputRef.current?.click()}><Upload size={15} />{t("Choose a file")}</button><button className="da-text-button" onClick={() => { fileRequest.current++; load(EXAMPLE, "example.csv"); }}>{t("Try example data")} <ArrowRight size={14} /></button><small>{t("Processed locally · up to 10 MB · session only")}</small></section></div> : <div className="da-workspace">
      <aside className="da-dataset-panel"><div className="da-panel-label">{t("DATASET")}</div><div className="da-file-heading"><div className="da-file-icon"><FileSpreadsheet size={18} /></div><div><strong title={name}>{name}</strong><span>{t("Local session")}</span></div></div><div className="da-metrics"><div><strong>{dataset.rows.length.toLocaleString()}</strong><span>{t("ROWS")}</span></div><div><strong>{dataset.headers.length}</strong><span>{t("COLUMNS")}</span></div><div><strong>{missing.toLocaleString()}</strong><span>{t("Missing")}</span></div></div><div className="da-panel-divider" /><div className="da-section-heading"><span>{t("COLUMNS")}</span><small>{dataset.headers.length}</small></div><p className="da-column-hint">{t("Select a column to inspect its values.")}</p><div className="da-column-list">{dataset.headers.map((header, i) => <button key={i} className={i === column ? "active" : ""} onClick={() => setColumn(i)} title={header}><span className="da-column-symbol">{numericColumns[i] ? "#" : "Aa"}</span><span>{header}</span><ArrowRight size={13} /></button>)}</div><div className="da-privacy">{t("Processed locally · up to 10 MB · session only")}</div></aside>
      <div className="da-main"><section className="da-ask"><div className="da-ask-icon"><Sparkles size={17} /></div><div className="da-ask-body"><div className="da-ask-heading"><h2>{t("Explore with AI")}</h2><span>{t("OPENS IN CHAT")}</span></div><p>{t("Ask a question about your data and continue in your research chat.")}</p><div className="da-prompt"><input value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); askAI(); } }} placeholder={t("What would you like to learn from this dataset?")} aria-label={t("Analysis question")} /><button onClick={askAI} disabled={!question.trim() || !onAskAI} aria-label={t("Continue in chat")}><ArrowRight size={17} /></button></div><small>{t("The draft includes a summary and up to 5 sample rows, not the full file. Review it before sending.")}</small></div></section>
        <div className="da-content-heading"><div><span className="da-kicker">{t("EXPLORE YOUR DATA")}</span><h2>{t("Analysis overview")}</h2></div><span>{name}</span></div>
        <div className="da-analysis-grid"><section className="da-card da-chart-card"><div className="da-card-head"><div><span className="da-card-icon"><ChartNoAxesCombined size={16} /></span><div><h3>{t("Chart builder")}</h3><p>{t("Plot individual rows from your dataset.")}</p></div></div>{displayed.length > 0 && <button className="da-button da-export" onClick={downloadChart}><Download size={14} />{t("Export SVG")}</button>}</div><div className="da-chart-toolbar"><div className="da-chart-types" aria-label={t("Chart type")}>{([ ["bar", BarChart3, "Bar"], ["line", LineChart, "Line chart"], ["scatter", ScatterChart, "Scatter"] ] as const).map(([value, Icon, label]) => <button key={value} className={chart === value ? "active" : ""} title={t(label)} aria-label={t(label)} aria-pressed={chart === value} onClick={() => setChart(value)}><Icon size={16} /></button>)}</div><label>{chart === "scatter" ? t("X: numeric column") : t("Row label")}<select value={xColumn} onChange={(event) => setXColumn(Number(event.target.value))}>{dataset.headers.map((header, i) => <option key={i} value={i}>{header}</option>)}</select></label><label>{t("Y: numeric column")}<select value={column} onChange={(event) => setColumn(Number(event.target.value))}>{dataset.headers.map((header, i) => <option key={i} value={i}>{header}</option>)}</select></label></div>
          {displayed.length ? <><svg ref={chartRef} className="da-chart" viewBox="0 0 590 260" role="img" aria-label={`${t("Chart")}: ${dataset.headers[column]}`}>{[0, 1, 2, 3].map((i) => { const val = maxY - (maxY - minY) * i / 3; return <g key={i}><line x1="60" x2="550" y1={45 + i * 50} y2={45 + i * 50} className="chart-grid" /><text x="51" y={49 + i * 50} textAnchor="end">{format(val)}</text></g>; })}<line x1="60" x2="550" y1={zero} y2={zero} className="chart-axis" />{chart === "line" && <polyline className="chart-line" points={displayed.map((p, i) => `${xPos(p.x, i)},${yPos(p.y)}`).join(" ")} />}{displayed.map((p, i) => chart === "bar" ? <rect key={p.row} className="chart-mark" x={xPos(p.x, i) - Math.min(16, 210 / displayed.length)} y={Math.min(zero, yPos(p.y))} width={Math.min(32, 420 / displayed.length)} height={Math.max(1, Math.abs(zero - yPos(p.y)))} rx="2"><title>{`${p.label}: ${p.y}`}</title></rect> : <circle key={p.row} className="chart-mark" cx={xPos(p.x, i)} cy={yPos(p.y)} r="4"><title>{`${p.label}: ${p.y}`}</title></circle>)}<text x="60" y="218">{chart === "scatter" ? format(minX) : displayed[0].label.slice(0, 24)}</text><text x="550" y="218" textAnchor="end">{chart === "scatter" ? format(maxX) : displayed[displayed.length - 1].label.slice(0, 24)}</text><text x="305" y="246" textAnchor="middle">{dataset.headers[xColumn].slice(0, 45)}</text></svg><p className="da-note">{t("Showing up to 100 valid rows in file order. Hover points for values.")} {points.length > 100 ? `(${t("Valid rows")}: ${points.length.toLocaleString()})` : ""}</p></> : <div className="da-no-chart">{t("Choose columns with numeric values to draw a chart.")}</div>}
        </section><section className="da-card da-summary"><div className="da-card-head"><div><span className="da-card-icon"><LayoutGrid size={16} /></span><div><h3>{t("Column summary")}</h3><p>{t("A closer look at your data")}</p></div></div></div><div className="da-selected-column"><span>{t("SELECTED COLUMN")}</span><strong title={dataset.headers[column]}>{dataset.headers[column]}</strong></div>{summary && <><div className="da-summary-hero"><span>{t("Mean")}</span><strong>{format(summary.mean)}</strong><small>{t("Numeric values")}: {summary.count.toLocaleString()}</small></div><div className="da-summary-list">{[["Median", format(summary.median)], ["Minimum", format(summary.min)], ["Maximum", format(summary.max)], ["Missing", summary.missing], ["Non-numeric", summary.invalid]].map(([label, value]) => <div key={label}><span>{t(String(label))}</span><strong>{value}</strong></div>)}</div><p className="da-note">{t("Statistics use numeric values only; missing and non-numeric cells are excluded.")}</p></>}</section></div>
        <section className="da-card da-preview"><div className="da-card-head"><div><span className="da-card-icon"><Table2 size={16} /></span><div><h3>{t("Data preview")}</h3><p>{t("First 50 rows · scroll horizontally to see all columns")}</p></div></div><span className="da-preview-count">{dataset.rows.length.toLocaleString()} {t("rows")}</span></div><div className="da-table-wrap"><table><thead><tr><th>#</th>{dataset.headers.map((header, i) => <th key={i}>{header}</th>)}</tr></thead><tbody>{dataset.rows.slice(0, 50).map((row, i) => <tr key={i}><td>{i + 1}</td>{row.map((cell, j) => <td key={j} title={cell}>{cell || "—"}</td>)}</tr>)}</tbody></table></div></section>
      </div></div>}
  </main>;
}
