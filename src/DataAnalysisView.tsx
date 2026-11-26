import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowRight, Download, Upload, X } from "lucide-react";
import { useUISettings } from "./i18n";
import { InlineNotice } from "./InlineNotice";
import { Tab, Tabs } from "./Tabs";
import { buildPlot, dateValue, parseDelimited, profileDataset, summarizeColumn, type Dataset, type PlotConfig } from "./data-analysis";
import { analysisExamples, type AnalysisExample } from "./data-analysis-examples";
import { DataAnalysisPlot, formatAnalysisNumber as format } from "./DataAnalysisPlot";
import "./data-analysis.css";

function initialData() { return parseDelimited(analysisExamples[0].csv, ","); }
const PAGE_SIZE = 50;

function analysisError(reason: unknown) {
  return String(reason)
    .replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?/, "")
    .replace(/^Error:\s*/, "");
}

export default function DataAnalysisView({ owner, bridge, onAskAI }: { owner?: AnalysisOwner; bridge?: ResearchDeskBridge; onAskAI?: (text: string) => void }) {
  const { t } = useUISettings();
  const [dataset, setDataset] = useState<Dataset>(initialData);
  const [name, setName] = useState(analysisExamples[0].file);
  const [exampleId, setExampleId] = useState<string | null>(analysisExamples[0].id);
  const [presetIndex, setPresetIndex] = useState(0);
  const [config, setConfig] = useState<PlotConfig>(analysisExamples[0].presets[0].config);
  const [column, setColumn] = useState(5);
  const [tab, setTab] = useState("plot");
  const [page, setPage] = useState(0);
  const [question, setQuestion] = useState("");
  const [error, setError] = useState("");
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const chartRef = useRef<SVGSVGElement>(null);
  const fileRequest = useRef(0);
  const [sourceBytes, setSourceBytes] = useState(() => new TextEncoder().encode(analysisExamples[0].csv));
  const [saved, setSaved] = useState<AnalysisEntry[]>([]);
  const [unit, setUnit] = useState("");
  const [seedColumn, setSeedColumn] = useState<number | null>(null);
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const projectId = owner?.projectId, workspace = owner?.workspace;
  useEffect(() => {
    if (!projectId || !workspace || !bridge?.listAnalyses) return;
    let current = true;
    bridge.listAnalyses({ projectId, workspace }).then((items) => { if (current) setSaved(items); },
      (reason) => { if (current) setError(analysisError(reason)); });
    return () => { current = false; fileRequest.current++; };
  }, [bridge, projectId, workspace]);
  const profiles = useMemo(() => profileDataset(dataset), [dataset]);
  const numeric = profiles.filter((profile) => profile.kind === "number");
  const summary = useMemo(() => summarizeColumn(dataset.rows, column), [dataset, column]);
  const plot = useMemo(() => buildPlot(dataset, config), [dataset, config]);
  const missing = profiles.reduce((total, profile) => total + profile.missing, 0);
  const example = analysisExamples.find((item) => item.id === exampleId);

  function loadExample(item: AnalysisExample) {
    fileRequest.current++;
    setSourceBytes(new TextEncoder().encode(item.csv)); setUnit(""); setSeedColumn(null); setNotice("");
    setDataset(parseDelimited(item.csv, ",")); setName(item.file); setExampleId(item.id);
    setConfig(item.presets[0].config); setColumn(item.presets[0].config.y); setPresetIndex(0);
    setPage(0); setTab("plot"); setQuestion(""); setError("");
  }

  async function openFile(file?: File) {
    const request = ++fileRequest.current;
    if (!file) return;
    if (!/\.(csv|tsv)$/i.test(file.name)) { setError("Choose a CSV or TSV file"); return; }
    if (file.size > 10 * 1024 * 1024) { setError("File exceeds the 10 MB limit"); return; }
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const text = new TextDecoder().decode(bytes);
      if (request !== fileRequest.current) return;
      const data = parseDelimited(text, /\.tsv$/i.test(file.name) ? "\t" : ",");
      const fields = profileDataset(data), numbers = fields.filter((field) => field.kind === "number");
      const y = numbers[1]?.index ?? numbers[0]?.index ?? -1;
      setSourceBytes(bytes); setUnit(""); setSeedColumn(null); setNotice("");
      setDataset(data); setName(file.name); setExampleId(null); setPresetIndex(-1);
      setColumn(Math.max(0, y)); setConfig({ type: numbers.length > 1 ? "scatter" : "histogram", x: numbers[0]?.index ?? 0, y, group: -1 });
      setTab(numbers.length ? "plot" : "data"); setPage(0); setQuestion(""); setError("");
    } catch (reason) { setError(analysisError(reason) || "Could not read the file"); }
  }

  async function saveAnalysis() {
    if (!owner || !bridge?.saveAnalysis) return;
    const request = fileRequest.current;
    setBusy(true); setError("");
    try {
      const item = await bridge.saveAnalysis(owner, { bytes: sourceBytes, name, recipe: { config, column, unit, seedColumn } });
      setSaved((items) => [item, ...items.filter((other) => other.id !== item.id)]);
      if (request === fileRequest.current) setNotice(t("Analysis saved to this project."));
    } catch (reason) { if (request === fileRequest.current) setError(analysisError(reason)); }
    finally { setBusy(false); }
  }

  async function reopen(id: string) {
    if (!owner || !bridge?.loadAnalysis || !id) return;
    const request = ++fileRequest.current;
    setBusy(true); setError(""); setNotice("");
    try {
      const { source, recipe } = await bridge.loadAnalysis(owner, id);
      if (request !== fileRequest.current) return;
      if (source.state !== "ready" || !source.bytes) {
        setError(t(source.state === "missing" ? "Saved analysis source is missing." : "Saved analysis source has changed."));
        return;
      }
      const bytes = new Uint8Array(source.bytes);
      setDataset(parseDelimited(new TextDecoder().decode(bytes), /\.tsv$/i.test(source.name) ? "\t" : ","));
      setSourceBytes(bytes); setName(source.name); setExampleId(null); setPresetIndex(-1); setPage(0); setQuestion("");
      setConfig(recipe.config); setColumn(recipe.column); setSeedColumn(recipe.seedColumn); setUnit(recipe.unit);
      setNotice(t("Reopened saved analysis.") + " SHA-256 " + source.sha256.slice(0, 12));
    } catch (reason) { if (request === fileRequest.current) setError(analysisError(reason)); }
    finally { setBusy(false); }
  }

  function updateConfig(patch: Partial<PlotConfig>) {
    setPresetIndex(-1);
    setConfig((current) => {
      const next = { ...current, ...patch };
      if (patch.type) {
        const eligible = profiles.filter((field) => field.kind === "number" || (next.type === "line" && field.kind === "date"));
        if (next.type === "scatter" || next.type === "line") {
          if (!eligible.some((field) => field.index === next.x)) next.x = eligible.find((field) => field.index !== next.y)?.index ?? eligible[0]?.index ?? 0;
        } else if (next.type === "bar") next.x = profiles.find((field) => field.kind === "text")?.index ?? 0;
        if (!numeric.some((field) => field.index === next.y)) next.y = numeric[0]?.index ?? -1;
        if (next.type === "histogram" || next.type === "bar") next.group = -1;
      }
      return next;
    });
  }

  function downloadChart() {
    const source = chartRef.current;
    if (!source) return;
    const copy = source.cloneNode(true) as SVGSVGElement;
    copy.setAttribute("xmlns", "http://www.w3.org/2000/svg"); copy.setAttribute("width", "1440"); copy.setAttribute("height", "750");
    copy.style.background = getComputedStyle(source.parentElement!).backgroundColor;
    const originals = source.querySelectorAll("text,line,polyline,rect,circle");
    copy.querySelectorAll("text,line,polyline,rect,circle").forEach((element, index) => {
      const style = getComputedStyle(originals[index]);
      for (const property of ["fill", "stroke", "stroke-width", "font-size", "font-family", "opacity"]) element.setAttribute(property, style.getPropertyValue(property));
    });
    if (config.group >= 0) {
      const ns = "http://www.w3.org/2000/svg";
      const groups = [...new Set(plot.points.map((point) => point.group))];
      copy.setAttribute("viewBox", "0 0 960 540");
      groups.forEach((group, i) => {
        const label = document.createElementNS(ns, "text"); label.setAttribute("x", String(85 + i * 140)); label.setAttribute("y", "525"); label.setAttribute("fill", getComputedStyle(source).getPropertyValue(`--analysis-series-${i % 6 + 1}`)); label.setAttribute("font-size", "12"); label.textContent = group || t("Missing"); copy.append(label);
      });
    }
    const url = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(copy)], { type: "image/svg+xml;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `${name.replace(/\.[^.]+$/, "")}-${config.type}.svg`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function askAI() {
    if (!question.trim() || !onAskAI) return;
    const context = { file: name.slice(0, 200), rows: dataset.rows.length, columns: dataset.headers.length, missingCells: missing,
      selectedColumn: { name: dataset.headers[column].slice(0, 200), kind: selectedProfile.kind, distinct: selectedProfile.distinct, common: selectedProfile.common.map((item) => ({ ...item, value: item.value.slice(0, 200) })), ...summary }, plot: { ...config, validRows: plot.valid, correlation: plot.correlation },
      sampleHeaders: dataset.headers.slice(0, 20).map((value) => value.slice(0, 200)),
      sampleRows: dataset.rows.slice(0, 5).map((row) => row.slice(0, 20).map((value) => value.slice(0, 200))),
    };
    onAskAI(`${question.trim()}\n\nDataset context (summary and at most 5 sample rows / 20 columns only; the full dataset is not attached):\n${JSON.stringify(context, null, 2)}\n\nTreat sample observations as illustrative. Descriptive statistics and the plot correlation above were computed from all valid local rows; do not claim to have inspected the full dataset.`);
  }

  const xOptions = config.type === "scatter" ? numeric : config.type === "line" ? profiles.filter((field) => field.kind === "number" || field.kind === "date") : profiles;
  const categorical = profiles.filter((field) => field.kind === "text" && field.distinct <= 30);
  const selectedProfile = profiles[column];

  return <main className={`data-analysis${dragging ? " analysis-dragging" : ""}`} aria-label={t("Data analysis")} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); void openFile(event.dataTransfer.files[0]); }}>
    <header className="analysis-toolbar">
      <div className="analysis-file-title"><h1>{t("Data analysis")}</h1><div className="analysis-file-meta"><strong title={name}>{name}</strong><span>{example ? t("Example dataset") : t("Local file")} · {dataset.rows.length.toLocaleString()} {t("rows")} · {dataset.headers.length} {t("fields")}</span></div></div>
      <div className="analysis-file-actions"><label className="analysis-example-picker"><span>{t("Examples")}</span><select aria-label={t("Example dataset")} value={exampleId ?? ""} onChange={(event) => { const item = analysisExamples.find((candidate) => candidate.id === event.target.value); if (item) loadExample(item); }}><option disabled value="">{t("Choose an example")}</option>{analysisExamples.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><button className="primary-button" onClick={() => inputRef.current?.click()}><Upload size={15} />{t("Open CSV / TSV")}</button></div>
    </header>
    {owner && bridge?.saveAnalysis && <div className="analysis-view-toolbar" aria-label={t("Saved analyses")}>
      <label className="analysis-example-picker"><span>{t("Metric unit")}</span><input aria-label={t("Metric unit")} value={unit} maxLength={80} onChange={(event) => setUnit(event.target.value)} /></label>
      <label className="analysis-example-picker"><span>{t("Seed column")}</span><select value={seedColumn ?? ""} onChange={(event) => setSeedColumn(event.target.value === "" ? null : Number(event.target.value))}>
        <option value="">{t("None")}</option>{dataset.headers.map((header, i) => <option key={i} value={i}>{header}</option>)}</select></label>
      <button className="analysis-button" disabled={busy} onClick={saveAnalysis}>{t("Save analysis")}</button>
      <select aria-label={t("Saved analyses")} value="" disabled={busy || !saved.length} onChange={(event) => void reopen(event.target.value)}>
        <option value="">{t("Reopen saved analysis")}</option>{saved.map((item) => <option key={item.id} value={item.id}>{item.name} · {new Date(item.createdAt).toLocaleString()}</option>)}</select>
      {notice && <span role="status">{notice}</span>}
    </div>}
    <input ref={inputRef} hidden type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={(event) => { void openFile(event.target.files?.[0]); event.target.value = ""; }} />
    {error && <InlineNotice className="analysis-error" tone="danger" onDismiss={() => setError("")} dismissLabel={t("Dismiss")}>{t(error)}</InlineNotice>}
    <div className="analysis-body">
      <aside className="analysis-fields">
        <h2>{t("Fields")}</h2><p className="analysis-muted">{t("Select a field to inspect it.")}</p>
        <div className="analysis-field-list">{dataset.headers.map((header, index) => <button key={index} className={index === column ? "selected" : ""} aria-pressed={index === column} title={header} onClick={() => setColumn(index)}><span aria-hidden="true">{profiles[index].kind === "number" ? "#" : profiles[index].kind === "date" ? "↗" : "Aa"}</span><span>{header}</span></button>)}</div>
        <section className="analysis-field-detail"><h3>{dataset.headers[column]}</h3><div className="analysis-definition">{selectedProfile.kind === "number" ? t("Numeric") : selectedProfile.kind === "date" ? t("Date") : t("Categorical")} <span>{selectedProfile.distinct.toLocaleString()} {t("distinct")}</span></div>
          <dl className="analysis-statistics">{(selectedProfile.kind === "number" ? [["Mean", format(summary.mean)], ["Median", format(summary.median)], ["Minimum", format(summary.min)], ["Maximum", format(summary.max)]] : [["Present", (dataset.rows.length - selectedProfile.missing).toLocaleString()]]).concat([["Missing", String(selectedProfile.missing)]]).map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>)}</dl>
          {selectedProfile.kind === "text" && <div className="analysis-frequencies">{selectedProfile.common.map((item) => <div key={item.value}><span title={item.value}>{item.value}</span><span>{item.count}</span></div>)}</div>}
        </section><p className="analysis-local-note">{t(owner && bridge?.saveAnalysis ? "Local processing. Unsaved data stays in this session; saved analyses are stored in the project." : "Local processing. Files are kept for this session only.")}</p>
      </aside>
      <div className="analysis-main">
        <div className="analysis-view-toolbar"><Tabs label={t("Analysis view")} value={tab} onChange={setTab} variant="segmented"><Tab value="plot" controls="analysis-plot-panel">{t("Visualization")}</Tab><Tab value="data" controls="analysis-data-panel">{t("Data table")}</Tab></Tabs>{tab === "plot" && <button className="secondary-button" onClick={downloadChart} disabled={!plot.points.length}><Download size={15} />{t("Export SVG")}</button>}</div>
        {tab === "plot" ? <section id="analysis-plot-panel" className="analysis-plot-panel" role="tabpanel" aria-label={t("Visualization")}>
          {example && <div className="analysis-presets"><span>{t("Try a view")}</span>{example.presets.map((preset, index) => <button key={preset.label} aria-pressed={presetIndex === index} className={presetIndex === index ? "selected" : ""} onClick={() => { setConfig(preset.config); setColumn(preset.config.y); setPresetIndex(index); }}>{t(preset.label)}</button>)}</div>}
          <div className="analysis-plot-controls">
            <label>{t("Chart type")}<select aria-label={t("Chart type")} value={config.type} onChange={(event) => updateConfig({ type: event.target.value as PlotConfig["type"] })}><option value="scatter">{t("Scatter")}</option><option value="bar">{t("Group means")}</option><option value="line">{t("Line chart")}</option><option value="histogram">{t("Distribution")}</option></select></label>
            {config.type !== "histogram" && <label>{config.type === "bar" ? t("Group by") : "X"}<select aria-label={t("X field")} value={config.x} onChange={(event) => updateConfig({ x: Number(event.target.value) })}>{xOptions.map((field) => <option key={field.index} value={field.index}>{dataset.headers[field.index]}</option>)}</select></label>}
            <label>{config.type === "histogram" ? t("Measurement") : "Y"}<select aria-label={t("Y field")} value={config.y} onChange={(event) => updateConfig({ y: Number(event.target.value) })}>{!numeric.length && <option value={-1}>{t("No numeric fields")}</option>}{numeric.map((field) => <option key={field.index} value={field.index}>{dataset.headers[field.index]}</option>)}</select></label>
            {(config.type === "scatter" || config.type === "line") && <label>{t("Color by")}<select aria-label={t("Color by")} value={config.group} onChange={(event) => updateConfig({ group: Number(event.target.value) })}><option value={-1}>{t("No grouping")}</option>{categorical.map((field) => <option key={field.index} value={field.index}>{dataset.headers[field.index]}</option>)}</select></label>}
          </div>
          <DataAnalysisPlot ref={chartRef} dataset={dataset} config={config} plot={plot} dateAxis={config.type === "line" && dateValue(dataset.rows.find((row) => dateValue(row[config.x]) !== null)?.[config.x] ?? "") !== null} t={t} />
          <footer className="analysis-plot-footer"><span>{plot.valid.toLocaleString()} / {dataset.rows.length.toLocaleString()} {t("valid rows")}{plot.points.length === 2000 && plot.valid > 2000 ? ` · ${t("Display sampled to 2,000 points")}` : ""}{plot.omittedGroups > 0 ? ` · ${plot.omittedGroups} ${t("groups not displayed")}` : ""}</span>{plot.correlation !== null && config.type === "scatter" && <span>{t("Pearson r")} <strong>{format(plot.correlation)}</strong></span>}</footer>
        </section> : <section id="analysis-data-panel" role="tabpanel" aria-label={t("Data table")} className="analysis-data-panel"><div className="analysis-table-scroll"><table><thead><tr><th>#</th>{dataset.headers.map((header, i) => <th key={i}>{header}</th>)}</tr></thead><tbody>{dataset.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((row, i) => <tr key={i}><td>{page * PAGE_SIZE + i + 1}</td>{row.map((cell, j) => <td key={j} title={cell}>{cell || "—"}</td>)}</tr>)}</tbody></table></div><div className="analysis-pagination"><span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, dataset.rows.length)} / {dataset.rows.length.toLocaleString()}</span><button className="secondary-button" disabled={!page} onClick={() => setPage((current) => current - 1)}>{t("Previous")}</button><button className="secondary-button" disabled={(page + 1) * PAGE_SIZE >= dataset.rows.length} onClick={() => setPage((current) => current + 1)}>{t("Next")}</button></div></section>}
        <div className="analysis-notebook">
          {example && <section className="analysis-guide"><h2>{example.title}</h2><p>{presetIndex >= 0 ? t(example.presets[presetIndex].explanation) : t(example.description)}</p><details><summary>{t("How to use this dataset")}</summary><ol><li>{t("Choose a suggested view above to see a complete example.")}</li><li>{t("Change the axes, chart type or color grouping to explore another relationship.")}</li><li>{t("Inspect fields on the left. Switch to Data table to check the original values.")}</li><li>{t("Export the chart, or draft a question below to continue in your research chat.")}</li></ol><p>{t("Missing tokens: empty, NA, N/A, NaN and null. All statistics use the full dataset; missing numeric values are excluded.")}</p></details><a href={example.source} target="_blank" rel="noreferrer">{t("Dataset source")}</a><span className="analysis-source-credit">{example.credit}</span></section>}
          <section className="analysis-question"><label htmlFor="analysis-question">{t("Continue in research chat")}</label><div><input id="analysis-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={t("Ask about a pattern, result or next analysis…")} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); askAI(); } }} /><button type="button" className="primary-button" aria-label={t("Continue in chat")} disabled={!question.trim() || !onAskAI} onClick={askAI}><ArrowRight size={18} /></button></div><p>{t("Creates a draft with statistics and 5 sample rows. The full file is not attached.")}</p></section>
        </div>
      </div>
    </div>
  </main>;
}
