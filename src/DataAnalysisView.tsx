import { useEffect, useMemo, useRef, useState, type SetStateAction } from "react";
import { ArrowRight, Download, Upload, X } from "lucide-react";
import { useUISettings } from "./i18n";
import { Tab, Tabs } from "./Tabs";
import { buildPlot, dateValue, parseDelimited, profileDataset, summarizeColumn, type Dataset, type PlotConfig } from "./data-analysis";
import { analysisExamples, type AnalysisExample } from "./data-analysis-examples";
import { DataAnalysisPlot, formatAnalysisNumber as format } from "./DataAnalysisPlot";
import "./data-analysis.css";
import { figurePng } from "./figure-image";
import type { ProjectResultOpenRequest, AnalysisChatInput, ProjectResultDetail, ProjectResultOwner, ProjectResultsBridge, ProjectResultSummary } from "./project-results";

function initialData() { return parseDelimited(analysisExamples[0].csv, ","); }
const PAGE_SIZE = 50;

type AnalysisState = {
  dataset: Dataset; inputId: string; name: string; exampleId: string | null;
  presetIndex: number; config: PlotConfig; column: number; tab: string; page: number;
  question: string; error: string; handingOff: boolean; sourceText: string;
  resultId: string | null; threadId: string | null; saving: boolean; notice: string;
};
function initialAnalysisState(): AnalysisState {
  return { dataset: initialData(), inputId: `example:${analysisExamples[0].id}`, name: analysisExamples[0].file,
    exampleId: analysisExamples[0].id, presetIndex: 0, config: analysisExamples[0].presets[0].config,
    column: 5, tab: "plot", page: 0, question: "", error: "", handingOff: false, sourceText: analysisExamples[0].csv,
    resultId: null, threadId: null, saving: false, notice: "" };
}

export default function DataAnalysisView({ ownerKey = "preview", owner, bridge, onAskAI, onUseInManuscript, openRequest }: { ownerKey?: string; owner?: ProjectResultOwner; bridge?: ProjectResultsBridge; openRequest?: ProjectResultOpenRequest; onUseInManuscript?: (result: ProjectResultDetail, fileName: string) => Promise<void>; onAskAI?: (text: string, input: AnalysisChatInput, isCurrentInput: () => boolean) => void | string | Promise<void | string> }) {
  const { t } = useUISettings();
  const [ownerStates, setOwnerStates] = useState<Record<string, AnalysisState>>({});
  const emptyState = useMemo(initialAnalysisState, [ownerKey]);
  const state = ownerStates[ownerKey] ?? emptyState;
  const { dataset, inputId, name, exampleId, presetIndex, config, column, tab, page, question, error, handingOff } = state;
  const [resultsByOwner, setResultsByOwner] = useState<Record<string, ProjectResultSummary[]>>({});
  const [chosenResults, setChosenResults] = useState<Record<string, string>>({});
  const editVersions = useRef(new Map<string, number>());
  function setField<K extends keyof AnalysisState>(field: K, value: SetStateAction<AnalysisState[K]>) {
    if (!["saving", "notice", "error", "handingOff", "threadId", "resultId"].includes(field)) editVersions.current.set(ownerKey, (editVersions.current.get(ownerKey) ?? 0) + 1);
    setOwnerStates((current) => {
      const previous = current[ownerKey] ?? emptyState;
      const next = typeof value === "function" ? (value as (previous: AnalysisState[K]) => AnalysisState[K])(previous[field]) : value;
      return { ...current, [ownerKey]: { ...previous, [field]: next } };
    });
  }
  const setDataset = (value: SetStateAction<Dataset>) => setField("dataset", value);
  const setName = (value: string) => setField("name", value);
  const setExampleId = (value: string | null) => setField("exampleId", value);
  const setPresetIndex = (value: number) => setField("presetIndex", value);
  const setConfig = (value: SetStateAction<PlotConfig>) => setField("config", value);
  const setColumn = (value: number) => setField("column", value);
  const setTab = (value: string) => setField("tab", value);
  const setPage = (value: SetStateAction<number>) => setField("page", value);
  const setQuestion = (value: string) => setField("question", value);
  const setError = (value: string) => setField("error", value);
  const [dragging, setDragging] = useState(false);
  const activeInputRef = useRef({ ownerKey, inputId });
  activeInputRef.current = { ownerKey, inputId };
  async function refreshResults() {
    if (!owner || !bridge) return;
    const results = await bridge.listProjectResults({ projectId: owner.projectId, workspaceId: owner.workspaceId, kind: "analysis" });
    setResultsByOwner((current) => ({ ...current, [ownerKey]: results }));
  }
  useEffect(() => { void refreshResults().catch((reason) => setError(String(reason))); }, [ownerKey, bridge]);
  const inputRef = useRef<HTMLInputElement>(null);
  const chartRef = useRef<SVGSVGElement>(null);
  const fileRequests = useRef(new Map<string, number>());
  function nextFileRequest() { const next = (fileRequests.current.get(ownerKey) ?? 0) + 1; fileRequests.current.set(ownerKey, next); return next; }
  const profiles = useMemo(() => profileDataset(dataset), [dataset]);
  const numeric = profiles.filter((profile) => profile.kind === "number");
  const summary = useMemo(() => summarizeColumn(dataset.rows, column), [dataset, column]);
  const plot = useMemo(() => buildPlot(dataset, config), [dataset, config]);
  const missing = profiles.reduce((total, profile) => total + profile.missing, 0);
  const example = analysisExamples.find((item) => item.id === exampleId);

  function loadExample(item: AnalysisExample) {
    nextFileRequest();
    setField("inputId", `example:${item.id}`);
    setField("sourceText", item.csv); setField("resultId", null); setField("threadId", null); setField("notice", "");
    setDataset(parseDelimited(item.csv, ",")); setName(item.file); setExampleId(item.id);
    setConfig(item.presets[0].config); setColumn(item.presets[0].config.y); setPresetIndex(0);
    setPage(0); setTab("plot"); setQuestion(""); setError("");
  }

  async function openFile(file?: File) {
    const request = nextFileRequest();
    if (!file) return;
    if (!/\.(csv|tsv)$/i.test(file.name)) { setError("Choose a CSV or TSV file"); return; }
    if (file.size > 10 * 1024 * 1024) { setError("File exceeds the 10 MB limit"); return; }
    try {
      const text = await file.text();
      if (request !== fileRequests.current.get(ownerKey)) return;
      const data = parseDelimited(text, /\.tsv$/i.test(file.name) ? "\t" : ",");
      const fields = profileDataset(data), numbers = fields.filter((field) => field.kind === "number");
      const y = numbers[1]?.index ?? numbers[0]?.index ?? -1;
      setField("inputId", `file:${crypto.randomUUID()}`);
      setField("sourceText", text); setField("resultId", null); setField("threadId", null); setField("notice", "");
      setDataset(data); setName(file.name); setExampleId(null); setPresetIndex(-1);
      setColumn(Math.max(0, y)); setConfig({ type: numbers.length > 1 ? "scatter" : "histogram", x: numbers[0]?.index ?? 0, y, group: -1 });
      setTab(numbers.length ? "plot" : "data"); setPage(0); setQuestion(""); setError("");
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Could not read the file"); }
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

  function chartSvg() {
    const source = chartRef.current;
    if (!source) return "";
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
    return new XMLSerializer().serializeToString(copy);
  }
  function downloadChart() {
    const svg = chartSvg();
    if (!svg) return;
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    const link = document.createElement("a"); link.href = url; link.download = `${name.replace(/\.[^.]+$/, "")}-${config.type}.svg`; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function saveResult(threadId = state.threadId, resultId = state.resultId, manuscriptImage = false): Promise<ProjectResultDetail> {
    if (!owner || !bridge) throw new Error(t("Select a project workspace to save an analysis."));
    const savedVersion = editVersions.current.get(ownerKey) ?? 0;
    setField("saving", true); setError("");
    try {
      const sourceName = /\.tsv$/i.test(name) ? "source.tsv" : "source.csv", svg = chartSvg();
      const png = manuscriptImage && svg ? await figurePng(svg) : "";
      if (activeInputRef.current.ownerKey !== ownerKey) throw new Error(t("Analysis was not saved. Return to this project and save its draft."));
      const saved = await bridge.saveProjectResult({ id: resultId || undefined, projectId: owner.projectId, workspaceId: owner.workspaceId, threadId, kind: "analysis", title: `${name} · ${config.type}`, manifest: {
        version: 1, source: { name, file: sourceName, inputId, format: sourceName.endsWith("tsv") ? "tsv" : "csv" },
        config, selectedColumn: column, tab, question, exampleId, presetIndex, statistics: { rows: dataset.rows.length, columns: dataset.headers.length, missingCells: missing, selectedColumn: summary, correlation: plot.correlation }, ...(svg ? { output: { file: "plot.svg", ...(png ? { manuscriptFile: "plot.png" } : {}) } } : {}),
      }, files: [{ name: sourceName, role: "source", encoding: "utf8", content: state.sourceText }, ...(svg ? [{ name: "plot.svg", role: "output" as const, encoding: "utf8" as const, content: svg }] : []), ...(png ? [{ name: "plot.png", role: "output" as const, encoding: "base64" as const, content: png }] : [])] });
      setOwnerStates((current) => {
        const previous = current[ownerKey] ?? emptyState;
        return previous.inputId === inputId && (editVersions.current.get(ownerKey) ?? 0) === savedVersion ? { ...current, [ownerKey]: { ...previous, resultId: saved.id, threadId, notice: t("Analysis snapshot saved to this project.") } } : current;
      });
      await refreshResults(); return saved;
    } finally { setField("saving", false); }
  }

  async function openResult(id: string) {
    if (!owner || !bridge || !id) return;
    const request = nextFileRequest(), version = editVersions.current.get(ownerKey) ?? 0;
    const isCurrent = () => activeInputRef.current.ownerKey === ownerKey && fileRequests.current.get(ownerKey) === request && (editVersions.current.get(ownerKey) ?? 0) === version;
    setField("saving", true); setError("");
    try {
      const saved = await bridge.getProjectResult(id);
      if (!isCurrent()) return;
      if (saved.projectId !== owner.projectId || saved.workspaceId !== owner.workspaceId || saved.kind !== "analysis") throw new Error(t("This analysis belongs to a different project workspace."));
      if (saved.fileState !== "ready") throw new Error(t("Saved analysis files have changed or are missing. Restore the files before reopening this snapshot."));
      const source = saved.manifest.source as { file?: string; inputId?: string; name?: string; format?: string } | undefined;
      if (!source?.file || !source.inputId || !source.name) throw new Error(t("The analysis manifest is incomplete."));
      const file = await bridge.readProjectResultFile(id, source.file);
      if (!isCurrent()) return;
      if (file.fileState !== "ready" || file.sha256 !== saved.files.find((item) => item.name === source.file)?.sha256) throw new Error(t("The analysis source changed while reopening. Try again."));
      const restored = parseDelimited(file.content, source.format === "tsv" ? "\t" : ",");
      const savedConfig = saved.manifest.config as PlotConfig;
      if (!savedConfig || !["scatter", "line", "histogram", "bar"].includes(savedConfig.type) || ![savedConfig.x, savedConfig.y, savedConfig.group].every(Number.isInteger)) throw new Error(t("The analysis manifest is incomplete."));
      setOwnerStates((current) => ({ ...current, [ownerKey]: { ...initialAnalysisState(), dataset: restored, sourceText: file.content, inputId: source.inputId!, name: source.name!, config: savedConfig, column: Math.max(0, Math.min(restored.headers.length - 1, Number(saved.manifest.selectedColumn) || 0)),
        exampleId: typeof saved.manifest.exampleId === "string" ? saved.manifest.exampleId : null, presetIndex: typeof saved.manifest.presetIndex === "number" ? saved.manifest.presetIndex : -1,
        tab: saved.manifest.tab === "data" ? "data" : "plot", question: typeof saved.manifest.question === "string" ? saved.manifest.question : "", resultId: saved.id, threadId: saved.threadId, notice: t("Saved analysis reopened.") } }));
    } catch (reason) { setError(String(reason)); }
    finally { setField("saving", false); }
  }

  const consumedResultRequest = useRef<string | null>(null);
  useEffect(() => {
    if (!openRequest || consumedResultRequest.current === openRequest.token) return;
    consumedResultRequest.current = openRequest.token; void openResult(openRequest.id);
  }, [openRequest, ownerKey]);
  async function useInManuscript() {
    const version = editVersions.current.get(ownerKey) ?? 0;
    try {
      const saved = await saveResult(state.threadId, state.resultId, true);
      if (activeInputRef.current.ownerKey !== ownerKey || (editVersions.current.get(ownerKey) ?? 0) !== version) return;
      await onUseInManuscript?.(saved, "plot.png");
    } catch (reason) { setError(String(reason)); }
  }
  async function askAI(attachOriginal = false) {
    if (!question.trim() || !onAskAI || handingOff) return;
    setField("handingOff", true);
    setError("");
    const context = { file: name.slice(0, 200), rows: dataset.rows.length, columns: dataset.headers.length, missingCells: missing,
      selectedColumn: { name: dataset.headers[column].slice(0, 200), kind: selectedProfile.kind, distinct: selectedProfile.distinct, common: selectedProfile.common.map((item) => ({ ...item, value: item.value.slice(0, 200) })), ...summary }, plot: { ...config, validRows: plot.valid, correlation: plot.correlation },
      sampleHeaders: dataset.headers.slice(0, 20).map((value) => value.slice(0, 200)),
      sampleRows: dataset.rows.slice(0, 5).map((row) => row.slice(0, 20).map((value) => value.slice(0, 200))),
    };
    try {
      const saved = attachOriginal ? await saveResult() : null;
      const source = saved?.files.find((file) => file.role === "source");
      const scope = attachOriginal ? `summary and at most 5 sample rows / 20 columns; complete original file saved at ${source?.path}. The attached file can be read with workspace tools; this does not place every row in the model context` : "summary and at most 5 sample rows / 20 columns only; the full dataset is not attached";
      const threadId = await onAskAI(`${question.trim()}\n\nDataset context (${scope}):\n${JSON.stringify(context, null, 2)}\n\nTreat sample observations as illustrative. Descriptive statistics and the plot correlation above were computed from all valid local rows; do not claim to have inspected the full dataset.`, { id: inputId, name, threadId: state.threadId, ...(saved || state.resultId ? { resultId: saved?.id ?? state.resultId! } : {}), ...(saved && source ? { sourcePath: source.path, attachSource: true } : {}) }, () => activeInputRef.current.ownerKey === ownerKey && activeInputRef.current.inputId === inputId);
      if (typeof threadId === "string") {
        setOwnerStates((current) => { const previous = current[ownerKey] ?? emptyState; return previous.inputId === inputId ? { ...current, [ownerKey]: { ...previous, threadId } } : current; });
        if (saved || state.resultId) await saveResult(threadId, saved?.id ?? state.resultId);
      }
    }
    catch (reason) { setError(`${t("Could not continue the analysis in chat.")} ${String(reason)}`); }
    finally { setField("handingOff", false); }
  }

  const xOptions = config.type === "scatter" ? numeric : config.type === "line" ? profiles.filter((field) => field.kind === "number" || field.kind === "date") : profiles;
  const categorical = profiles.filter((field) => field.kind === "text" && field.distinct <= 30);
  const selectedProfile = profiles[column];
  const plotView = <DataAnalysisPlot ref={chartRef} dataset={dataset} config={config} plot={plot} dateAxis={config.type === "line" && dateValue(dataset.rows.find((row) => dateValue(row[config.x]) !== null)?.[config.x] ?? "") !== null} t={t} />;

  return <main className={`data-analysis${dragging ? " analysis-dragging" : ""}`} aria-label={t("Data analysis")} onDragOver={(event) => { event.preventDefault(); setDragging(true); }} onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false); }} onDrop={(event) => { event.preventDefault(); setDragging(false); void openFile(event.dataTransfer.files[0]); }}>
    <header className="analysis-toolbar">
      <div className="analysis-file-title"><h1 title={name}>{name}</h1><span>{example ? t("Example dataset") : t("Local file")} <span aria-hidden="true">/</span> {dataset.rows.length.toLocaleString()} {t("rows")} <span aria-hidden="true">/</span> {dataset.headers.length} {t("fields")}</span></div>
      <div className="analysis-file-actions"><label className="analysis-example-picker"><span>{t("Examples")}</span><select aria-label={t("Example dataset")} value={exampleId ?? ""} onChange={(event) => { const item = analysisExamples.find((candidate) => candidate.id === event.target.value); if (item) loadExample(item); }}><option disabled value="">{t("Choose an example")}</option>{analysisExamples.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label><button className="analysis-button analysis-primary" onClick={() => inputRef.current?.click()}><Upload size={15} />{t("Open CSV / TSV")}</button></div>
    </header>
    {owner && bridge && <div className="analysis-project-results"><button className="analysis-button" disabled={state.saving} onClick={() => void saveResult().catch((reason) => setError(String(reason)))}>{t("Save analysis to project")}</button>{onUseInManuscript && <button className="analysis-button" disabled={state.saving || !chartRef.current} onClick={() => void useInManuscript()}>{t("Use in manuscript")}</button>}<select aria-label={t("Saved analyses")} value={chosenResults[ownerKey] ?? ""} onChange={(event) => setChosenResults((current) => ({ ...current, [ownerKey]: event.target.value }))}><option value="">{t("Saved analyses")}</option>{(resultsByOwner[ownerKey] ?? []).map((result) => <option key={result.id} value={result.id}>{result.title}</option>)}</select><button className="analysis-button" disabled={state.saving || !chosenResults[ownerKey]} onClick={() => void openResult(chosenResults[ownerKey])}>{t("Open saved analysis")}</button>{state.notice && <span role="status">{state.notice}</span>}</div>}
    <input ref={inputRef} hidden type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" onChange={(event) => { void openFile(event.target.files?.[0]); event.target.value = ""; }} />
    {error && <div className="analysis-error" role="alert">{t(error)}<button aria-label={t("Dismiss")} onClick={() => setError("")}><X size={16} /></button></div>}
    {tab === "data" && <div hidden aria-hidden="true">{plotView}</div>}
    <div className="analysis-body">
      <aside className="analysis-fields">
        <h2>{t("Fields")}</h2><p className="analysis-muted">{t("Select a field to inspect it.")}</p>
        <div className="analysis-field-list">{dataset.headers.map((header, index) => <button key={index} className={index === column ? "selected" : ""} aria-pressed={index === column} title={header} onClick={() => setColumn(index)}><span aria-hidden="true">{profiles[index].kind === "number" ? "#" : profiles[index].kind === "date" ? "↗" : "Aa"}</span><span>{header}</span></button>)}</div>
        <section className="analysis-field-detail"><h3>{dataset.headers[column]}</h3><div className="analysis-definition">{selectedProfile.kind === "number" ? t("Numeric") : selectedProfile.kind === "date" ? t("Date") : t("Categorical")} <span>{selectedProfile.distinct.toLocaleString()} {t("distinct")}</span></div>
          <dl className="analysis-statistics">{(selectedProfile.kind === "number" ? [["Mean", format(summary.mean)], ["Median", format(summary.median)], ["Minimum", format(summary.min)], ["Maximum", format(summary.max)]] : [["Present", (dataset.rows.length - selectedProfile.missing).toLocaleString()]]).concat([["Missing", String(selectedProfile.missing)]]).map(([label, value]) => <div key={label}><dt>{t(label)}</dt><dd>{value}</dd></div>)}</dl>
          {selectedProfile.kind === "text" && <div className="analysis-frequencies">{selectedProfile.common.map((item) => <div key={item.value}><span title={item.value}>{item.value}</span><span>{item.count}</span></div>)}</div>}
        </section><p className="analysis-local-note">{owner && bridge ? t("Statistics and plots run locally without a model. Save an analysis to keep its source, settings and chart in this project.") : t("Local processing. Files are kept for this session only.")}</p>
      </aside>
      <div className="analysis-main">
        <div className="analysis-view-toolbar"><Tabs label={t("Analysis view")} value={tab} onChange={setTab} className="analysis-tabs"><Tab value="plot" controls="analysis-plot-panel">{t("Visualization")}</Tab><Tab value="data" controls="analysis-data-panel">{t("Data table")}</Tab></Tabs>{tab === "plot" && <button className="analysis-button" onClick={downloadChart} disabled={!plot.points.length}><Download size={15} />{t("Export SVG")}</button>}</div>
        {tab === "plot" ? <section id="analysis-plot-panel" className="analysis-plot-panel" role="tabpanel" aria-label={t("Visualization")}>
          {example && <div className="analysis-presets"><span>{t("Try a view")}</span>{example.presets.map((preset, index) => <button key={preset.label} aria-pressed={presetIndex === index} className={presetIndex === index ? "selected" : ""} onClick={() => { setConfig(preset.config); setColumn(preset.config.y); setPresetIndex(index); }}>{t(preset.label)}</button>)}</div>}
          <div className="analysis-plot-controls">
            <label>{t("Chart type")}<select aria-label={t("Chart type")} value={config.type} onChange={(event) => updateConfig({ type: event.target.value as PlotConfig["type"] })}><option value="scatter">{t("Scatter")}</option><option value="bar">{t("Group means")}</option><option value="line">{t("Line chart")}</option><option value="histogram">{t("Distribution")}</option></select></label>
            {config.type !== "histogram" && <label>{config.type === "bar" ? t("Group by") : "X"}<select aria-label={t("X field")} value={config.x} onChange={(event) => updateConfig({ x: Number(event.target.value) })}>{xOptions.map((field) => <option key={field.index} value={field.index}>{dataset.headers[field.index]}</option>)}</select></label>}
            <label>{config.type === "histogram" ? t("Measurement") : "Y"}<select aria-label={t("Y field")} value={config.y} onChange={(event) => updateConfig({ y: Number(event.target.value) })}>{!numeric.length && <option value={-1}>{t("No numeric fields")}</option>}{numeric.map((field) => <option key={field.index} value={field.index}>{dataset.headers[field.index]}</option>)}</select></label>
            {(config.type === "scatter" || config.type === "line") && <label>{t("Color by")}<select aria-label={t("Color by")} value={config.group} onChange={(event) => updateConfig({ group: Number(event.target.value) })}><option value={-1}>{t("No grouping")}</option>{categorical.map((field) => <option key={field.index} value={field.index}>{dataset.headers[field.index]}</option>)}</select></label>}
          </div>
          {plotView}
          <footer className="analysis-plot-footer"><span>{plot.valid.toLocaleString()} / {dataset.rows.length.toLocaleString()} {t("valid rows")}{plot.points.length === 2000 && plot.valid > 2000 ? ` · ${t("Display sampled to 2,000 points")}` : ""}{plot.omittedGroups > 0 ? ` · ${plot.omittedGroups} ${t("groups not displayed")}` : ""}</span>{plot.correlation !== null && config.type === "scatter" && <span>{t("Pearson r")} <strong>{format(plot.correlation)}</strong></span>}</footer>
        </section> : <section id="analysis-data-panel" role="tabpanel" aria-label={t("Data table")} className="analysis-data-panel"><div className="analysis-table-scroll"><table><thead><tr><th>#</th>{dataset.headers.map((header, i) => <th key={i}>{header}</th>)}</tr></thead><tbody>{dataset.rows.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE).map((row, i) => <tr key={i}><td>{page * PAGE_SIZE + i + 1}</td>{row.map((cell, j) => <td key={j} title={cell}>{cell || "—"}</td>)}</tr>)}</tbody></table></div><div className="analysis-pagination"><span>{page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, dataset.rows.length)} / {dataset.rows.length.toLocaleString()}</span><button className="analysis-button" disabled={!page} onClick={() => setPage((current) => current - 1)}>{t("Previous")}</button><button className="analysis-button" disabled={(page + 1) * PAGE_SIZE >= dataset.rows.length} onClick={() => setPage((current) => current + 1)}>{t("Next")}</button></div></section>}
        <div className="analysis-notebook">
          {example && <section className="analysis-guide"><h2>{example.title}</h2><p>{presetIndex >= 0 ? t(example.presets[presetIndex].explanation) : t(example.description)}</p><details><summary>{t("How to use this dataset")}</summary><ol><li>{t("Choose a suggested view above to see a complete example.")}</li><li>{t("Change the axes, chart type or color grouping to explore another relationship.")}</li><li>{t("Inspect fields on the left. Switch to Data table to check the original values.")}</li><li>{t("Export the chart, or draft a question below to continue in your research chat.")}</li></ol><p>{t("Missing tokens: empty, NA, N/A, NaN and null. All statistics use the full dataset; missing numeric values are excluded.")}</p></details><a href={example.source} target="_blank" rel="noreferrer">{t("Dataset source")}</a><span className="analysis-source-credit">{example.credit}</span></section>}
          <section className="analysis-question"><label htmlFor="analysis-question">{t("Continue in research chat")}</label><div><input id="analysis-question" value={question} onChange={(event) => setQuestion(event.target.value)} placeholder={t("Ask about a pattern, result or next analysis…")} onKeyDown={(event) => { if (event.key === "Enter" && !event.nativeEvent.isComposing) { event.preventDefault(); void askAI(); } }} /><button aria-label={t("Continue in chat")} disabled={!question.trim() || !onAskAI || handingOff} aria-busy={handingOff} onClick={() => void askAI()}><ArrowRight size={18} /></button></div><p>{t("Creates a draft with statistics and 5 sample rows. The full file is not attached.")}</p>{owner && bridge && <><button className="analysis-button" disabled={!question.trim() || !onAskAI || handingOff || state.saving} onClick={() => void askAI(true)}>{t("Continue with original CSV / TSV")}</button><p>{t("Saves the complete file in this workspace and attaches its path. The agent can read it with tools; all rows are not inserted into the message.")}</p></>}</section>
        </div>
      </div>
    </div>
  </main>;
}
