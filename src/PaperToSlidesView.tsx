import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, FileText, FolderOpen, Presentation } from "lucide-react";
import { useUISettings } from "./i18n";
import cover from "./assets/paper-to-slides/slide-01.webp";
import motivation from "./assets/paper-to-slides/slide-03.webp";
import architecture from "./assets/paper-to-slides/slide-05.webp";
import collaboration from "./assets/paper-to-slides/slide-09.webp";
import results from "./assets/paper-to-slides/slide-14.webp";
import examples from "./assets/paper-to-slides/slide-19.webp";
import training from "./assets/paper-to-slides/slide-22.webp";
import evaluation from "./assets/paper-to-slides/slide-24.webp";
import "./paper-to-slides.css";
import type { ManuscriptOpenRequest, ManuscriptOrigin } from "./manuscript-handoff";

type Harness = "codex" | "claude";
export type PaperToSlidesStartInput = { pdfPath: string; backend: Harness; language: string; length: string; instructions: string; mineruToken: string; manuscript?: ManuscriptOrigin };
type SlidesSetup = { checks: Array<{ id: string; label: string; status: "ready" | "missing" | "optional"; detail: string }>; canStart: boolean };
type Props = { bridge: ResearchDeskBridge; workspace: string; busy: boolean; onStart: (input: PaperToSlidesStartInput) => Promise<void>; active?: boolean; ownerKey?: string; dataRoot?: string; projectId?: string | null; manuscriptRequest?: ManuscriptOpenRequest; onReturnToManuscript?: (origin: ManuscriptOrigin) => Promise<void>; nativeConfig?: AgentBackendConfig | null; onOpenModelSettings?: () => void; onConfigureSetup?: (text: string) => void };
const examplesList = [cover, motivation, architecture, collaboration, results, examples, training, evaluation];

export default function PaperToSlidesView(props: Props) {
  const key = props.ownerKey ?? props.workspace;
  const [visited, setVisited] = useState<Record<string, Pick<Props, "workspace" | "dataRoot" | "projectId">>>({});
  useEffect(() => { setVisited((current) => ({ ...current, [key]: { workspace: props.workspace, dataRoot: props.dataRoot, projectId: props.projectId } })); }, [key]);
  return <>{Object.entries({ ...visited, [key]: { workspace: props.workspace, dataRoot: props.dataRoot, projectId: props.projectId } }).map(([ownerKey, owner]) => <div key={ownerKey} hidden={ownerKey !== key || props.active === false} className="manuscript-owner-workspace"><PaperToSlidesWorkspace {...props} {...owner} active={ownerKey === key && props.active !== false} manuscriptRequest={ownerKey === key ? props.manuscriptRequest : undefined} /></div>)}</>;
}

function PaperToSlidesWorkspace({ bridge, workspace, dataRoot, projectId, active = true, manuscriptRequest, onReturnToManuscript, busy, onStart, nativeConfig, onOpenModelSettings, onConfigureSetup }: Props) {
  const { t } = useUISettings();
  const [file, setFile] = useState("");
  const [manuscript, setManuscript] = useState<ManuscriptOrigin | null>(null);
  const appliedRequest = useRef("");
  const [backend, setBackend] = useState<Harness>("codex");
  const [language, setLanguage] = useState("English");
  const [length, setLength] = useState("auto");
  const [instructions, setInstructions] = useState("");
  const [mineruToken, setMineruToken] = useState("");
  const [selected, setSelected] = useState(0);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [setupResults, setSetupResults] = useState<Record<string, SlidesSetup>>({});
  const [checkingSetup, setCheckingSetup] = useState(false);
  const activation = useRef({ active, version: 0 });
  if (activation.current.active !== active) activation.current = { active, version: activation.current.version + 1 };
  const liveInput = useRef({ file, backend, language, length, instructions, mineruToken, manuscript });
  liveInput.current = { file, backend, language, length, instructions, mineruToken, manuscript };
  const setupScope = `${backend}:${Boolean(mineruToken.trim())}`;
  const setup = setupResults[setupScope];
  useEffect(() => { setSetupResults({}); }, [nativeConfig]);
  async function checkSetup(): Promise<SlidesSetup> {
    setCheckingSetup(true); setError("");
    try {
      if (!bridge.checkPaperToSlidesSetup || !bridge.checkAgentBackend || !bridge.getAgentBackendConfig) throw new Error(t("Restart the desktop app to check presentation setup."));
      const saved = nativeConfig || await bridge.getAgentBackendConfig();
      const profile = saved.profiles?.[backend] || (saved.backend === backend ? saved : { binary: backend, model: "" });
      const [cli, dependencies] = await Promise.all([bridge.checkAgentBackend({ ...saved, ...profile, backend }), bridge.checkPaperToSlidesSetup({ backend, hasTaskToken: Boolean(mineruToken.trim()) })]);
      const result: SlidesSetup = { canStart: cli.ready && dependencies.canStart, checks: [{ id: "native-agent", label: backend === "codex" ? "Codex" : "Claude Code", status: cli.ready ? "ready" : "missing", detail: cli.message }, ...dependencies.checks] };
      setSetupResults((current) => ({ ...current, [setupScope]: result })); return result;
    } catch (reason) {
      const result: SlidesSetup = { canStart: false, checks: [{ id: "setup-check", label: t("Task setup"), status: "missing", detail: String(reason) }] };
      setSetupResults((current) => ({ ...current, [setupScope]: result })); return result;
    } finally { setCheckingSetup(false); }
  }
  const filename = file.split(/[\\/]/).pop() || "";
  useEffect(() => {
    if (!active || !manuscriptRequest || appliedRequest.current === manuscriptRequest.token) return;
    const { origin } = manuscriptRequest;
    if (origin.dataRoot !== (dataRoot ?? workspace) || origin.projectId !== projectId) return;
    appliedRequest.current = manuscriptRequest.token; setManuscript(origin); setFile(`${origin.workspace}/${origin.pdfPath}`); setError("");
  }, [manuscriptRequest?.token, active]);
  useEffect(() => {
    const strip = filmstripRef.current;
    const active = strip?.querySelector<HTMLButtonElement>(".is-active");
    if (!strip || !active) return;
    const bounds = strip.getBoundingClientRect();
    const item = active.getBoundingClientRect();
    if (item.left < bounds.left) strip.scrollLeft -= bounds.left - item.left;
    else if (item.right > bounds.right) strip.scrollLeft += item.right - bounds.right;
  }, [selected]);
  async function choose() {
    try { setError(""); const selectedFile = await bridge.choosePaperReviewPdf(); if (selectedFile) { setFile(selectedFile); setManuscript(null); } }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function start() {
    if (!file || starting || busy) return;
    setStarting(true); setError("");
    const input = liveInput.current, version = activation.current.version;
    try {
      const checked = setup || await checkSetup();
      if (!checked.canStart) return;
      if (!activation.current.active || activation.current.version !== version || Object.keys(input).some((field) => input[field as keyof typeof input] !== liveInput.current[field as keyof typeof input])) throw new Error(t("The presentation inputs changed during setup. Check them and start again."));
      await onStart({ pdfPath: input.file, backend: input.backend, language: input.language, length: input.length, instructions: input.instructions.trim(), mineruToken: input.mineruToken, ...(input.manuscript ? { manuscript: input.manuscript } : {}) }); setMineruToken("");
    }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setStarting(false); }
  }
  return <main className="slides-app" aria-label={t("Paper to Slides")}>
    <div className="slides-app-inner">
      <header className="slides-heading"><div><div className="slides-breadcrumb"><Presentation size={15} /> {t("RESEARCH APPS")} <span>/</span> {t("WRITING & DELIVERY")}</div><h1>{t("Paper to Slides")}</h1><p>{t("A thoughtful presentation starts with the paper.")}</p></div></header>
      <section className="slides-showcase" aria-label={t("Presentation example")}>
        <div className="slides-showcase-heading"><div><span className="slides-section-index">01 / {t("EXAMPLE")}</span><h2>CoworkOS <span>— {t("from paper to presentation")}</span></h2></div></div>
        <div className="slides-gallery"><button className="slides-gallery-arrow" onClick={() => setSelected((selected + examplesList.length - 1) % examplesList.length)} aria-label={t("Previous slide")}><ChevronLeft size={18} /></button><div className="slides-gallery-frame"><img src={examplesList[selected]} alt={`${t("CoworkOS presentation example")} ${selected + 1}`} /></div><button className="slides-gallery-arrow" onClick={() => setSelected((selected + 1) % examplesList.length)} aria-label={t("Next slide")}><ChevronRight size={18} /></button></div>
        <div className="slides-filmstrip" ref={filmstripRef}>{examplesList.map((image, index) => <button key={image} onClick={() => setSelected(index)} className={selected === index ? "is-active" : ""} aria-label={`${t("Show example slide")} ${index + 1}`} aria-pressed={selected === index}><img src={image} alt="" /></button>)}</div>
        <div className="slides-example-caption"><span>{t("Example deck")}: CoworkOS</span><span>{t("Based on the CoworkOS research paper.")}</span></div>
      </section>
      <section className="slides-create"><div className="slides-create-intro"><span className="slides-section-index">02 / {t("CREATE")}</span><h2>{t("Make your own")}</h2><p>{t("Select a paper and an agent. The task continues in Work, where you can follow its progress and respond to approvals.")}</p></div>
        <div className="slides-form"><div className="slides-file-row"><div className="slides-file-icon"><FileText size={19} /></div><div className="slides-file-name"><strong>{filename || t("Choose a paper PDF")}</strong><span>{file ? file : t("A copy is placed in your current workspace.")}</span></div><button type="button" className="slides-secondary" onClick={() => void choose()}><FolderOpen size={15} /> {file ? t("Change") : t("Choose PDF")}</button></div>
          {manuscript && <div className="manuscript-source-receipt"><strong>{manuscript.mainPath}</strong><span>{t("Source version")}: <code title={manuscript.sourceVersion}>{manuscript.sourceVersion.slice(0, 12)}</code> · PDF <code title={manuscript.pdfSha256}>{manuscript.pdfSha256.slice(0, 12)}</code></span>{onReturnToManuscript && <button className="slides-secondary" onClick={() => void onReturnToManuscript(manuscript).catch((cause) => setError(String(cause)))}>{t("Return to source manuscript")}</button>}</div>}
          <div className="slides-fields"><label>{t("Agent backend")}<select value={backend} onChange={e => setBackend(e.target.value as Harness)}><option value="codex">Codex</option><option value="claude">Claude Code</option></select></label><label>{t("Language")}<select value={language} onChange={e => setLanguage(e.target.value)}><option value="English">{t("English")}</option><option value="Chinese">{t("Chinese")}</option></select></label><label>{t("Length")}<select value={length} onChange={e => setLength(e.target.value)}><option value="auto">{t("Automatic")}</option><option value="concise">{t("Concise")}</option><option value="standard">{t("Standard")}</option><option value="detailed">{t("Detailed")}</option></select></label></div>
          <label className="slides-notes-label">{t("Additional instructions")} <span>{t("Optional")}</span><textarea value={instructions} maxLength={4000} onChange={e => setInstructions(e.target.value)} placeholder={t("For example: focus on the method and ablation experiments.")} rows={2} /></label>
          <label className="slides-notes-label slides-token-label">{t("MinerU API token")} <span>{t("Optional if configured in the app environment; used for this task only")}</span><input type="password" value={mineruToken} autoComplete="off" onChange={e => setMineruToken(e.target.value)} /></label>
          <p className="slides-service-note">{t("Paper2slides uses MinerU cloud to parse the PDF. The paper is uploaded to MinerU and requires a configured MINERU_API_TOKEN and local dependencies.")}</p>
          <div className="slides-setup"><button type="button" className="slides-secondary" disabled={checkingSetup || starting} onClick={() => void checkSetup()}>{checkingSetup ? t("Checking task setup…") : t("Check task setup")}</button>{onOpenModelSettings && <button type="button" className="slides-secondary" onClick={onOpenModelSettings}>{t("Agent settings")}</button>}{setup && <><p role="status">{setup.canStart ? t("Required local dependencies and the selected agent were found. Service authentication and output quality are checked during the task.") : t("Complete the missing setup before creating this presentation.")}</p>{!setup.canStart && onConfigureSetup && <button type="button" className="slides-secondary" onClick={() => onConfigureSetup(t("Help me configure the local Paper to Slides environment for {backend}. These checks failed:\n{checks}\n\nExplain the required commands and verification steps before running anything. Do not start a presentation task.", { backend, checks: setup.checks.filter((item) => item.status === "missing").map((item) => `${item.label}: ${item.detail}`).join("\n") }))}>{t("Prepare setup in chat")}</button>}<ul>{setup.checks.filter((item) => item.status === "missing").map((item) => <li key={item.id}><strong>{item.label}</strong>: {item.detail}</li>)}</ul>{setup.checks.some((item) => item.status === "optional") && <details><summary>{t("Preview and visual checks")}</summary><ul>{setup.checks.filter((item) => item.status === "optional").map((item) => <li key={item.id}><strong>{item.label}</strong>: {item.detail}</li>)}</ul></details>}</>}</div>
          {!workspace && <p className="slides-error" role="alert">{t("Select a workspace before starting.")}</p>}{error && <p className="slides-error" role="alert">{error}</p>}
          <div className="slides-form-footer"><span>{t("Codex and Claude Code use their own native approvals.")}</span><button className="slides-primary" type="button" disabled={!file || !workspace || busy || starting || checkingSetup || setup?.canStart === false} onClick={() => void start()}>{starting ? t("Preparing paper…") : t("Create presentation")} <ArrowRight size={16} /></button></div>
        </div>
      </section>
    </div>
  </main>;
}
