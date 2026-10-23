import { memo, useCallback, useEffect, useMemo, useRef, useState, type MouseEvent as ReactMouseEvent, type WheelEvent as ReactWheelEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import SyntaxHighlighter from "react-syntax-highlighter/dist/esm/prism-light";
import bash from "react-syntax-highlighter/dist/esm/languages/prism/bash";
import c from "react-syntax-highlighter/dist/esm/languages/prism/c";
import cpp from "react-syntax-highlighter/dist/esm/languages/prism/cpp";
import css from "react-syntax-highlighter/dist/esm/languages/prism/css";
import go from "react-syntax-highlighter/dist/esm/languages/prism/go";
import java from "react-syntax-highlighter/dist/esm/languages/prism/java";
import javascript from "react-syntax-highlighter/dist/esm/languages/prism/javascript";
import json from "react-syntax-highlighter/dist/esm/languages/prism/json";
import jsx from "react-syntax-highlighter/dist/esm/languages/prism/jsx";
import latex from "react-syntax-highlighter/dist/esm/languages/prism/latex";
import markdown from "react-syntax-highlighter/dist/esm/languages/prism/markdown";
import markup from "react-syntax-highlighter/dist/esm/languages/prism/markup";
import python from "react-syntax-highlighter/dist/esm/languages/prism/python";
import rust from "react-syntax-highlighter/dist/esm/languages/prism/rust";
import sql from "react-syntax-highlighter/dist/esm/languages/prism/sql";
import tsx from "react-syntax-highlighter/dist/esm/languages/prism/tsx";
import typescript from "react-syntax-highlighter/dist/esm/languages/prism/typescript";
import yaml from "react-syntax-highlighter/dist/esm/languages/prism/yaml";
import ConferenceDiscovery from "./ConferenceDiscovery";
import { useDialogFocus } from "./useDialogFocus";
import {
  AlignLeft,
  ArrowLeft,
  BookOpen,
  Bookmark,
  Bot,
  Boxes,
  Brain,
  CalendarDays,
  Database,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Code2,
  ExternalLink,
  FileCode2,
  FileText,
  Folder,
  FolderOpen,
  GitBranch,
  Flame,
  GraduationCap,
  Highlighter,
  Languages,
  Library,
  ListTree,
  LoaderCircle,
  MessageSquareText,
  Minus,
  PanelRightClose,
  PanelRightOpen,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Square,
  Sparkles,
  Star,
  StickyNote,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";

const LIBRARY_COLORS = ["#3973c8", "#2d8a68", "#a8652e", "#7a5bb5", "#b34f58"];
for (const [name, grammar] of Object.entries({ bash, c, cpp, css, go, java, javascript, json, jsx, latex, markdown, markup, python, rust, sql, tsx, typescript, yaml })) {
  SyntaxHighlighter.registerLanguage(name, grammar);
}

function codebaseLanguage(filePath: string) {
  const fileName = filePath.split("/").at(-1)?.toLowerCase() || "";
  if (["dockerfile", "makefile"].includes(fileName)) return "bash";
  const extension = fileName.split(".").at(-1) || "";
  return ({
    bash: "bash", c: "c", cc: "cpp", cjs: "javascript", cpp: "cpp", css: "css", go: "go",
    h: "c", hpp: "cpp", htm: "markup", html: "markup", java: "java", js: "javascript",
    json: "json", jsonl: "json", jsx: "jsx", md: "markdown", mdx: "markdown", mjs: "javascript",
    py: "python", rs: "rust", sh: "bash", sql: "sql", tex: "latex", toml: "yaml",
    ts: "typescript", tsx: "tsx", xml: "markup", yaml: "yaml", yml: "yaml", zsh: "bash",
  } as Record<string, string>)[extension];
}
const DAILY_TOPICS: Array<{ id: DailyDiscoveryTopic; label: string; description: string }> = [
  { id: "all", label: "All", description: "Recent AI, machine learning, and language-model papers" },
  { id: "ai4ai_rsi", label: "AI4AI/RSI", description: "AI systems improving AI and recursive self-improvement" },
  { id: "gui_compute_use", label: "GUI/Compute Use", description: "Agents operating graphical and computer interfaces" },
  { id: "coding_agents", label: "Coding Agents", description: "Agentic coding and software engineering" },
  { id: "reinforcement_learning", label: "Reinforcement Learning", description: "Learning policies through interaction and feedback" },
  { id: "on_policy_distillation", label: "On-Policy Distillation", description: "Distilling policies from on-policy or online trajectories" },
  { id: "robotics_vla", label: "Robotics/VLA", description: "Robotics and vision-language-action models" },
  { id: "world_models", label: "World Models", description: "Learned environment dynamics and simulation" },
  { id: "reasoning_test_time", label: "Reasoning / Test-Time Scaling", description: "Reasoning and inference-time computation" },
  { id: "interpretability", label: "Interpretability", description: "Understanding and explaining model behavior" },
  { id: "rag", label: "RAG & Long Context", description: "Retrieval, memory, and long-context models" },
  { id: "multimodal", label: "Multimodal", description: "Vision-language and multimodal models" },
  { id: "safety", label: "AI Safety", description: "Alignment, robustness, and red teaming" },
  { id: "science", label: "AI for Science", description: "Scientific discovery and research automation" },
];

function publicPaperRecordUrl(paper: Pick<LibraryPaper, "url" | "conference">) {
  return paper.conference?.presentation_source_url || paper.url;
}

function isGithubRepositoryLink(value: string) {
  return /^https:\/\/github\.com\/[^/]+\/[^/]+/i.test(value);
}

function linkedProjectLabel(value: string) {
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    return host === "github.com" ? "GitHub project" : "Project website";
  } catch {
    return "Linked project";
  }
}

function linkedProjectHost(value: string) {
  try { return new URL(value).hostname.replace(/^www\./, ""); }
  catch { return "Linked project"; }
}

const LIBRARY_GLYPHS: Array<[RegExp, LucideIcon]> = [
  [/\bagent|tool use|workflow\b/i, Bot],
  [/\breason|test-time|scaling|deliberat\b/i, Brain],
  [/\brag\b|retriev|long context|context/i, Database],
  [/\bembodied|vla|robot|vision-language\b/i, Boxes],
];

function LibraryGlyph({ name, size = 20 }: { name: string; size?: number }) {
  const Icon = LIBRARY_GLYPHS.find(([pattern]) => pattern.test(name))?.[1] ?? Library;
  return <span className="library-glyph" aria-hidden="true"><Icon size={size} strokeWidth={1.8} /></span>;
}

type LibraryViewProps = {
  bridge: ResearchDeskBridge;
  mode: "library" | "daily";
  initialDailyMode?: DailyDiscoveryMode | "conference";
  workspace?: string;
  projectId?: string | null;
  libraryRefreshVersion?: number;
  onLibraryImported?: () => void;
  onAgentRun?: (result: AgentRunResult) => void;
};

export default function LibraryView({ bridge, mode, initialDailyMode, workspace = "", projectId, libraryRefreshVersion = 0, onLibraryImported, onAgentRun }: LibraryViewProps) {
  const [libraries, setLibraries] = useState<ResearchLibrary[]>([]);
  const [selectedLibraryId, setSelectedLibraryId] = useState<string | null>(null);
  const [papers, setPapers] = useState<LibraryPaper[]>([]);
  const [selectedPaperId, setSelectedPaperId] = useState<string | null>(null);
  const [readerPaperId, setReaderPaperId] = useState<string | null>(null);
  const [localQuery, setLocalQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [libraryEditor, setLibraryEditor] = useState<ResearchLibrary | "new" | null>(null);
  const [importOpen, setImportOpen] = useState(false);

  const loadLibraries = useCallback(async () => {
    setLoading(true);
    try {
      const nextLibraries = await bridge.listLibraries();
      setLibraries(nextLibraries);
      setError("");
    } catch (loadError) {
      setError(String(loadError));
    } finally {
      setLoading(false);
    }
  }, [bridge]);

  const loadPapers = useCallback(async (libraryId: string, query = "") => {
    setLoading(true);
    try {
      const nextPapers = await bridge.listLibraryPapers(libraryId, query);
      setPapers(nextPapers);
      setSelectedPaperId((current) => nextPapers.some((paper) => paper.id === current) ? current : nextPapers[0]?.id ?? null);
      setError("");
    } catch (loadError) {
      setError(String(loadError));
    } finally {
      setLoading(false);
    }
  }, [bridge]);

  useEffect(() => { void loadLibraries(); }, [libraryRefreshVersion, loadLibraries]);

  useEffect(() => {
    if (!selectedLibraryId) return;
    const timeout = window.setTimeout(() => void loadPapers(selectedLibraryId, localQuery), 160);
    return () => window.clearTimeout(timeout);
  }, [libraryRefreshVersion, loadPapers, localQuery, selectedLibraryId]);

  const selectedLibrary = libraries.find((library) => library.id === selectedLibraryId) ?? null;
  const selectedPaper = papers.find((paper) => paper.id === selectedPaperId) ?? null;
  const readerPaper = papers.find((paper) => paper.id === readerPaperId) ?? null;

  async function saveLibrary(input: { name: string; description: string; color: string }) {
    if (libraryEditor === "new") await bridge.createLibrary(input);
    else if (libraryEditor) await bridge.updateLibrary(libraryEditor.id, input);
    setLibraryEditor(null);
    await loadLibraries();
  }

  async function deleteLibrary() {
    if (!selectedLibrary || !window.confirm(`Delete "${selectedLibrary.name}"? Papers shared with other libraries are kept.`)) return;
    await bridge.deleteLibrary(selectedLibrary.id);
    setSelectedLibraryId(null);
    setPapers([]);
    await loadLibraries();
  }

  async function updatePaper(patch: Parameters<ResearchDeskBridge["updateLibraryPaper"]>[1]) {
    if (!selectedPaper) return;
    const updated = await bridge.updateLibraryPaper(selectedPaper.id, patch);
    setPapers((current) => current.map((paper) => paper.id === updated.id ? updated : paper));
  }

  async function removePaper() {
    if (!selectedLibrary || !selectedPaper || !window.confirm(`Remove "${selectedPaper.title}" from this library?`)) return;
    await bridge.removeLibraryPaper(selectedLibrary.id, selectedPaper.id);
    await Promise.all([loadPapers(selectedLibrary.id, localQuery), loadLibraries()]);
  }

  async function importPaper(paper: AcademicSearchResult) {
    if (!selectedLibrary) return;
    await bridge.addLibraryPaper(selectedLibrary.id, paper);
    await Promise.all([loadPapers(selectedLibrary.id, localQuery), loadLibraries()]);
  }

  if (mode === "daily") {
    return <DailyDiscovery initialMode={initialDailyMode} bridge={bridge} libraries={libraries} loadingLibraries={loading} onImported={async () => {
      await loadLibraries();
      onLibraryImported?.();
    }} />;
  }

  if (!selectedLibrary) {
    return <section className="library-page">
      <header className="library-page-header">
        <div><span className="eyebrow">Knowledge base</span><h1>Literature library</h1><p>Curated research directions with searchable, reusable paper records.</p></div>
        <button className="primary-button" onClick={() => setLibraryEditor("new")}><Plus size={15} />New library</button>
      </header>
      {error && <div className="library-error">{error}</div>}
      {loading && !libraries.length ? <LoadingState /> : <div className="library-card-grid">
        {libraries.map((library) => <button className="library-card" key={library.id} onClick={() => setSelectedLibraryId(library.id)}>
          <LibraryGlyph name={library.name} />
          <span className="library-card-copy">
            <span className="library-card-title"><strong>{library.name}</strong><span className="library-color-dot" style={{ background: library.color }} aria-hidden="true" /></span>
            <small>{library.description}</small>
          </span>
          <span className="library-card-meta"><b>{library.paper_count}</b> papers<ExternalLink size={13} /></span>
        </button>)}
      </div>}
      <LibraryEditor editor={libraryEditor} onClose={() => setLibraryEditor(null)} onSave={saveLibrary} />
    </section>;
  }

  if (readerPaper) {
    return <PaperReadingWorkbench
      paper={readerPaper}
      library={selectedLibrary}
      onBack={() => setReaderPaperId(null)}
      onUpdate={updatePaper}
      bridge={bridge}
      workspace={workspace}
      projectId={projectId}
      onAgentRun={onAgentRun}
    />;
  }

  return <section className="library-page library-detail-page">
    <header className="library-detail-header">
      <button className="icon-button" onClick={() => setSelectedLibraryId(null)} title="All libraries"><ArrowLeft size={17} /></button>
      <LibraryGlyph name={selectedLibrary.name} size={19} />
      <div><span className="eyebrow">Literature library</span><h1 className="library-detail-title"><span>{selectedLibrary.name}</span><span className="library-color-dot" style={{ background: selectedLibrary.color }} aria-hidden="true" /></h1></div>
      <div className="library-header-actions">
        <button className="icon-button" onClick={() => setLibraryEditor(selectedLibrary)} title="Edit library"><Pencil size={15} /></button>
        <button className="icon-button danger" onClick={() => void deleteLibrary()} title="Delete library"><Trash2 size={15} /></button>
        <button className="primary-button" onClick={() => setImportOpen(true)}><Plus size={15} />Import paper</button>
      </div>
    </header>
    <div className="library-description">{selectedLibrary.description}</div>
    <div className="library-toolbar"><Search size={15} /><input value={localQuery} onChange={(event) => setLocalQuery(event.target.value)} placeholder="Search title, author, abstract, or venue" /><span>{papers.length} papers</span></div>
    {error && <div className="library-error">{error}</div>}
    <div className="library-split">
      <div className="library-paper-list">
        {loading && !papers.length ? <LoadingState /> : papers.length ? papers.map((paper) => <button className={paper.id === selectedPaperId ? "library-paper-row selected" : "library-paper-row"} key={paper.id} onClick={() => setSelectedPaperId(paper.id)}>
          <span className="paper-row-year">{paper.year ?? "—"}</span>
          <span><strong>{paper.title}</strong><small>{paper.authors.slice(0, 3).join(", ")}{paper.authors.length > 3 ? " et al." : ""}</small></span>
          {paper.starred && <Star size={13} fill="currentColor" />}
        </button>) : <div className="empty-library"><BookOpen size={22} /><strong>No matching papers</strong><span>Import a paper or change the search query.</span></div>}
      </div>
      <PaperInspector paper={selectedPaper} onUpdate={updatePaper} onRemove={removePaper} onRead={() => selectedPaper && setReaderPaperId(selectedPaper.id)} />
    </div>
    <LibraryEditor editor={libraryEditor} onClose={() => setLibraryEditor(null)} onSave={saveLibrary} />
    <PaperImportModal open={importOpen} bridge={bridge} library={selectedLibrary} onClose={() => setImportOpen(false)} onImport={importPaper} />
  </section>;
}

function PaperInspector({ paper, onUpdate, onRemove, onRead }: { paper: LibraryPaper | null; onUpdate: (patch: Parameters<ResearchDeskBridge["updateLibraryPaper"]>[1]) => Promise<void>; onRemove: () => Promise<void>; onRead: () => void }) {
  const [notes, setNotes] = useState("");
  useEffect(() => setNotes(paper?.notes ?? ""), [paper]);
  if (!paper) return <div className="paper-inspector empty"><BookOpen size={24} /><span>Select a paper to inspect its record.</span></div>;
  return <article className="paper-inspector">
    <div className="paper-inspector-kicker"><span>{paper.venue || "Research paper"}</span><span>{paper.year ?? "Year unknown"}</span></div>
    <div className="paper-inspector-title"><h2>{paper.title}</h2><button className={paper.starred ? "icon-button starred" : "icon-button"} onClick={() => void onUpdate({ starred: !paper.starred })} title={paper.starred ? "Unstar" : "Star"}><Star size={17} fill={paper.starred ? "currentColor" : "none"} /></button></div>
    <p className="paper-authors">{paper.authors.join(", ") || "Authors unavailable"}</p>
    {paper.conference && <div className="conference-saved-metadata"><span>{paper.conference.presentation === "unknown" ? "Unclassified" : paper.conference.presentation === "oral" ? "Oral" : paper.conference.presentation === "spotlight" ? "Spotlight" : "Poster"}</span><a href={paper.conference.presentation_source_url || paper.conference.source_url} target="_blank" rel="noreferrer">Official conference record</a></div>}
    <p className="paper-abstract">{paper.abstract || "No abstract was returned by the metadata provider."}</p>
    <div className="paper-record-row"><label>Reading status<select value={paper.reading_status} onChange={(event) => void onUpdate({ reading_status: event.target.value as ReadingStatus })}><option value="unread">Unread</option><option value="reading">Reading</option><option value="read">Read</option></select></label>{publicPaperRecordUrl(paper) && <a className="outline-button" href={publicPaperRecordUrl(paper)} target="_blank" rel="noreferrer"><ExternalLink size={14} />Open source</a>}</div>
    <button className="paper-reader-launch" onClick={onRead}><BookOpen size={15} /><span><strong>Open reading workspace</strong><small>Notes, evidence, and paper structure</small></span><ChevronRight size={16} /></button>
    <label className="paper-notes">My notes<textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={6} placeholder="Why is this paper useful? What should you verify?" /></label>
    <div className="paper-inspector-actions"><button className="secondary-button danger-text" onClick={() => void onRemove()}><Trash2 size={14} />Remove</button><button className="primary-button" onClick={() => void onUpdate({ notes })}><Save size={14} />Save notes</button></div>
  </article>;
}

type PaperChatMessage = { role: "assistant" | "user"; text: string };
type CodeChatAttachment = { path: string; startLine: number; endLine: number; snippet: string };
type PaperAiMode = "brief" | "audit";
type PaperChatComposerCommand = { id: number; draft?: string };
type SelectionAnchor = { x: number; y: number };
type TranslationPopover = { source: string; translation: string; anchor: SelectionAnchor; error?: string };
type ReaderLibraryPaper = LibraryPaper & { github_url?: string; github_stars?: number };
const PAPER_CHAT_INITIAL_VISIBLE_MESSAGE_COUNT = 60;
const PAPER_CHAT_HISTORY_PAGE_SIZE = 40;
const PAPER_BRIEFING_REQUEST = "Create the initial full-paper reading briefing before answering any follow-up question. First call read_attached_paper_pdf repeatedly for the attached paper, in consecutive page ranges of at most 24 pages, until every available PDF page has been read. Do not substitute the abstract for full text. Then write concise Chinese Markdown with exactly these sections:\n\n## 关键词词典\nList 4-8 essential terms, each with a one-line explanation.\n\n## 三行摘要\nWrite exactly three numbered sentences covering the problem, method, and main evidence/result.\n\n## 论文地图\nUse bullets for research question, method, experiments/evaluation, and main findings. Cite PDF page numbers.\n\n## 局限与待核查\nState limitations explicitly reported by the authors and open questions that need closer reading. Cite page numbers where possible.\n\nBe evidence-aware: distinguish what the paper states from your inference.";
const HIGHLIGHT_COLORS: Array<{ value: PaperHighlightInput["color"]; label: string }> = [
  { value: "yellow", label: "Yellow" },
  { value: "red", label: "Red" },
  { value: "blue", label: "Blue" },
  { value: "green", label: "Green" },
];

const PaperChatMarkdown = memo(function PaperChatMarkdown({ text }: { text: string }) {
  return <div className="paper-ai-markdown"><ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{normalizePaperMathDelimiters(text)}</ReactMarkdown></div>;
});

const PaperChatMessageRow = memo(function PaperChatMessageRow({ message }: { message: PaperChatMessage }) {
  return <article className={message.role}><span>{message.role === "assistant" ? <Bot size={14} /> : "You"}</span>{message.role === "assistant" ? <PaperChatMarkdown text={message.text} /> : <p>{message.text}</p>}</article>;
});

const PaperChatThread = memo(function PaperChatThread({ messages, busy, aiMode, onAsk }: {
  messages: PaperChatMessage[]; busy: boolean; aiMode: PaperAiMode; onAsk: (prompt: string) => void;
}) {
  const [historyStart, setHistoryStart] = useState(() => Math.max(0, messages.length - PAPER_CHAT_INITIAL_VISIBLE_MESSAGE_COUNT));
  const historyInitializedRef = useRef(messages.length > 0);
  const visibleMessages = messages.slice(historyStart);
  const hiddenMessageCount = historyStart;
  const hasAssistantMessage = useMemo(() => messages.some((message) => message.role === "assistant"), [messages]);
  useEffect(() => {
    if (!messages.length) {
      historyInitializedRef.current = false;
      setHistoryStart(0);
      return;
    }
    if (!historyInitializedRef.current) {
      historyInitializedRef.current = true;
      setHistoryStart(Math.max(0, messages.length - PAPER_CHAT_INITIAL_VISIBLE_MESSAGE_COUNT));
      return;
    }
    setHistoryStart((current) => Math.min(current, Math.max(0, messages.length - PAPER_CHAT_INITIAL_VISIBLE_MESSAGE_COUNT)));
  }, [messages.length]);
  const prompt = (audit: string, brief: string) => () => onAsk(aiMode === "audit" ? audit : brief);

  return <div className="paper-ai-thread">
    {messages.length ? <>
      {hiddenMessageCount > 0 && <button className="paper-ai-load-history" onClick={() => setHistoryStart((current) => Math.max(0, current - PAPER_CHAT_HISTORY_PAGE_SIZE))}>Show {Math.min(PAPER_CHAT_HISTORY_PAGE_SIZE, hiddenMessageCount)} earlier messages</button>}
      {visibleMessages.map((message, index) => <PaperChatMessageRow key={`${message.role}-${index + historyStart}`} message={message} />)}
    </> : <div className="paper-ai-empty"><Bot size={22} /><strong>{aiMode === "audit" ? "Ready for a strict code audit" : "Reading the full paper"}</strong><p>{aiMode === "audit" ? "Ask about a method, configuration, or selected code. Archimedes will trace it to paper and repository evidence." : "Archimedes is building a page-grounded guide before taking detailed questions."}</p></div>}
    {busy && <div className="paper-ai-working"><LoaderCircle className="spin" size={15} />{messages.length ? "Archimedes is reading…" : aiMode === "audit" ? "Tracing paper and code evidence…" : "Reading PDF pages and building the guide…"}</div>}
    {hasAssistantMessage && !busy && <div className="paper-ai-suggestions">
      <button onClick={prompt("请核验论文的核心方法在代码中由哪些文件和函数实现，并建立证据链。", "这篇论文最核心的贡献是什么？请结合全文说明。")}>{aiMode === "audit" ? "核验方法" : "核心贡献"}</button>
      <button onClick={prompt("请检查训练与评估配置是否支持论文中的实验主张。", "请细讲方法部分：输入、关键机制、训练或推理流程分别是什么？")}>{aiMode === "audit" ? "核验实验" : "讲解方法"}</button>
      <button onClick={prompt("请列出论文中的哪些关键主张在代码中无法确认或尚未实现。", "实验设置、数据集、基线、指标和主要结果分别是什么？")}>{aiMode === "audit" ? "缺口分析" : "查看实验"}</button>
      <button onClick={prompt("请给出最短的复现实验路径：入口、配置、数据和评估步骤。", "论文有哪些局限、威胁或尚未验证的主张？")}>{aiMode === "audit" ? "复现路径" : "分析局限"}</button>
    </div>}
  </div>;
});

const PaperChatComposer = memo(function PaperChatComposer({ busy, cancelling, canInterrupt, attachments, command, onAsk, onInterrupt, onRemoveAttachment }: {
  busy: boolean; cancelling: boolean; canInterrupt: boolean; attachments: CodeChatAttachment[]; command: PaperChatComposerCommand;
  onAsk: (prompt: string) => boolean; onInterrupt: () => void; onRemoveAttachment: (index: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const resizeFrameRef = useRef<number | null>(null);
  const resize = useCallback(() => {
    if (resizeFrameRef.current !== null) return;
    resizeFrameRef.current = requestAnimationFrame(() => {
      resizeFrameRef.current = null;
      const textarea = textareaRef.current;
      if (!textarea) return;
      textarea.style.height = "0px";
      textarea.style.height = `${Math.min(textarea.scrollHeight, 132)}px`;
      textarea.style.overflowY = textarea.scrollHeight > 132 ? "auto" : "hidden";
    });
  }, []);
  useEffect(() => () => { if (resizeFrameRef.current !== null) cancelAnimationFrame(resizeFrameRef.current); }, []);
  useEffect(() => { resize(); }, [draft, resize]);
  useEffect(() => {
    if (!command.id) return;
    if (command.draft !== undefined) setDraft(command.draft);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }, [command]);
  function submit() {
    if (!draft.trim() || busy) return;
    if (onAsk(draft)) setDraft("");
  }
  return <div className="paper-ai-compose">
    <div className="paper-ai-compose-input">
      {attachments.length > 0 && <div className="paper-ai-code-attachments">
        {attachments.map((attachment, index) => <div className="paper-ai-code-attachment" key={attachment.path + ":" + attachment.startLine + ":" + index} title={attachment.path + ":" + attachment.startLine + "-" + attachment.endLine}>
          <FileCode2 size={13} /><span>{attachment.path}:{attachment.startLine}{attachment.endLine !== attachment.startLine ? "-" + attachment.endLine : ""}</span><button type="button" onClick={() => onRemoveAttachment(index)} title="Remove code attachment" aria-label={"Remove " + attachment.path + " code attachment"}><X size={12} /></button>
        </div>)}
      </div>}
      <textarea ref={textareaRef} value={draft} onChange={(event) => setDraft(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) { event.preventDefault(); submit(); } }} placeholder={attachments.length ? "Ask about the selected code…" : "Ask about the paper…"} rows={1} />
    </div>
    <button className="primary-button" disabled={busy ? !canInterrupt || cancelling : !draft.trim()} onClick={busy ? onInterrupt : submit}>{busy ? <><Square size={13} fill="currentColor" />{cancelling ? "Stopping" : "Stop"}</> : <><Send size={14} />Send</>}</button>
  </div>;
});

function PaperReadingWorkbench({ paper, library, onBack, onUpdate, bridge, workspace, projectId, onAgentRun }: {
  paper: ReaderLibraryPaper; library: ResearchLibrary; onBack: () => void;
  onUpdate: (patch: Parameters<ResearchDeskBridge["updateLibraryPaper"]>[1]) => Promise<void>;
  bridge: ResearchDeskBridge; workspace: string; projectId?: string | null; onAgentRun?: (result: AgentRunResult) => void;
}) {
  const [reader, setReader] = useState<PaperReaderState | null>(null);
  const [busy, setBusy] = useState<"remote" | "local" | null>(null);
  const [error, setError] = useState("");
  const [pageNumber, setPageNumber] = useState(1);
  const [pdfZoom, setPdfZoom] = useState(1);
  const [query, setQuery] = useState("");
  const [passages, setPassages] = useState<PaperPassage[]>([]);
  const [selection, setSelection] = useState("");
  const [selectionAnchor, setSelectionAnchor] = useState<SelectionAnchor | null>(null);
  const [translationPopover, setTranslationPopover] = useState<TranslationPopover | null>(null);
  const [translating, setTranslating] = useState(false);
  const [highlightPickerOpen, setHighlightPickerOpen] = useState(false);
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [detectedProjectUrl, setDetectedProjectUrl] = useState("");
  const [readerView, setReaderView] = useState<"paper" | "project" | "codebase">("paper");
  const [codebaseVisited, setCodebaseVisited] = useState(false);
  const [repository, setRepository] = useState<PaperRepositorySnapshot | null>(null);
  const [checkout, setCheckout] = useState<RepositoryCheckout | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [checkoutError, setCheckoutError] = useState("");
  const [aiMode, setAiMode] = useState<PaperAiMode>("brief");
  const [codeAttachments, setCodeAttachments] = useState<CodeChatAttachment[]>([]);
  const [composerCommand, setComposerCommand] = useState<PaperChatComposerCommand>({ id: 0 });
  const [chatBusy, setChatBusy] = useState(false);
  const [chatCancelling, setChatCancelling] = useState(false);
  const [chatThreadId, setChatThreadId] = useState<string | undefined>();
  const [chatMessages, setChatMessages] = useState<PaperChatMessage[]>([]);
  const [chatHistoryLoaded, setChatHistoryLoaded] = useState(false);
  const [briefingVersion, setBriefingVersion] = useState(0);
  const briefingStartedRef = useRef(false);
  const ready = reader?.asset?.status === "ready" && reader.pages.length > 0 && Boolean(reader.asset.preview_url);
  const currentPage = reader?.pages.find((page) => page.page_number === pageNumber) ?? reader?.pages[0] ?? null;
  const lastPage = reader?.asset?.page_count ?? reader?.pages.at(-1)?.page_number ?? 1;
  const projectUrl = paper.github_url || detectedProjectUrl;

  const loadReader = useCallback(async () => {
    try {
      const next = await bridge.getLibraryPaperReader(paper.id, workspace);
      setReader(next);
      if (next.pages[0]) setPageNumber((current) => Math.min(Math.max(1, current), next.pages.at(-1)?.page_number ?? 1));
    } catch (loadError) { setError(readableError(loadError, "Could not load the paper reader.")); }
  }, [bridge, paper.id, workspace]);
  useEffect(() => { void loadReader(); }, [loadReader]);
  useEffect(() => {
    let active = true;
    briefingStartedRef.current = false;
    setChatHistoryLoaded(false);
    setChatThreadId(undefined);
    setChatMessages([]);
    void bridge.getLibraryPaperChatThread(paper.id, workspace).then((thread) => {
      if (!active) return;
      if (thread) {
        const messages = thread.messages
          .filter((message) => !(message.role === "user" && message.text === PAPER_BRIEFING_REQUEST))
          .map((message) => ({ role: message.role, text: message.text }));
        setChatThreadId(thread.id);
        setChatMessages(messages);
        briefingStartedRef.current = messages.some((message) => message.role === "assistant");
      }
    }).catch((loadError) => {
      if (active) setError(readableError(loadError, "Could not restore the paper conversation."));
    }).finally(() => {
      if (active) setChatHistoryLoaded(true);
    });
    return () => { active = false; };
  }, [bridge, paper.id, workspace]);

  const selectedHighlight = reader?.highlights.find((highlight) => highlight.page_number === pageNumber &&
    (highlight.quote === selection || highlight.quote.includes(selection) || selection.includes(highlight.quote))) ?? null;

  function clearSelection() { setSelection(""); setSelectionAnchor(null); setHighlightPickerOpen(false); setCommentOpen(false); setComment(""); }
  function closeSelection() { clearSelection(); setTranslationPopover(null); }
  function receiveSelection(text: string, anchor: SelectionAnchor) {
    const next = text.replace(/\s+/g, " ").trim();
    if (!next) return;
    setSelection(next.slice(0, 5000));
    setSelectionAnchor(anchor);
    setTranslationPopover(null);
    setHighlightPickerOpen(false);
    setCommentOpen(false);
  }
  async function prepare(kind: "remote" | "local") {
    setBusy(kind); setError("");
    try {
      const next = kind === "remote"
        ? await bridge.prepareLibraryPaperReader(paper.id, workspace)
        : await bridge.attachLibraryPaperPdf(paper.id, workspace);
      setReader(next);
      setPageNumber(next.pages[0]?.page_number ?? 1);
    } catch (prepareError) { setError(readableError(prepareError, "Could not prepare the original PDF.")); }
    finally { setBusy(null); }
  }
  async function find() {
    if (!query.trim() || !reader) return;
    try {
      const next = await bridge.findLibraryPaperPassages(paper.id, query.trim(), workspace);
      setPassages(next);
      if (next[0]) setPageNumber(next[0].page_number);
      else setError("No matching passage was found in the indexed pages.");
    } catch (findError) { setError(readableError(findError, "Could not search this paper.")); }
  }
  async function saveHighlight(note = "", color: PaperHighlightInput["color"] = "yellow") {
    if (!currentPage || !selection) return;
    const start = currentPage.text.indexOf(selection);
    try {
      const item = await bridge.createLibraryPaperHighlight(paper.id, {
        page_number: currentPage.page_number, quote: selection, note, color,
        start_offset: start >= 0 ? start : undefined,
        end_offset: start >= 0 ? start + selection.length : undefined,
      }, workspace);
      setReader((current) => current ? { ...current, highlights: [...current.highlights, item] } : current);
      closeSelection();
    } catch (highlightError) { setError(readableError(highlightError, "Could not save this highlight.")); }
  }
  async function deleteSelectedHighlight() {
    if (!selectedHighlight) return;
    try {
      await bridge.deleteLibraryPaperHighlight(selectedHighlight.id, workspace);
      setReader((current) => current ? { ...current, highlights: current.highlights.filter((highlight) => highlight.id !== selectedHighlight.id) } : current);
      closeSelection();
    } catch (deleteError) { setError(readableError(deleteError, "Could not remove this highlight.")); }
  }
  const paperContext: ContextAttachment[] = [{ id: `paper:${paper.id}`, type: "paper", name: paper.title, detail: `${paper.year ?? "n.d."} · ${paper.venue || "Paper"}`, paper: { title: paper.title, authors: paper.authors, year: paper.year, abstract: paper.abstract, url: paper.url, pdfUrl: paper.pdf_url } }];
  const repositoryForContext: PaperRepositorySnapshot | null = repository || (checkout ? {
    url: checkout.url, owner: checkout.owner, repo: checkout.repo, branch: checkout.branch, description: "", homepage: "", language: "", stars: 0, license: "", updated_at: "", retrieved_at: "", tree: [], data_paths: [], readme: "", files: [], audit: true,
  } : null);
  const researchContext: ContextAttachment[] = repositoryForContext
    ? [...paperContext, { id: `repository:${repositoryForContext.url}`, type: "repository", name: `${repositoryForContext.owner}/${repositoryForContext.repo}`, detail: checkout ? `Git checkout · ${checkout.file_count} files · ${checkout.commit.slice(0, 8)}` : `GitHub · ${repositoryForContext.files.length} evidence files · ${repositoryForContext.data_paths.length} data or benchmark paths`, repository: checkout ? { ...repositoryForContext, audit: true } : repositoryForContext }]
    : paperContext;
  const ensureRepositorySnapshot = useCallback((url: string) => {
    if (!isGithubRepositoryLink(url) || repository?.url === url || typeof bridge.loadLibraryGithubRepository !== "function") return;
    void bridge.loadLibraryGithubRepository(url).then(setRepository).catch(() => {
      // A project may still be opened in the embedded browser if GitHub's API is unavailable.
    });
  }, [bridge, repository?.url]);
  const openProject = useCallback((url: string) => {
    setDetectedProjectUrl(url);
    setReaderView("project");
    ensureRepositorySnapshot(url);
  }, [ensureRepositorySnapshot]);
  const openCodebase = useCallback((url: string) => {
    setDetectedProjectUrl(url);
    setCodebaseVisited(true);
    setReaderView("codebase");
    ensureRepositorySnapshot(url);
  }, [ensureRepositorySnapshot]);
  useEffect(() => {
    if (!projectUrl || !isGithubRepositoryLink(projectUrl) || !workspace) { setCheckout(null); return; }
    let active = true;
    void bridge.getLibraryGithubRepositoryCheckout(projectUrl, workspace).then((next) => {
      if (active) setCheckout(next);
    }).catch(() => {
      if (active) setCheckout(null);
    });
    return () => { active = false; };
  }, [bridge, projectUrl, workspace]);
  const cloneForAudit = useCallback(async () => {
    if (!projectUrl || !workspace || checkoutLoading) return;
    setCheckoutLoading(true);
    setCheckoutError("");
    try {
      const next = await bridge.cloneLibraryGithubRepository(projectUrl, workspace);
      setCheckout(next);
      setAiMode("audit");
      setChatOpen(true);
      ensureRepositorySnapshot(projectUrl);
    } catch (cloneError) { setCheckoutError(readableError(cloneError, "Could not clone this repository for code audit.")); }
    finally { setCheckoutLoading(false); }
  }, [bridge, checkoutLoading, ensureRepositorySnapshot, projectUrl, workspace]);
  async function askAI(question: string, options: { initialBriefing?: boolean } = {}) {
    const userPrompt = question.trim();
    if (!userPrompt || chatBusy) return;
    if (!workspace) { setError("Choose a workspace before starting a paper conversation."); return; }
    const quotedPassage = options.initialBriefing || !selection ? "" : `\n\nSelected passage from page ${pageNumber}:\n> ${selection}`;
    const attachedCode = options.initialBriefing ? "" : codeAttachments.map((attachment) =>
      "\n\nSelected code from " + attachment.path + ":" + attachment.startLine + "-" + attachment.endLine +
      ":\n```\n" + attachment.snippet + "\n```"
    ).join("");
    const prompt = userPrompt + attachedCode;
    const repositoryInstruction = repositoryForContext
      ? checkout && aiMode === "audit"
        ? ` A full local Git checkout is attached for a strict code audit at commit ${checkout.commit.slice(0, 12)}. Before making an implementation claim, search the checkout, then read the exact source file. Build an explicit evidence chain with Paper: p. N and Code: path:L-N. Separate confirmed implementation, paper-only claim, and inference. Do not infer implementation details from a README or file name.`
        : ` A public GitHub snapshot is attached alongside the paper. Inspect its README, selected source/configuration files, and listed data or benchmark paths when relevant. Clearly distinguish paper claims from repository evidence and from your inference; a listed data path does not prove the data itself was read.`
      : "";
    const instruction = options.initialBriefing
      ? `You are preparing a durable research reading guide for the paper \"${paper.title}\" (${lastPage} PDF pages available). ${prompt}${repositoryInstruction}`
      : aiMode === "audit" && checkout
        ? `You are conducting a strict paper-to-code audit for \"${paper.title}\". ${prompt}${quotedPassage}\n\nRead relevant PDF pages and the cloned repository before answering. Report an evidence chain in this order when applicable: paper claim and page, code path and line range, then conclusion. Mark each conclusion as confirmed, contradicted, incomplete, or not implemented. Do not fill gaps with speculation.${repositoryInstruction}`
        : `You are helping a researcher read the paper \"${paper.title}\". ${prompt}${quotedPassage}\n\nUse the existing full-paper briefing as continuity, but read attached PDF pages again when the answer depends on details absent from it. Ground your answer in the selected passage and the attached paper. State when the passage alone is insufficient, and cite page numbers when available.${repositoryInstruction}`;
    setChatOpen(true);
    if (!options.initialBriefing) {
      setCodeAttachments([]);
      setChatMessages((current) => [...current, { role: "user", text: userPrompt }]);
    }
    setChatBusy(true);
    setChatCancelling(false);
    try {
      const result = await bridge.runAgent({
        prompt: instruction,
        workspace,
        threadId: chatThreadId,
        projectId: projectId || undefined,
        mode: options.initialBriefing || aiMode === "audit" ? "deep-research" : "free-chat",
        contextItems: researchContext,
      });
      setChatThreadId(result.threadId);
      setChatMessages((current) => [...current, { role: "assistant", text: result.response }]);
      try { await bridge.setLibraryPaperChatThread(paper.id, result.threadId, workspace); }
      catch (saveError) { setError(readableError(saveError, "The paper conversation completed but could not be saved.")); }
      onAgentRun?.(result);
    } catch (askError) {
      setChatMessages((current) => [...current, { role: "assistant", text: `I could not answer that yet: ${readableError(askError, "Agent request failed.")}` }]);
    } finally { setChatBusy(false); setChatCancelling(false); }
  }
  useEffect(() => {
    if (aiMode !== "brief" || !chatOpen || !ready || !chatHistoryLoaded || chatBusy || briefingStartedRef.current) return;
    briefingStartedRef.current = true;
    void askAI(PAPER_BRIEFING_REQUEST, { initialBriefing: true });
  }, [briefingVersion, chatBusy, chatHistoryLoaded, chatOpen, ready]);
  async function translateSelection() {
    if (!selection || !selectionAnchor || translating) return;
    const source = selection;
    const anchor = selectionAnchor;
    setTranslating(true);
    setError("");
    setTranslationPopover({ source, translation: "", anchor });
    setSelection("");
    setSelectionAnchor(null);
    setHighlightPickerOpen(false);
    setCommentOpen(false);
    try {
      const result = await bridge.translateLibraryPaperSelection(source);
      setTranslationPopover((current) => current?.source === source ? { ...current, translation: result.translation } : current);
    } catch (translateError) {
      const message = readableError(translateError, "Could not translate the selected passage.");
      setTranslationPopover((current) => current?.source === source ? { ...current, error: message } : current);
    } finally { setTranslating(false); }
  }
  function commandComposer(draft?: string) {
    setComposerCommand((current) => ({ id: current.id + 1, ...(draft === undefined ? {} : { draft }) }));
  }
  function openAskForSelection() { setChatOpen(true); commandComposer(`请解释论文第 ${pageNumber} 页所选这段话的含义、上下文和可能的局限。`); }
  const addCodeSelectionToChat = useCallback((file: RepositoryCheckoutFile, snippet: string, startLine: number) => {
    const cleanSnippet = snippet.slice(0, 12_000);
    if (!cleanSnippet.trim()) return;
    setAiMode("audit");
    setChatOpen(true);
    setCodeAttachments((current) => [...current, {
      path: file.path,
      startLine,
      endLine: startLine + (cleanSnippet.match(/\n/g)?.length ?? 0) - (cleanSnippet.endsWith("\n") ? 1 : 0),
      snippet: cleanSnippet,
    }]);
    commandComposer();
  }, []);
  function submitPaperChat(draft: string) {
    if (chatBusy || !workspace || !draft.trim()) return false;
    void askAI(draft);
    return true;
  }
  async function interruptPaperChat() {
    if (!chatThreadId || chatCancelling) return;
    setChatCancelling(true);
    try {
      const result = await bridge.interruptAgent(chatThreadId);
      if (!result.interrupted) {
        setChatCancelling(false);
        setError("This paper conversation no longer has an active task to stop.");
      }
    } catch (interruptError) {
      setChatCancelling(false);
      setError(readableError(interruptError, "Could not stop the paper conversation."));
    }
  }
  function restartBriefing() {
    if (chatBusy) return;
    briefingStartedRef.current = false;
    setChatThreadId(undefined);
    setChatMessages([]);
    setBriefingVersion((current) => current + 1);
  }

  return <section className={chatOpen ? "paper-workbench-page paper-chat-open" : "paper-workbench-page"}>
    <header className="paper-workbench-header paper-reader-header">
      <button className="reader-back-button" onClick={onBack}><ChevronLeft size={16} />Library</button>
      <span className="reader-header-divider" />
      <div className="reader-title"><span>{library.name}</span><strong title={paper.title}>{paper.title}</strong></div>
      <div className="reader-header-actions">
        {publicPaperRecordUrl(paper) && <a className="reader-icon-button" href={publicPaperRecordUrl(paper)} target="_blank" rel="noreferrer" title="Open source"><ExternalLink size={16} /></a>}
        <button className="reader-icon-button" title={paper.starred ? "Unstar paper" : "Star paper"} onClick={() => void onUpdate({ starred: !paper.starred })}><Star size={16} fill={paper.starred ? "currentColor" : "none"} /></button>
        <button className={chatOpen ? "reader-ask-button active" : "reader-ask-button"} title="Ask Archimedes" onClick={() => setChatOpen((value) => !value)}>{chatOpen ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}<span>Ask AI</span></button>
      </div>
    </header>
    <div className="paper-reader-tabs" role="tablist"><button className={readerView === "paper" ? "active" : ""} role="tab" aria-selected={readerView === "paper"} onClick={() => setReaderView("paper")}><FileText size={16} />原始论文</button><button role="tab" disabled title="评述工作台即将推出"><BookOpen size={16} />评述 <small>Coming soon</small></button>{projectUrl && <button className={readerView === "project" ? "paper-project-tab active" : "paper-project-tab"} role="tab" aria-selected={readerView === "project"} title="Open this paper's linked project" onClick={() => openProject(projectUrl)}><Code2 size={16} />Project</button>}{projectUrl && isGithubRepositoryLink(projectUrl) && <button className={readerView === "codebase" ? "paper-project-tab active" : "paper-project-tab"} role="tab" aria-selected={readerView === "codebase"} title="Open the local code audit workspace" onClick={() => openCodebase(projectUrl)}><FileCode2 size={16} />Codebase</button>}</div>
    <div className="paper-reader-layout">
      {readerView !== "codebase" && <main className={readerView === "project" ? "project-browser-reader" : "original-paper-reader"}>
        {readerView === "project" && projectUrl ? <LinkedProjectView url={projectUrl} /> : <>
        {ready ? <>
          <div className="paper-reader-toolbar">
            <div className="paper-reader-navigation">
              <div className="paper-page-controls"><button onClick={() => setPageNumber((value) => Math.max(1, value - 1))} disabled={pageNumber <= 1} title="Previous page"><ChevronLeft size={17} /></button><strong>{pageNumber} / {lastPage}</strong><button onClick={() => setPageNumber((value) => Math.min(lastPage, value + 1))} disabled={pageNumber >= lastPage} title="Next page"><ChevronRight size={17} /></button></div>
              <div className="paper-zoom-control" aria-label="PDF zoom">
                <button onClick={() => setPdfZoom((value) => Math.max(.55, Math.round((value - .1) * 100) / 100))} disabled={pdfZoom <= .55} title="Zoom out 10%"><Minus size={16} /></button>
                <button className="paper-zoom-readout" onClick={() => setPdfZoom(1)} title="Reset zoom to 100%"><span>{Math.round(pdfZoom * 100)}%</span><ChevronDown size={14} /></button>
                <button onClick={() => setPdfZoom((value) => Math.min(3.2, Math.round((value + .1) * 100) / 100))} disabled={pdfZoom >= 3.2} title="Zoom in 10%"><Plus size={16} /></button>
              </div>
            </div>
            <div className="paper-search-control"><Search size={15} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void find()} placeholder="Find in paper" /><button onClick={() => void find()} disabled={!query.trim()}>Find</button></div>
            <span className="paper-reader-evidence"><Highlighter size={14} />{reader?.highlights.length ?? 0}</span>
          </div>
          {passages.length > 0 && <div className="paper-search-results">{passages.slice(0, 5).map((passage) => <button key={`${passage.page_number}-${passage.start_offset}`} onClick={() => setPageNumber(passage.page_number)}><b>p. {passage.page_number}</b>{passage.excerpt}</button>)}</div>}
          <PdfPaperCanvas url={reader?.asset?.preview_url || ""} pageNumber={pageNumber} highlights={reader?.highlights ?? []} zoom={pdfZoom} onZoomChange={setPdfZoom} onSelection={receiveSelection} onClearSelection={clearSelection} onProjectLink={openProject} onProjectDetected={setDetectedProjectUrl} />
        </> : <div className="paper-reader-empty">
          <span className="paper-reader-empty-icon"><FileText size={24} /></span><h2>Open the original paper</h2><p>{paper.pdf_url ? "The public PDF can be cached locally and opened in the reader." : "Attach a local PDF to open the original paper here."}</p>
          <div><button className="primary-button" disabled={Boolean(busy) || !paper.pdf_url} onClick={() => void prepare("remote")}>{busy === "remote" ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}{busy === "remote" ? "Preparing…" : "Prepare PDF"}</button><button className="secondary-button" disabled={Boolean(busy)} onClick={() => void prepare("local")}>{busy === "local" ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />}Attach PDF</button></div>
        </div>}
        {(error || reader?.asset?.error) && <div className="reader-runtime-error">{error || reader?.asset?.error}</div>}
        </>}
      </main>}
      {codebaseVisited && projectUrl && isGithubRepositoryLink(projectUrl) && <main key={projectUrl} className={readerView === "codebase" ? "codebase-reader" : "codebase-reader codebase-reader-inactive"} aria-hidden={readerView !== "codebase"}>
        <RepositoryCodebaseView bridge={bridge} url={projectUrl} workspace={workspace} checkout={checkout} loading={checkoutLoading} error={checkoutError} onClone={cloneForAudit} onAddToChat={addCodeSelectionToChat} />
      </main>}
      {chatOpen && <aside className="paper-ai-panel">
        <header><div><span className="eyebrow">Archimedes</span><h2>论文对话</h2><div className="paper-ai-mode-toggle" role="group" aria-label="Evidence mode"><button className={aiMode === "brief" ? "active" : ""} onClick={() => setAiMode("brief")}>Paper briefing</button><button className={aiMode === "audit" ? "active" : ""} onClick={() => checkout ? setAiMode("audit") : projectUrl && openCodebase(projectUrl)} title={checkout ? "Use the cloned repository for strict verification" : "Open Codebase and clone the repository first"}>Code audit</button></div>{checkout ? <small className="paper-ai-evidence-scope"><ShieldCheck size={11} />Paper + full codebase · {checkout.commit.slice(0, 8)}</small> : repository && <small className="paper-ai-evidence-scope"><Code2 size={11} />Paper + curated repository snapshot</small>}</div><div className="paper-ai-header-actions"><button className="reader-icon-button" onClick={restartBriefing} disabled={chatBusy || aiMode !== "brief"} title="Read the full paper again"><RefreshCw size={15} /></button><button className="reader-icon-button" onClick={() => setChatOpen(false)} title="Close AI panel"><X size={16} /></button></div></header>
        <PaperChatThread messages={chatMessages} busy={chatBusy} aiMode={aiMode} onAsk={(prompt) => void askAI(prompt)} />
        {selection && <div className="paper-ai-context"><span>p. {pageNumber} selection</span><p>{selection}</p><button onClick={closeSelection}><X size={12} /></button></div>}
        <PaperChatComposer busy={chatBusy} cancelling={chatCancelling} canInterrupt={Boolean(chatThreadId)} attachments={codeAttachments} command={composerCommand} onAsk={submitPaperChat} onInterrupt={() => void interruptPaperChat()} onRemoveAttachment={(index) => setCodeAttachments((current) => current.filter((_, attachmentIndex) => attachmentIndex !== index))} />
      </aside>}
    </div>
    {selection && selectionAnchor && <div className="paper-selection-menu" style={{ left: Math.min(window.innerWidth - 300, Math.max(12, selectionAnchor.x - 112)), top: Math.max(12, selectionAnchor.y - 58) }} onMouseDown={(event) => event.preventDefault()}>
      <button onClick={() => setHighlightPickerOpen((value) => !value)}><Highlighter size={15} />高亮</button><button onClick={translateSelection}><Languages size={15} />翻译</button><button onClick={() => setCommentOpen(true)}><MessageSquareText size={15} />评论</button><button onClick={openAskForSelection}><Bot size={15} />向 AI 提问</button>{selectedHighlight && <button className="remove-highlight-action" onClick={() => void deleteSelectedHighlight()}><Trash2 size={14} />删除高亮</button>}
      {highlightPickerOpen && <div className="paper-highlight-picker" role="menu" aria-label="Highlight color">{HIGHLIGHT_COLORS.map((color) => <button key={color.value} className={`highlight-color ${color.value}`} title={color.label} onClick={() => void saveHighlight("", color.value)}><span /></button>)}</div>}
      {commentOpen && <form className="paper-comment-composer" onSubmit={(event) => { event.preventDefault(); void saveHighlight(comment, "blue"); }}><textarea autoFocus value={comment} onChange={(event) => setComment(event.target.value)} placeholder="Write a comment…" rows={3} /><div><button type="button" onClick={closeSelection}>Cancel</button><button type="submit" disabled={!comment.trim()}>Save</button></div></form>}
    </div>}
    {translationPopover && <aside className="paper-translation-popover" style={{ left: Math.min(window.innerWidth - 404, Math.max(12, translationPopover.anchor.x - 150)), top: Math.min(window.innerHeight - 278, Math.max(12, translationPopover.anchor.y + 18)) }} onMouseDown={(event) => event.preventDefault()}>
      <header><span><Languages size={14} />译文</span><button onClick={() => setTranslationPopover(null)} title="Close translation"><X size={14} /></button></header>
      <p className="paper-translation-source">{translationPopover.source}</p>
      <div className={translationPopover.error ? "paper-translation-result error" : "paper-translation-result"}>{translating ? <><LoaderCircle className="spin" size={14} />正在翻译…</> : translationPopover.error || translationPopover.translation}</div>
    </aside>}
  </section>;
}

function LinkedProjectView({ url }: { url: string }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    setState("loading");
    setError("");

    const view = document.createElement("webview");
    view.setAttribute("src", url);
    view.setAttribute("partition", "linked-project");
    view.setAttribute("webpreferences", "contextIsolation=yes, sandbox=yes, nodeIntegration=no");
    view.setAttribute("aria-label", linkedProjectLabel(url));
    const loadTimeout = window.setTimeout(() => {
      setState("error");
      setError("The project page did not finish loading. Check your connection, then retry.");
    }, 15_000);
    const loaded = () => {
      window.clearTimeout(loadTimeout);
      setState("ready");
    };
    const failed = (event: Event) => {
      window.clearTimeout(loadTimeout);
      const detail = event as Event & { errorCode?: number; errorDescription?: string; detail?: { errorCode?: number; errorDescription?: string } };
      const code = Number(detail.errorCode ?? detail.detail?.errorCode);
      if (code === -3) return;
      setState("error");
      setError(detail.errorDescription ?? detail.detail?.errorDescription ?? "This project page could not be loaded in the paper workspace.");
    };
    view.addEventListener("did-finish-load", loaded);
    view.addEventListener("did-fail-load", failed);
    host.replaceChildren(view);

    return () => {
      window.clearTimeout(loadTimeout);
      view.removeEventListener("did-finish-load", loaded);
      view.removeEventListener("did-fail-load", failed);
      view.remove();
    };
  }, [url, reloadKey]);

  return <div className="github-project-workspace">
    <div className="github-project-toolbar"><span><Code2 size={15} />{linkedProjectLabel(url)}</span><span>{linkedProjectHost(url)}</span></div>
    <div className="github-project-frame" ref={hostRef} />
    {state === "loading" && <div className="github-project-status"><LoaderCircle className="spin" size={17} />Loading project...</div>}
    {state === "error" && <div className="github-project-status error"><strong>Project unavailable</strong><span>{error}</span><button className="secondary-button" onClick={() => setReloadKey((current) => current + 1)}>Retry</button></div>}
  </div>;
}

const RepositoryCodebaseView = memo(function RepositoryCodebaseView({ bridge, url, workspace, checkout, loading, error, onClone, onAddToChat }: {
  bridge: ResearchDeskBridge;
  url: string;
  workspace: string;
  checkout: RepositoryCheckout | null;
  loading: boolean;
  error: string;
  onClone: () => void;
  onAddToChat: (file: RepositoryCheckoutFile, snippet: string, startLine: number) => void;
}) {
  const [tree, setTree] = useState<Record<string, RepositoryCheckoutEntry[]>>({});
  const [expanded, setExpanded] = useState<Set<string>>(new Set([""]));
  const [activeFile, setActiveFile] = useState<RepositoryCheckoutFile | null>(null);
  const [browserError, setBrowserError] = useState("");
  const [fileLoading, setFileLoading] = useState(false);
  const [snippet, setSnippet] = useState("");
  const [snippetLine, setSnippetLine] = useState(1);

  const loadDirectory = useCallback(async (directory = "") => {
    if (!checkout) return;
    try {
      const listing = await bridge.listLibraryGithubRepositoryCheckout(url, workspace, directory);
      setTree((current) => ({ ...current, [directory]: listing.entries }));
      setBrowserError("");
    } catch (loadError) { setBrowserError(readableError(loadError, "Could not list this checkout directory.")); }
  }, [bridge, checkout, url, workspace]);

  useEffect(() => {
    setTree({});
    setExpanded(new Set([""]));
    setActiveFile(null);
    setSnippet("");
    if (checkout) void loadDirectory("");
  }, [checkout?.commit, loadDirectory]);

  async function toggleDirectory(directory: string) {
    const next = new Set(expanded);
    if (next.has(directory)) next.delete(directory);
    else {
      next.add(directory);
      if (!tree[directory]) await loadDirectory(directory);
    }
    setExpanded(next);
  }
  async function openFile(entry: RepositoryCheckoutEntry) {
    setFileLoading(true);
    setSnippet("");
    try {
      const file = await bridge.readLibraryGithubRepositoryCheckoutFile(url, workspace, entry.path);
      setActiveFile(file);
      setBrowserError("");
    } catch (loadError) { setBrowserError(readableError(loadError, "Could not open this repository file.")); }
    finally { setFileLoading(false); }
  }
  function captureSelection(event: ReactMouseEvent<HTMLElement>) {
    if (!activeFile) return;
    const selection = window.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0);
    if (!event.currentTarget.contains(range.startContainer) || !event.currentTarget.contains(range.endContainer)) return;
    const text = selection.toString();
    if (!text.trim()) { setSnippet(""); return; }
    const startElement = range.startContainer.nodeType === Node.ELEMENT_NODE
      ? range.startContainer as Element
      : range.startContainer.parentElement;
    const line = startElement?.closest<HTMLElement>("[data-code-line]")?.dataset.codeLine;
    const before = range.cloneRange();
    before.selectNodeContents(event.currentTarget);
    before.setEnd(range.startContainer, range.startOffset);
    setSnippet(text.slice(0, 12_000));
    setSnippetLine(line ? Number(line) : before.toString().split("\n").length);
  }
  function renderEntries(directory = "", depth = 0) {
    return (tree[directory] || []).flatMap((entry) => {
      if (entry.type === "directory") {
        const open = expanded.has(entry.path);
        return [<div key={entry.path}><button className={open ? "codebase-tree-node open" : "codebase-tree-node"} style={{ paddingLeft: 12 + depth * 14 }} onClick={() => void toggleDirectory(entry.path)}>{open ? <FolderOpen size={14} /> : <Folder size={14} />}<span>{entry.name}</span></button>{open ? renderEntries(entry.path, depth + 1) : []}</div>];
      }
      return [<button className={activeFile?.path === entry.path ? "codebase-tree-node active" : "codebase-tree-node"} key={entry.path} style={{ paddingLeft: 12 + depth * 14 }} onClick={() => void openFile(entry)}><FileCode2 size={13} /><span>{entry.name}</span></button>];
    });
  }

  if (!checkout) return <div className="codebase-empty"><span className="paper-reader-empty-icon"><ShieldCheck size={24} /></span><h2>Start a strict code audit</h2><p>Clone this public repository locally to inspect the full file tree, select code, and verify paper claims against the implementation. The checkout is read-only here and no repository code is executed.</p>{error && <div className="reader-runtime-error">{error}</div>}<button className="primary-button" disabled={loading || !workspace} onClick={onClone}>{loading ? <LoaderCircle className="spin" size={15} /> : <GitBranch size={15} />}{loading ? "Cloning repository…" : "Clone for code audit"}</button>{!workspace && <small>Choose a workspace before cloning a repository.</small>}</div>;

  return <div className="codebase-workspace">
    <header className="codebase-toolbar"><span><GitBranch size={14} />{checkout.owner}/{checkout.repo}</span><span>{checkout.branch} · {checkout.commit.slice(0, 8)} · {checkout.file_count.toLocaleString()} files</span></header>
    <div className="codebase-layout">
      <aside className="codebase-explorer"><header><span>Explorer</span><button className="reader-icon-button" title="Reload file tree" onClick={() => void loadDirectory("")}><RefreshCw size={13} /></button></header><div className="codebase-tree">{renderEntries()}</div></aside>
      <section className="codebase-editor">
        {activeFile ? <>
          <header><span><FileCode2 size={14} />{activeFile.path}</span><small>{activeFile.line_count.toLocaleString()} lines</small></header>
          {activeFile.content.length <= 300_000 ? <SyntaxHighlighter
            className="codebase-source"
            language={codebaseLanguage(activeFile.path)}
            useInlineStyles={false}
            showLineNumbers
            wrapLines
            wrapLongLines={false}
            lineProps={(lineNumber: number) => ({ className: "syntax-line", "data-code-line": lineNumber })}
            lineNumberStyle={{ minWidth: "38px", paddingRight: "12px", textAlign: "right", userSelect: "none" }}
            customStyle={{ minWidth: 0, minHeight: 0, margin: 0, padding: "15px 18px 56px 0", border: 0, fontSize: "11px", lineHeight: 1.65, overflow: "auto" }}
            codeTagProps={{ style: { fontFamily: '"SFMono-Regular", Consolas, "Liberation Mono", monospace' } }}
            onMouseUp={captureSelection}
          >{activeFile.content || " "}</SyntaxHighlighter> : <pre onMouseUp={captureSelection}><code>{activeFile.content}</code></pre>}
          {snippet ? <div className="codebase-selection"><span>{activeFile.path} line {snippetLine}</span><button className="secondary-button" onMouseDown={(event) => event.preventDefault()} onClick={() => { onAddToChat(activeFile, snippet, snippetLine); setSnippet(""); window.getSelection()?.removeAllRanges(); }}><MessageSquareText size={13} />Add to chat</button><button className="reader-icon-button" onClick={() => setSnippet("")} title="Discard code selection"><X size={13} /></button></div> : null}
        </> : <div className="codebase-editor-empty">{fileLoading ? <><LoaderCircle className="spin" size={18} />Opening file…</> : <><FileCode2 size={24} /><strong>Select a source file</strong><span>Choose a file in the explorer, then select code to add it to the evidence conversation.</span></>}</div>}
      </section>
    </div>
    {browserError && <div className="reader-runtime-error">{browserError}</div>}
  </div>;
});

function PdfPaperCanvas({ url, pageNumber, highlights, zoom, onZoomChange, onSelection, onClearSelection, onProjectLink, onProjectDetected }: { url: string; pageNumber: number; highlights: PaperHighlight[]; zoom: number; onZoomChange: (updater: (current: number) => number) => void; onSelection: (text: string, anchor: SelectionAnchor) => void; onClearSelection: () => void; onProjectLink: (url: string) => void; onProjectDetected: (url: string) => void }) {
  const hostRef = useRef<HTMLDivElement>(null);
  const highlightsRef = useRef(highlights);
  const [width, setWidth] = useState(880);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [error, setError] = useState("");
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(420, Math.floor(entry.contentRect.width))));
    observer.observe(host);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    highlightsRef.current = highlights;
    const textLayer = hostRef.current?.querySelector<HTMLDivElement>(".arch-pdf-text-layer");
    if (textLayer) applyPdfHighlights(textLayer, highlights.filter((highlight) => highlight.page_number === pageNumber));
  }, [highlights, pageNumber]);
  useEffect(() => {
    let cancelled = false;
    let destroyLoadingTask: (() => void) | undefined;
    const host = hostRef.current;
    if (!host || !url) return;
    const renderHost = host;
    async function render() {
      const hasVisiblePage = Boolean(renderHost.querySelector(".arch-pdf-page"));
      if (!hasVisiblePage) setState("loading");
      setError("");
      try {
        const { pdfjs } = await import("./pdf-runtime");
        const response = await fetch(url);
        if (!response.ok) throw new Error(`PDF request failed (${response.status}).`);
        const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await response.arrayBuffer()) });
        destroyLoadingTask = () => loadingTask.destroy();
        const pdfDocument = await loadingTask.promise;
        const pdfPage = await pdfDocument.getPage(pageNumber);
        const baseViewport = pdfPage.getViewport({ scale: 1 });
        const fitScale = Math.min(1.65, Math.max(.7, (width - 72) / baseViewport.width));
        const scale = fitScale * zoom;
        const viewport = pdfPage.getViewport({ scale });
        const page = window.document.createElement("div");
        page.className = "arch-pdf-page";
        page.style.width = `${viewport.width}px`;
        page.style.height = `${viewport.height}px`;
        const canvas = window.document.createElement("canvas");
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        canvas.width = Math.floor(viewport.width * pixelRatio); canvas.height = Math.floor(viewport.height * pixelRatio);
        canvas.style.width = `${viewport.width}px`; canvas.style.height = `${viewport.height}px`;
        page.append(canvas);
        const textLayer = window.document.createElement("div");
        textLayer.className = "arch-pdf-text-layer";
        textLayer.style.setProperty("--total-scale-factor", String(scale));
        page.append(textLayer);
        const context = canvas.getContext("2d");
        if (!context) throw new Error("Canvas rendering is unavailable.");
        context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
        await pdfPage.render({ canvas, canvasContext: context, viewport }).promise;
        const textContent = await pdfPage.getTextContent();
        // PDF.js registers each embedded font under the text item's font name. Its
        // text-content styles otherwise fall back to generic sans/mono families,
        // which only becomes visible when the selectable text layer is selected.
        for (const [fontName, style] of Object.entries(textContent.styles)) style.fontFamily = fontName;
        const layer = new pdfjs.TextLayer({ textContentSource: textContent, container: textLayer, viewport });
        await layer.render();
        const annotations = await pdfPage.getAnnotations();
        for (const annotation of annotations) {
          const targetUrl = typeof annotation.url === "string" ? annotation.url : "";
          if (!targetUrl || !Array.isArray(annotation.rect)) continue;
          const [firstX, firstY, secondX, secondY] = viewport.convertToViewportRectangle(annotation.rect);
          const link = window.document.createElement("a");
          link.className = "arch-pdf-link";
          link.href = targetUrl;
          const isProjectLink = /^https:\/\//i.test(targetUrl) && (/^https:\/\/github\.com\/[^/]+\/[^/]+/i.test(targetUrl) || /\.github\.io(?:\/|$)/i.test(targetUrl));
          link.target = isProjectLink ? "_self" : "_blank";
          link.rel = "noreferrer";
          link.style.left = `${Math.min(firstX, secondX)}px`;
          link.style.top = `${Math.min(firstY, secondY)}px`;
          link.style.width = `${Math.abs(secondX - firstX)}px`;
          link.style.height = `${Math.abs(secondY - firstY)}px`;
          link.title = isProjectLink ? "Open linked project alongside this paper" : "Open link";
          if (isProjectLink) {
            onProjectDetected(targetUrl);
            link.addEventListener("click", (event) => { event.preventDefault(); onProjectLink(targetUrl); });
          }
          page.append(link);
        }
        applyPdfHighlights(textLayer, highlightsRef.current.filter((highlight) => highlight.page_number === pageNumber));
        if (!cancelled) { renderHost.replaceChildren(page); setState("ready"); }
        pdfPage.cleanup(); pdfDocument.cleanup();
      } catch (renderError) { if (!cancelled) { setState("error"); setError(readableError(renderError, "The PDF page could not be rendered.")); } }
    }
    void render();
    return () => { cancelled = true; destroyLoadingTask?.(); };
  }, [onProjectDetected, onProjectLink, pageNumber, url, width, zoom]);
  function selected(event: ReactMouseEvent<HTMLDivElement>) {
    const target = event.currentTarget;
    const selection = window.getSelection();
    if (!selection?.rangeCount || !selection.toString().trim() || !target.contains(selection.anchorNode)) { onClearSelection(); return; }
    const rect = selection.getRangeAt(0).getBoundingClientRect();
    onSelection(selection.toString(), { x: rect.left + rect.width / 2, y: rect.top });
  }
  function zoomWithTrackpad(event: ReactWheelEvent<HTMLDivElement>) {
    if (!event.ctrlKey) return;
    event.preventDefault();
    onZoomChange((current) => Math.min(3.2, Math.max(.55, current * (event.deltaY < 0 ? 1.12 : .89))));
  }
  return <div className="arch-pdf-stage" onMouseDown={onClearSelection} onMouseUp={selected} onWheel={zoomWithTrackpad}><div className="arch-pdf-surface" ref={hostRef} />{state === "loading" && <div className="arch-pdf-loading"><LoaderCircle className="spin" size={17} />Rendering original PDF…</div>}{state === "error" && <div className="arch-pdf-loading error"><FileText size={17} />{error}</div>}<span className="arch-pdf-zoom-readout">{Math.round(zoom * 100)}%</span></div>;
}

function applyPdfHighlights(textLayer: HTMLDivElement, highlights: PaperHighlight[]) {
  const spans = Array.from(textLayer.querySelectorAll("span"));
  for (const span of spans) span.classList.remove("arch-pdf-highlight", "arch-pdf-highlight-yellow", "arch-pdf-highlight-red", "arch-pdf-highlight-blue", "arch-pdf-highlight-green", "arch-pdf-highlight-pink");
  if (!highlights.length) return;
  const compact = (value: string) => value.replace(/\s+/g, "").toLocaleLowerCase();
  const spanRanges: Array<{ element: HTMLSpanElement; start: number; end: number }> = [];
  let cursor = 0;
  for (const element of spans) {
    const length = compact(element.textContent || "").length;
    spanRanges.push({ element, start: cursor, end: cursor + length });
    cursor += length;
  }
  const source = compact(spans.map((span) => span.textContent || "").join(""));
  const painted = new Set<HTMLSpanElement>();
  for (const highlight of highlights) {
    const quote = compact(highlight.quote);
    if (!quote) continue;
    const start = source.indexOf(quote);
    if (start < 0) continue;
    const end = start + quote.length;
    for (const range of spanRanges) if (range.start < end && range.end > start && !painted.has(range.element)) {
      range.element.classList.add("arch-pdf-highlight", `arch-pdf-highlight-${highlight.color}`);
      painted.add(range.element);
    }
  }
}

function normalizePaperMathDelimiters(content: string) {
  let activeFence = "";
  let displayMathOpen = false;
  const normalizedLines: string[] = [];
  for (const line of content.replace(/\r\n?/g, "\n").split("\n")) {
    const fence = /^\s*(`{3,}|~{3,})/.exec(line)?.[1] || "";
    if (fence) {
      if (!activeFence) activeFence = fence[0];
      else if (fence[0] === activeFence) activeFence = "";
      normalizedLines.push(line);
      continue;
    }
    if (activeFence) {
      normalizedLines.push(line);
      continue;
    }
    const normalized = normalizePaperMathLine(line);
    if (normalized.trim() === "$$") {
      displayMathOpen = !displayMathOpen;
      normalizedLines.push(normalized);
      continue;
    }
    const standaloneDisplay = /^\s*\$\$([\s\S]*?)\$\$\s*$/.exec(normalized);
    if (standaloneDisplay) {
      normalizedLines.push("$$", standaloneDisplay[1].trim(), "$$");
      continue;
    }
    // Providers sometimes emit a bare equation or leave one display delimiter unmatched.
    if (!displayMathOpen && !normalized.includes("$") && looksLikePaperEquation(normalized)) {
      const equation = normalized.trim().replace(/^\$+|\$+$/g, "").replace(/(^|[^\\])\$/g, "$1").trim();
      normalizedLines.push("$$", equation, "$$");
      continue;
    }
    normalizedLines.push(normalized);
  }
  return normalizedLines.join("\n");
}

function looksLikePaperEquation(line: string) {
  const trimmed = line.trim();
  if (!trimmed || /^(#{1,6}|[-*+]\s|\d+\.\s|>|<)/.test(trimmed)) return false;
  const equation = trimmed.replace(/^\$+|\$+$/g, "");
  return equation.includes("=")
    && /(?:\\[a-zA-Z]+|[_^][{(]|[A-Za-z]\s*[_^])/.test(equation)
    && !/[。；;]$/.test(equation);
}

function normalizePaperMathLine(line: string) {
  let result = "";
  let index = 0;
  while (index < line.length) {
    if (line[index] === "`") {
      const tickCount = /^`+/.exec(line.slice(index))?.[0].length || 1;
      const closingIndex = line.indexOf("`".repeat(tickCount), index + tickCount);
      if (closingIndex < 0) return result + line.slice(index);
      result += line.slice(index, closingIndex + tickCount);
      index = closingIndex + tickCount;
      continue;
    }
    const delimiter = line.slice(index, index + 2);
    if (delimiter === "\\[" || delimiter === "\\]") { result += "$$"; index += 2; continue; }
    if (delimiter === "\\(" || delimiter === "\\)") { result += "$"; index += 2; continue; }
    result += line[index];
    index += 1;
  }
  return result;
}

function LibraryEditor({ editor, onClose, onSave }: { editor: ResearchLibrary | "new" | null; onClose: () => void; onSave: (input: { name: string; description: string; color: string }) => Promise<void> }) {
  const dialogRef = useDialogFocus<HTMLElement>(Boolean(editor), onClose);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [color, setColor] = useState(LIBRARY_COLORS[0]);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setName(editor && editor !== "new" ? editor.name : "");
    setDescription(editor && editor !== "new" ? editor.description : "");
    setColor(editor && editor !== "new" ? editor.color : LIBRARY_COLORS[0]);
  }, [editor]);
  if (!editor) return null;
  async function submit() {
    if (!name.trim()) return;
    setBusy(true);
    try { await onSave({ name: name.trim(), description: description.trim(), color }); } finally { setBusy(false); }
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><section ref={dialogRef} tabIndex={-1} className="workspace-modal" role="dialog" aria-modal="true" aria-label={editor === "new" ? "New library" : "Edit library"} onMouseDown={(event) => event.stopPropagation()}>
    <div className="modal-header"><div><span className="eyebrow">Knowledge base</span><h2>{editor === "new" ? "New literature library" : "Edit library"}</h2></div><button className="icon-button" onClick={onClose} title="Close"><X size={16} /></button></div>
    <label>Library name<input autoFocus value={name} onChange={(event) => setName(event.target.value)} placeholder="Agentic RAG" /></label>
    <label>Description<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={4} placeholder="What belongs in this research direction?" /></label>
    <div className="color-picker" aria-label="Library color">{LIBRARY_COLORS.map((swatch) => <button key={swatch} className={color === swatch ? "color-swatch selected" : "color-swatch"} style={{ background: swatch }} onClick={() => setColor(swatch)} title={swatch}>{color === swatch && <Check size={13} />}</button>)}</div>
    <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" disabled={busy || !name.trim()} onClick={() => void submit()}>{busy ? <LoaderCircle className="spin" size={14} /> : <Save size={14} />}{editor === "new" ? "Create library" : "Save changes"}</button></div>
  </section></div>;
}

function PaperImportModal({ open, bridge, library, onClose, onImport }: { open: boolean; bridge: ResearchDeskBridge; library: ResearchLibrary; onClose: () => void; onImport: (paper: AcademicSearchResult) => Promise<void> }) {
  const dialogRef = useDialogFocus<HTMLElement>(open, onClose);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<AcademicSearchResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [error, setError] = useState("");
  const [imported, setImported] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  if (!open) return null;
  async function search() {
    if (!query.trim()) return;
    setSearching(true);
    setError("");
    setResults([]);
    try {
      const nextResults = await bridge.searchAcademicPapers(query.trim(), 12);
      setResults(nextResults);
      if (!nextResults.length) setError("No matching papers were found. Check the identifier or try a title keyword.");
    } catch (searchError) {
      setError(readableError(searchError, "Paper search failed."));
    } finally {
      setSearching(false);
    }
  }
  async function add(paper: AcademicSearchResult) {
    const key = paper.external_id || paper.title;
    setAdding(key);
    setError("");
    try {
      await onImport(paper);
      setImported((current) => new Set(current).add(key));
    } catch (importError) {
      setError(readableError(importError, "The paper could not be added."));
    } finally {
      setAdding(null);
    }
  }
  return <div className="modal-backdrop" onMouseDown={onClose}><section ref={dialogRef} tabIndex={-1} className="workspace-modal paper-import-modal" role="dialog" aria-modal="true" aria-label="Import paper" onMouseDown={(event) => event.stopPropagation()}>
    <div className="modal-header"><div><span className="eyebrow">Import into {library.name}</span><h2>Find academic papers</h2></div><button className="icon-button" onClick={onClose} title="Close"><X size={16} /></button></div>
    <p>Search by title, topic, DOI, arXiv URL, or arXiv ID. arXiv links are resolved directly; other queries use Semantic Scholar and OpenAlex.</p>
    <div className="external-search-box"><Search size={16} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void search()} placeholder="e.g. adaptive retrieval or 2401.18059" /><button className="primary-button" disabled={searching || !query.trim()} onClick={() => void search()}>{searching ? <LoaderCircle className="spin" size={14} /> : <Search size={14} />}Search</button></div>
    {error && <div className="library-error" role="alert">{error}</div>}
    <div className="external-results">{results.map((paper) => {
      const key = paper.external_id || paper.title;
      const isImported = imported.has(key);
      const isAdding = adding === key;
      return <article className="external-paper" key={key}><div><strong>{paper.title}</strong><small>{paper.authors.slice(0, 3).join(", ")} · {paper.year ?? "n.d."} · {paper.venue || paper.source}</small></div><button className={isImported ? "secondary-button imported" : "outline-button"} disabled={isImported || Boolean(adding)} onClick={() => void add(paper)}>{isImported ? <Check size={14} /> : isAdding ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />}{isImported ? "Added" : isAdding ? "Adding" : "Add"}</button></article>;
    })}</div>
  </section></div>;
}

function readableError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : String(error || fallback);
  return message
    .replace(/^Error invoking remote method '[^']+':\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .trim() || fallback;
}

function DailyDiscovery({ initialMode = "latest", bridge, libraries, loadingLibraries, onImported }: { initialMode?: DailyDiscoveryMode | "conference"; bridge: ResearchDeskBridge; libraries: ResearchLibrary[]; loadingLibraries: boolean; onImported: () => Promise<void> }) {
  const [mode, setMode] = useState<DailyDiscoveryMode | "conference">(initialMode);
  const [range, setRange] = useState<DailyDiscoveryRange>("7d");
  const [topic, setTopic] = useState<DailyDiscoveryTopic>("all");
  const [searchKind, setSearchKind] = useState<"quick" | "deep">("quick");
  const [query, setQuery] = useState("");
  const [submittedQuery, setSubmittedQuery] = useState("");
  const [deepResponse, setDeepResponse] = useState<DeepPaperSearchResponse | null>(null);
  const [targetLibraryId, setTargetLibraryId] = useState("");
  const [response, setResponse] = useState<DailyDiscoveryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [added, setAdded] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<string | null>(null);
  const [error, setError] = useState("");
  const feedRequestId = useRef(0);
  const deepRequestId = useRef(0);
  const responseRef = useRef<DailyDiscoveryResponse | null>(null);
  useEffect(() => { if (!targetLibraryId && libraries[0]) setTargetLibraryId(libraries[0].id); }, [libraries, targetLibraryId]);
  const targetLibrary = useMemo(() => libraries.find((library) => library.id === targetLibraryId), [libraries, targetLibraryId]);
  const searchActive = Boolean(submittedQuery);
  const loadFeed = useCallback(async (forceRefresh = false) => {
    if (mode === "conference" || (searchKind === "deep" && submittedQuery)) return;
    const requestId = ++feedRequestId.current;
    setLoading(true);
    setError("");
    try {
      const nextResponse = await bridge.discoverDailyPapers({ mode, range, topic, query: searchKind === "quick" ? submittedQuery : "", limit: 60, forceRefresh });
      if (requestId !== feedRequestId.current) return;
      responseRef.current = nextResponse;
      setResponse(nextResponse);
      if (nextResponse.warning) setError(nextResponse.warning);
    } catch (discoverError) {
      if (requestId !== feedRequestId.current) return;
      const message = readableError(discoverError, "The daily paper feed could not be refreshed.");
      setError(responseRef.current ? `${message} Showing the previous results.` : message);
    } finally {
      if (requestId === feedRequestId.current) setLoading(false);
    }
  }, [bridge, mode, range, searchKind, submittedQuery, topic]);

  useEffect(() => {
    void loadFeed(false);
    return () => { feedRequestId.current += 1; };
  }, [loadFeed]);

  const visiblePapers = response?.papers ?? [];

  async function submitSearch() {
    const nextQuery = query.trim();
    if (!nextQuery) {
      clearSearch();
      return;
    }
    if (searchKind === "quick") {
      setDeepResponse(null);
      if (nextQuery === submittedQuery) void loadFeed(true);
      else setSubmittedQuery(nextQuery);
      return;
    }
    const requestId = ++deepRequestId.current;
    setSubmittedQuery(nextQuery);
    setDeepResponse(null);
    setLoading(true);
    setError("");
    try {
      const next = await bridge.deepSearchPapers({ prompt: nextQuery, topic, limit: 18 });
      if (requestId !== deepRequestId.current) return;
      setDeepResponse(next);
      if (next.warning) setError(next.warning);
    } catch (searchError) {
      if (requestId !== deepRequestId.current) return;
      setError(readableError(searchError, "Deep paper search failed."));
    } finally {
      if (requestId === deepRequestId.current) setLoading(false);
    }
  }

  function clearSearch() {
    feedRequestId.current += 1;
    deepRequestId.current += 1;
    setQuery("");
    setSubmittedQuery("");
    setDeepResponse(null);
    setError("");
    setLoading(false);
  }

  function changeSearchKind(next: "quick" | "deep") {
    if (next === searchKind) return;
    feedRequestId.current += 1;
    deepRequestId.current += 1;
    setSearchKind(next);
    setSubmittedQuery("");
    setDeepResponse(null);
    setError("");
    setLoading(false);
  }

  async function add(paper: DailyPaper | AcademicSearchResult) {
    if (!targetLibraryId) return;
    const key = paper.external_id || paper.title;
    setAdding(key);
    setError("");
    try {
      await bridge.addLibraryPaper(targetLibraryId, paper);
      setAdded((current) => new Set(current).add(key));
      await onImported();
    } catch (addError) {
      setError(readableError(addError, "The paper could not be saved."));
    } finally {
      setAdding(null);
    }
  }

  return <section className="library-page daily-page">
    <header className="library-page-header"><div><span className="eyebrow">Live research feed</span><h1>Daily papers</h1><p>Track newly submitted arXiv work and community-trending papers, then save useful records into your library.</p></div><span className="daily-mark"><CalendarDays size={20} /></span></header>
    <div className="daily-feed-toolbar daily-conference-toolbar">
      <div className="daily-live-controls">
      <div className="daily-mode-tabs" role="tablist" aria-label="Paper feed mode">
        <button className={mode === "latest" && !searchActive ? "active" : ""} role="tab" aria-selected={mode === "latest" && !searchActive} disabled={searchActive} title={searchActive ? "Clear search to return to the daily feed" : "Newest arXiv submissions"} onClick={() => setMode("latest")}><Clock3 size={14} />Latest</button>
        <button className={mode === "trending" && !searchActive ? "active" : ""} role="tab" aria-selected={mode === "trending" && !searchActive} disabled={searchActive} title={searchActive ? "Clear search to return to the daily feed" : "Trending community papers"} onClick={() => setMode("trending")}><Flame size={14} />Trending</button>
      </div>
      <div className="daily-range-control" aria-label="Publication range">{(["7d", "30d", "90d"] as DailyDiscoveryRange[]).map((item) => <button key={item} disabled={mode === "conference" || (searchActive && searchKind === "deep")} className={range === item && mode !== "conference" && !(searchActive && searchKind === "deep") ? "active" : ""} title={searchActive && searchKind === "deep" ? "Deep search uses the time range inferred from your request" : ""} onClick={() => setRange(item)}>{item === "7d" ? "7 days" : item === "30d" ? "30 days" : "90 days"}</button>)}</div>
      </div>
      <button className={mode === "conference" ? "secondary-button conference-mode-button active" : "secondary-button conference-mode-button"} aria-pressed={mode === "conference"} disabled={searchActive} title={searchActive ? "Clear search before switching discovery modes" : "Search official conference catalogs"} onClick={() => setMode("conference")}><GraduationCap size={16} />Top conference search</button>
      {mode !== "conference" && !searchActive && <button className="secondary-button daily-refresh" disabled={loading} onClick={() => void loadFeed(true)}>{loading ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}Refresh</button>}
      <label className="daily-save-target">Save to<select value={targetLibraryId} disabled={loadingLibraries} onChange={(event) => setTargetLibraryId(event.target.value)}>{libraries.map((library) => <option key={library.id} value={library.id}>{library.name}</option>)}</select></label>
    </div>
    <div className="daily-topic-filter" role="tablist" aria-label="AI research topic">{DAILY_TOPICS.map((item) => <button key={item.id} role="tab" aria-selected={topic === item.id} disabled={searchActive && searchKind === "deep"} className={topic === item.id ? "active" : ""} title={searchActive && searchKind === "deep" ? "Clear deep search to change its topic constraint" : item.description} onClick={() => setTopic(item.id)}>{item.label}</button>)}</div>
    {mode === "conference" ? <ConferenceDiscovery bridge={bridge} targetLibraryId={targetLibraryId} topic={topic} onImported={onImported} /> : <>
    <div className={searchKind === "deep" ? "daily-search-panel deep" : "daily-search-panel"}>
      <div className="daily-search-kind" role="tablist" aria-label="Paper search type"><button className={searchKind === "quick" ? "active" : ""} role="tab" aria-selected={searchKind === "quick"} onClick={() => changeSearchKind("quick")}><Search size={13} />Quick search</button><button className={searchKind === "deep" ? "active" : ""} role="tab" aria-selected={searchKind === "deep"} onClick={() => changeSearchKind("deep")}><Sparkles size={13} />Deep search</button></div>
      <div className="daily-search-input-row">{searchKind === "quick" ? <input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => event.key === "Enter" && void submitSearch()} placeholder="Search recent papers by keyword, title, author, or topic" /> : <textarea value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => (event.metaKey || event.ctrlKey) && event.key === "Enter" && void submitSearch()} placeholder="Describe the field, problem, methods, evaluation setting, time range, and anything to exclude. The more specific you are, the better the match." />}
        <button className="primary-button" disabled={loading || !query.trim()} onClick={() => void submitSearch()}>{loading ? <LoaderCircle className="spin" size={14} /> : searchKind === "deep" ? <Sparkles size={14} /> : <Search size={14} />}{searchKind === "deep" ? "Deep search" : "Search"}</button>
      </div>
      {(searchKind !== "deep" || searchActive) && <div className="daily-search-meta"><span>{`${searchKind === "deep" ? deepResponse?.results.length ?? 0 : visiblePapers.length} papers`}{submittedQuery ? ` · “${submittedQuery}”` : ""}{searchKind === "quick" && response ? ` · ${response.cached ? "cached" : "live"} · updated ${formatFeedTime(response.fetched_at)}` : ""}{searchKind === "deep" && deepResponse ? ` · ${deepResponse.providers.join(" + ") || "metadata search"} · updated ${formatFeedTime(deepResponse.fetched_at)}` : ""}</span>{searchActive && <button className="daily-clear-search" onClick={clearSearch}><X size={12} />Clear search</button>}</div>}
    </div>
    {error && <div className={deepResponse ? "daily-search-warning" : "library-error"} role="alert">{error}</div>}
    {searchKind === "deep" && searchActive ? <DeepSearchResults response={deepResponse} loading={loading} error={error} targetLibrary={targetLibrary} added={added} adding={adding} onSave={add} /> : loading && !response ? <LoadingState /> : error && !response ? <div className="daily-empty daily-feed-failed"><RefreshCw size={28} /><strong>Could not load the live feed</strong><span>arXiv may be responding slowly. Your library is unaffected.</span><button className="secondary-button" onClick={() => void loadFeed(true)}><RefreshCw size={14} />Retry</button></div> : !visiblePapers.length ? <div className="daily-empty"><CalendarDays size={28} /><strong>No papers found</strong><span>Try another topic, expand the date range, or use a broader keyword.</span></div> : <div className="daily-paper-list">{visiblePapers.map((paper) => {
      const key = paper.external_id || paper.title;
      const isAdded = added.has(key);
      const isAdding = adding === key;
      return <article className="daily-paper-row" key={key}>
        <div className="daily-paper-date"><strong>{formatPaperDate(paper.published_at)}</strong><span>{paper.source === "hugging-face" ? "HF Daily" : "arXiv"}</span></div>
        <div className="daily-paper-content"><div className="daily-paper-title"><h2>{paper.title}</h2>{paper.url && <a href={paper.url} target="_blank" rel="noreferrer" title="Open paper"><ExternalLink size={13} /></a>}</div><p>{paper.authors.slice(0, 4).join(", ")}{paper.authors.length > 4 ? " et al." : ""}</p><small>{paper.abstract || "No abstract available."}</small><div className="daily-paper-signals">{paper.categories.slice(0, 3).map((category) => <span key={category}>{category}</span>)}{paper.upvotes > 0 && <span><Flame size={11} />{paper.upvotes}</span>}{paper.github_url && <a href={paper.github_url} target="_blank" rel="noreferrer"><Code2 size={11} />{paper.github_stars > 0 ? paper.github_stars : "Code"}</a>}</div></div>
        <button className={isAdded ? "secondary-button imported" : "outline-button"} disabled={isAdded || Boolean(adding) || !targetLibrary} onClick={() => void add(paper)}>{isAdded ? <Check size={14} /> : isAdding ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />}{isAdded ? "Saved" : isAdding ? "Saving" : "Save"}</button>
      </article>;
    })}</div>}
    </>}
  </section>;
}

function DeepSearchResults({ response, loading, error, targetLibrary, added, adding, onSave }: {
  response: DeepPaperSearchResponse | null;
  loading: boolean;
  error: string;
  targetLibrary: ResearchLibrary | undefined;
  added: Set<string>;
  adding: string | null;
  onSave: (paper: AcademicSearchResult) => Promise<void>;
}) {
  if (loading && !response) return <div className="daily-deep-progress"><LoaderCircle className="spin" size={22} /><strong>Expanding and matching your research request</strong><span>Understanding methods and domains, searching multiple scholarly indexes, deduplicating, then reranking titles and abstracts.</span></div>;
  if (error && !response) return <div className="daily-empty daily-feed-failed"><Search size={28} /><strong>Deep search could not finish</strong><span>Check the model configuration or try a shorter, more specific research request.</span></div>;
  if (!response?.results.length) return <div className="daily-empty"><Search size={28} /><strong>No deep-search results yet</strong><span>Describe the research problem, preferred methods, and evaluation setting, then start a deep search.</span></div>;
  const planTags = [
    ...response.plan.domains.map((value) => ({ kind: "Domain", value })),
    ...response.plan.methods.map((value) => ({ kind: "Method", value })),
    ...response.plan.tasks.map((value) => ({ kind: "Task", value })),
  ].slice(0, 12);
  return <>
    <section className="daily-search-plan"><div><span className="eyebrow">Search interpretation</span><strong>{response.plan.research_problem}</strong><p>Matches are based on titles and abstracts. Full-paper claims have not been verified.</p></div><div className="daily-search-plan-tags">{planTags.map((tag) => <span key={`${tag.kind}:${tag.value}`}><small>{tag.kind}</small>{tag.value}</span>)}{response.plan.year_range && <span><small>Years</small>{response.plan.year_range.start ?? "Any"}–{response.plan.year_range.end ?? "Any"}</span>}</div><details><summary>{response.plan.queries.length} expanded queries</summary><ul>{response.plan.queries.map((item) => <li key={item}>{item}</li>)}</ul></details></section>
    <div className="daily-paper-list deep-paper-list">{response.results.map((result) => {
      const paper = result.paper;
      const key = paper.external_id || paper.title;
      const isAdded = added.has(key);
      const isAdding = adding === key;
      return <article className="daily-paper-row" key={key}>
        <div className="daily-paper-date"><strong>{paper.year || "—"}</strong><span>{paper.source?.split(",").join(" + ") || "Index"}</span></div>
        <div className="daily-paper-content"><div className="daily-paper-title"><h2>{paper.title}</h2>{paper.url && <a href={paper.url} target="_blank" rel="noreferrer" title="Open paper"><ExternalLink size={13} /></a>}</div><p>{paper.authors.slice(0, 4).join(", ")}{paper.authors.length > 4 ? " et al." : ""}{paper.venue ? ` · ${paper.venue}` : ""}</p><div className={`deep-match-reason ${result.relevance}`}><strong>{result.relevance === "strong" ? "Strong match" : result.relevance === "related" ? "Related method" : "Background"}</strong><span>{result.reason}</span></div><small>{paper.abstract || "No abstract available."}</small><div className="daily-paper-signals">{result.matched_terms.map((term) => <span key={term}>{term}</span>)}{paper.citation_count > 0 && <span>{paper.citation_count.toLocaleString()} citations</span>}{paper.pdf_url && <a href={paper.pdf_url} target="_blank" rel="noreferrer"><FileText size={11} />PDF</a>}</div></div>
        <button className={isAdded ? "secondary-button imported" : "outline-button"} disabled={isAdded || Boolean(adding) || !targetLibrary} onClick={() => void onSave(paper)}>{isAdded ? <Check size={14} /> : isAdding ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />}{isAdded ? "Saved" : isAdding ? "Saving" : "Save"}</button>
      </article>;
    })}</div>
  </>;
}

function formatPaperDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function formatFeedTime(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "now" : date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
}

function LoadingState() {
  return <div className="library-loading"><LoaderCircle className="spin" size={18} />Loading research records…</div>;
}
