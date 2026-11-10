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

type Harness = "codex" | "claude";
type Props = { bridge: ResearchDeskBridge; workspace: string; busy: boolean; onStart: (input: { pdfPath: string; backend: Harness; language: string; length: string; instructions: string; mineruToken: string }) => Promise<void> };
const examplesList = [cover, motivation, architecture, collaboration, results, examples, training, evaluation];

export default function PaperToSlidesView({ bridge, workspace, busy, onStart }: Props) {
  const { t } = useUISettings();
  const [file, setFile] = useState("");
  const [backend, setBackend] = useState<Harness>("codex");
  const [language, setLanguage] = useState("English");
  const [length, setLength] = useState("auto");
  const [instructions, setInstructions] = useState("");
  const [mineruToken, setMineruToken] = useState("");
  const [selected, setSelected] = useState(0);
  const filmstripRef = useRef<HTMLDivElement>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const filename = file.split(/[\\/]/).pop() || "";
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
    try { setError(""); const selectedFile = await bridge.choosePaperReviewPdf(); if (selectedFile) setFile(selectedFile); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
  }
  async function start() {
    if (!file || starting || busy) return;
    setStarting(true); setError("");
    try { await onStart({ pdfPath: file, backend, language, length, instructions: instructions.trim(), mineruToken }); setMineruToken(""); }
    catch (e) { setError(e instanceof Error ? e.message : String(e)); }
    finally { setStarting(false); }
  }
  return <main className="slides-app" aria-label={t("Paper to Slides")}>
    <div className="slides-app-inner">
      <header className="slides-heading"><div><div className="slides-breadcrumb"><Presentation size={15} /> {t("RESEARCH APPS")} <span>/</span> {t("WRITING & DELIVERY")}</div><h1>{t("Paper to Slides")}</h1><p>{t("A thoughtful presentation starts with the paper.")}</p></div></header>
      <section className="slides-showcase" aria-label={t("Presentation example")}>
        <div className="slides-showcase-heading"><div><span className="slides-section-index">01 / {t("EXAMPLE")}</span><h2>CoworkOS <span>— {t("from paper to presentation")}</span></h2></div><span className="slides-example-meta">27 {t("slides")} · {t("English")}</span></div>
        <div className="slides-gallery"><button className="slides-gallery-arrow" onClick={() => setSelected((selected + examplesList.length - 1) % examplesList.length)} aria-label={t("Previous slide")}><ChevronLeft size={18} /></button><div className="slides-gallery-frame"><img src={examplesList[selected]} alt={`${t("CoworkOS presentation example")} ${selected + 1}`} /></div><button className="slides-gallery-arrow" onClick={() => setSelected((selected + 1) % examplesList.length)} aria-label={t("Next slide")}><ChevronRight size={18} /></button></div>
        <div className="slides-filmstrip" ref={filmstripRef}>{examplesList.map((image, index) => <button key={image} onClick={() => setSelected(index)} className={selected === index ? "is-active" : ""} aria-label={`${t("Show example slide")} ${index + 1}`} aria-pressed={selected === index}><img src={image} alt="" /></button>)}</div>
        <div className="slides-example-caption"><span>{t("Example deck")}: CoworkOS</span><span>{t("Based on the CoworkOS research paper.")}</span></div>
      </section>
      <section className="slides-create"><div className="slides-create-intro"><span className="slides-section-index">02 / {t("CREATE")}</span><h2>{t("Make your own")}</h2><p>{t("Select a paper and an agent. The task continues in Work, where you can follow its progress and respond to approvals.")}</p></div>
        <div className="slides-form"><div className="slides-file-row"><div className="slides-file-icon"><FileText size={19} /></div><div className="slides-file-name"><strong>{filename || t("Choose a paper PDF")}</strong><span>{file ? file : t("A copy is placed in your current workspace.")}</span></div><button type="button" className="slides-secondary" onClick={() => void choose()}><FolderOpen size={15} /> {file ? t("Change") : t("Choose PDF")}</button></div>
          <div className="slides-fields"><label>{t("Agent backend")}<select value={backend} onChange={e => setBackend(e.target.value as Harness)}><option value="codex">Codex</option><option value="claude">Claude Code</option></select></label><label>{t("Language")}<select value={language} onChange={e => setLanguage(e.target.value)}><option value="English">{t("English")}</option><option value="Chinese">{t("Chinese")}</option></select></label><label>{t("Length")}<select value={length} onChange={e => setLength(e.target.value)}><option value="auto">{t("Automatic")}</option><option value="concise">{t("Concise")}</option><option value="standard">{t("Standard")}</option><option value="detailed">{t("Detailed")}</option></select></label></div>
          <label className="slides-notes-label">{t("Additional instructions")} <span>{t("Optional")}</span><textarea value={instructions} maxLength={4000} onChange={e => setInstructions(e.target.value)} placeholder={t("For example: focus on the method and ablation experiments.")} rows={2} /></label>
          <label className="slides-notes-label slides-token-label">{t("MinerU API token")} <span>{t("Optional if configured in the app environment; used for this task only")}</span><input type="password" value={mineruToken} autoComplete="off" onChange={e => setMineruToken(e.target.value)} /></label>
          <p className="slides-service-note">{t("Paper2slides uses MinerU cloud to parse the PDF. The paper is uploaded to MinerU and requires a configured MINERU_API_TOKEN and local dependencies.")}</p>
          {!workspace && <p className="slides-error" role="alert">{t("Select a workspace before starting.")}</p>}{error && <p className="slides-error" role="alert">{error}</p>}
          <div className="slides-form-footer"><span>{t("Codex and Claude Code use their own native approvals.")}</span><button className="slides-primary" type="button" disabled={!file || !workspace || busy || starting} onClick={() => void start()}>{starting ? t("Preparing paper…") : t("Create presentation")} <ArrowRight size={16} /></button></div>
        </div>
      </section>
    </div>
  </main>;
}
