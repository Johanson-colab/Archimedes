import { lazy, memo, Suspense, useEffect, useMemo, useRef, useState, type ClipboardEvent as ReactClipboardEvent } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import "katex/dist/katex.min.css";
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
import LibraryView from "./LibraryView";
import ImageCreationView from "./ImageCreationView";
import BenchmarkRadarView from "./BenchmarkRadarView";
import ResearchWelcome, { type ResearchWelcomeAction } from "./ResearchWelcome";
import ContextPicker, { ContextChips } from "./ContextPicker";
import ProjectSidebar, { NewProjectModal, ProjectRemoveModal, ThreadRemoveModal } from "./ProjectSidebar";
import ExtensionsView, { type ExtensionsTab } from "./ExtensionsView";
import CommandPalette, { type PaletteCommand } from "./CommandPalette";
import { sidebarEntries, type MainSection, type SidebarEntry } from "./sidebar-registry";
import RightWorkbench, { clampWorkbenchWidth, defaultWorkbenchWidth, type WorkbenchTab } from "./RightWorkbench";
import ChatActivityTimeline from "./ChatActivityTimeline";
import JourneyView from "./JourneyView";
import { defaultJourneySettings, normalizeJourneySettings } from "./journeySettings";
import TrajectoryView from "./TrajectoryView";
import TurnRail from "./TurnRail";
import TerminalSettingsModal from "./TerminalSettingsModal";
import SettingsModal, { type SettingsSection } from "./SettingsModal";
import { useUISettings } from "./i18n";
import PaperWritingView, { type PaperOpenRequest } from "./PaperWritingView";
import { createArtifactDraft, formatArtifactComment, isDraftDirty, isEditableArtifact, markDraftSaved, mergeRefreshedArtifactFiles, prepareArtifactContent, toEditorText, type ArtifactComment, type ArtifactDraft, type ArtifactSelection } from "./artifact-editor";
import { previewLibraryBridge } from "./library-preview";
import CopyButton from "./CopyButton";
import { useDialogFocus } from "./useDialogFocus";
import ArchimedesMark from "./brand/ArchimedesMark";
import ArchimedesWordmark from "./brand/ArchimedesWordmark";
import {
  AlertTriangle,
  BookOpen,
  Blocks,
  ArrowDown,
  CalendarDays,
  Check,
  CircleDot,
  Cloud,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  File,
  FileCode2,
  FileImage,
  FileText,
  Flag,
  Folder,
  FolderOpen,
  FlaskConical,
  ImagePlus,
  Images,
  Laptop,
  Lightbulb,
  LoaderCircle,
  Maximize2,
  MessageCircle,
  MessageSquareText,
  PanelLeftClose,
  Puzzle,
  PanelLeftOpen,
  PanelRight,
  PanelRightClose,
  PanelRightOpen,
  FilePenLine,
  Play,
  Plus,
  RefreshCw,
  Radar,
  Save,
  Search,
  SendHorizontal,
  Settings,
  ShieldCheck,
  ScanSearch,
  Square,
  SquareTerminal,
  X,
} from "lucide-react";

const syntaxLanguages: Array<[string, unknown]> = [
  ["markup", markup], ["css", css], ["c", c], ["cpp", cpp], ["javascript", javascript],
  ["jsx", jsx], ["typescript", typescript], ["tsx", tsx], ["bash", bash], ["go", go],
  ["java", java], ["json", json], ["latex", latex], ["markdown", markdown], ["python", python],
  ["rust", rust], ["sql", sql], ["yaml", yaml],
];
for (const [name, grammar] of syntaxLanguages) {
  SyntaxHighlighter.registerLanguage(name, grammar);
}

type Message = {
  id: string;
  role: "user" | "assistant";
  text: string;
  sources?: ResearchSource[];
  created_at?: string;
};

type TimelineEvent = {
  title: string;
  detail: string;
  state: "done" | "active" | "waiting";
};

type PendingAction = AgentAction & { source: "agent" | "manual" };
type Modal = "artifact" | "evidence" | "search" | "source" | null;
type ResearchMode = "free-chat" | "idea-spark" | "experiment-setup" | "paper-generation" | "paper-review" | "deep-research";
type ResearchStageId = "conversation" | "ideas" | "experiments" | "writing" | "review";
type ReasoningEffort = "low" | "medium" | "high";
type ContextLength = "standard" | "extra-long";

type ResearchStage = {
  id: ResearchStageId;
  label: string;
  mode: ResearchMode;
  checkpoint: string;
  description: string;
};

const researchModes: Array<{ id: ResearchMode; label: string; description: string; icon: React.ReactNode; placeholder: string }> = [
  { id: "free-chat", label: "Free chat", description: "Talk with AI without a predefined workflow", icon: <MessageCircle size={15} />, placeholder: "Ask anything or start a conversation..." },
  { id: "idea-spark", label: "Idea spark", description: "Find gaps and form testable research ideas", icon: <Lightbulb size={15} />, placeholder: "Describe a topic, observation, or open question..." },
  { id: "experiment-setup", label: "Experiment setup", description: "Design experiments, baselines, and metrics", icon: <FlaskConical size={15} />, placeholder: "Describe the hypothesis or experiment you want to build..." },
  { id: "paper-generation", label: "Paper writing", description: "Plan and draft an evidence-grounded paper", icon: <FilePenLine size={15} />, placeholder: "What section or argument would you like to write?" },
  { id: "paper-review", label: "Paper review", description: "Critique claims, methods, and presentation", icon: <ScanSearch size={15} />, placeholder: "What paper or draft would you like to review?" },
];

const researchStages: ResearchStage[] = [
  { id: "conversation", label: "Conversation", mode: "free-chat", checkpoint: "Research brief", description: "Frame the question, constraints, evidence needs, and available resources." },
  { id: "ideas", label: "Ideas", mode: "idea-spark", checkpoint: "Idea candidate", description: "Ground a falsifiable idea in literature and check its closest prior work." },
  { id: "experiments", label: "Experiments", mode: "experiment-setup", checkpoint: "Claims & evidence", description: "Design, run, diagnose, and accept only the claims supported by results." },
  { id: "writing", label: "Writing", mode: "paper-generation", checkpoint: "Manuscript", description: "Turn accepted claims and evidence into a traceable paper draft." },
  { id: "review", label: "Review", mode: "paper-review", checkpoint: "Submission decision", description: "Audit novelty, evidence, reproducibility, and presentation before release." },
];

const reasoningEfforts: Array<{ id: ReasoningEffort; label: string }> = [
  { id: "low", label: "Low" },
  { id: "medium", label: "Medium" },
  { id: "high", label: "High" },
];

const contextLengths: Array<{ id: ContextLength; label: string }> = [
  { id: "standard", label: "Standard" },
  { id: "extra-long", label: "Extra Long" },
];

const previewModelCapabilities: ModelCapabilities = {
  thinkingEfforts: ["low", "medium", "high"],
  contextLengths: ["standard", "extra-long"],
  nativeThinking: true,
  contextCharacterLimits: { standard: 300_000, "extra-long": 600_000 },
};

function stageForMode(mode: ResearchMode) {
  return researchStages.find((stage) => stage.mode === mode) ?? researchStages[0];
}

function inferResearchMode(prompt: string, fallback: ResearchMode): ResearchMode {
  const text = prompt.trim().toLowerCase();
  if (!text) return fallback;
  if (/(review|reviewer|审稿|评审|批评|rebuttal|claim.?evidence|论文检查)/i.test(text)) return "paper-review";
  if (/(write|writing|draft|latex|abstract|introduction|method section|related work|写论文|写作|撰写|摘要|引言|方法章节)/i.test(text)) return "paper-generation";
  if (/(experiment|benchmark|baseline|ablation|dataset|metric|training|seed|实验|基线|消融|数据集|指标|训练|复现)/i.test(text)) return "experiment-setup";
  if (/(idea|novel|novelty|research direction|literature|paper search|研究方向|研究问题|创新|查新|文献|论文检索|选题)/i.test(text)) return "idea-spark";
  return fallback;
}

const initialPapers = [
  { title: "Evidence-aware retrieval for long-context reasoning", meta: "Rao et al. · 2025", score: "94%" },
  { title: "Measuring retrieval budget in agentic systems", meta: "Kim et al. · 2024", score: "88%" },
  { title: "Grounded reasoning under noisy observations", meta: "Alvarez et al. · 2025", score: "81%" },
];

const initialEvents: TimelineEvent[] = [
  { title: "Research brief indexed", detail: "12 papers · 38 evidence spans", state: "done" },
  { title: "Gap analysis", detail: "Comparing retrieval budget controls", state: "done" },
  { title: "Experiment plan", detail: "Waiting for your approval", state: "waiting" },
];

const initialMessages: Message[] = [
  {
    id: "welcome",
    role: "assistant",
    text: "What would you like to research? I can search your knowledge base, compare papers, plan experiments, and prepare workspace changes for your approval.",
  },
];

const INITIAL_VISIBLE_MESSAGE_COUNT = 60;
const HISTORY_MESSAGE_PAGE_SIZE = 40;
const CONTEXT_INSTRUCTION_OVERHEAD_CHARS = 4_800;

function estimateAttachmentContextCharacters(item: ContextAttachment) {
  if (item.type === "paper" && item.paper) {
    return JSON.stringify({ id: item.id, type: item.type, ...item.paper }).length + 180;
  }

  if (item.type === "repository" && item.repository) {
    const repository = item.repository;
    const manifest = {
      id: item.id,
      type: item.type,
      url: repository.url,
      branch: repository.branch,
      description: repository.description,
      language: repository.language,
      stars: repository.stars,
      data_paths: repository.data_paths.slice(0, 80),
      cached_files: repository.files.map((file) => ({ path: file.path, language: file.language, size: file.size })),
    };
    return JSON.stringify(manifest).length + repository.readme.slice(0, 16_000).length + 320;
  }

  if (item.type === "image" && item.image) {
    const { mimeType, sizeBytes, width, height } = item.image;
    return JSON.stringify({ id: item.id, type: item.type, name: item.name, mimeType, sizeBytes, width, height }).length + 160;
  }

  return JSON.stringify({ id: item.id, type: item.type, name: item.name, path: item.path, detail: item.detail }).length + 80;
}

function upsertChangeSet(current: WorkspaceChangeSet[], incoming: WorkspaceChangeSet) {
  return [...current.filter((changeSet) => changeSet.id !== incoming.id), incoming]
    .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
}

function setDirectoryChildren(entries: WorkspaceFileEntry[], directory: string, children: WorkspaceFileEntry[]): WorkspaceFileEntry[] {
  return entries.map((entry) => {
    if (entry.type !== "directory") return entry;
    if (entry.path === directory) return { ...entry, children };
    if (!entry.children) return entry;
    return { ...entry, children: setDirectoryChildren(entry.children, directory, children) };
  });
}

const DEFAULT_WORKSPACE = import.meta.env.VITE_DEFAULT_WORKSPACE ?? "";
const previewListeners = new Set<(payload: { sessionId: string; data: string }) => void>();
const previewPtyListeners = new Set<(payload: { sessionId: string; data: string }) => void>();
const previewPtyExitListeners = new Set<(payload: { sessionId: string; exitCode: number; signal?: number }) => void>();
const previewAgentListeners = new Set<(payload: AgentEvent) => void>();
const previewWorkspaceListeners = new Set<(payload: { path: string }) => void>();
const previewChangeSetListeners = new Set<(payload: WorkspaceChangeSet) => void>();
const previewPtySessions = new Map<string, { cwd: string; line: string; ready: boolean }>();
const previewPlatform = typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent) ? "win32" : typeof navigator !== "undefined" && /Macintosh|Mac OS X/i.test(navigator.userAgent) ? "darwin" : "linux";
let previewTerminalSettings: TerminalSettings = {
  shell: "auto",
  customShell: "",
  fontFamily: "",
  fontSize: 12,
  scrollback: 10_000,
  externalTerminal: "auto",
  onboarded: false,
  platform: previewPlatform,
  detectedShell: previewPlatform === "win32" ? "pwsh.exe" : previewPlatform === "darwin" ? "/bin/zsh" : "/bin/bash",
  detectedShellName: previewPlatform === "win32" ? "pwsh.exe" : previewPlatform === "darwin" ? "zsh" : "bash",
  externalTerminalLabel: previewPlatform === "win32" ? "Windows Terminal" : previewPlatform === "darwin" ? "Ghostty" : "WezTerm",
};
let previewWorkspace = DEFAULT_WORKSPACE || "Browser preview workspace";
const previewFileContents = new Map<string, string>();
const previewTasks: SavedTask[] = [];
const previewProjects: ResearchProject[] = [{ id: "preview-general", name: "General", description: "Default research project", workspace_path: DEFAULT_WORKSPACE || null, chat_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), archived_at: null, last_chat_at: null }];
const previewArchivedProjects: ResearchProject[] = [];
const previewThreads: ResearchThreadDetail[] = [];
const previewArchivedThreads: ResearchThreadDetail[] = [];
const previewCommands: WorkspaceSnapshot["commands"] = [];
const previewActions: AgentAction[] = [];
const previewSkillCollections: SkillCollection[] = [
  { id: "AI-Research-SKILLs", name: "AI Research Skills", description: "Model engineering, agents, evaluation, RAG, training, and research ideation.", skillCount: 2 },
  { id: "Research-Paper-Writing-Skills", name: "Research Paper Writing", description: "Reviewer-facing structure, argument flow, evidence alignment, and paper revision.", skillCount: 1 },
  { id: "academic-research-skills", name: "Academic Research", description: "Deep research, academic pipelines, paper drafting, and rigorous review workflows.", skillCount: 1 },
  { id: "nature-skills", name: "Nature Research Toolkit", description: "Literature reading, figures, citations, statistics, proposals, and publication workflows.", skillCount: 2 },
  { id: "paper-craft-skills", name: "Paper Craft", description: "Turn papers into polished analysis pages, visual stories, and presentation decks.", skillCount: 1 },
  { id: "ARIS", name: "ARIS", description: "End-to-end research automation for literature, ideas, experiments, review, and scientific writing.", skillCount: 2 },
];
const previewSkills: SkillDetail[] = [
  { id: "AI-Research-SKILLs/21-research-ideation/idea-spark", collectionId: "AI-Research-SKILLs", collectionName: "AI Research Skills", name: "idea-spark", description: "Turn observations into testable research hypotheses.", category: "Research Ideation", path: "/preview/Skills/AI-Research-SKILLs/idea-spark", content: "---\nname: idea-spark\n---\n# Idea Spark\n\nDevelop concrete, falsifiable research ideas from evidence and open questions.\n\n## Workflow\n\n1. Identify the unresolved tension.\n2. Form a falsifiable hypothesis.\n3. Design the fastest useful test." },
  { id: "AI-Research-SKILLs/14-agents/agent-evaluation", collectionId: "AI-Research-SKILLs", collectionName: "AI Research Skills", name: "agent-evaluation", description: "Design reliable capability and failure-mode evaluations for agents.", category: "Agents", path: "/preview/Skills/AI-Research-SKILLs/agent-evaluation", content: "# Agent Evaluation\n\nBuild trajectory-aware evaluations for long-horizon agents." },
  { id: "Research-Paper-Writing-Skills/research-paper-writing", collectionId: "Research-Paper-Writing-Skills", collectionName: "Research Paper Writing", name: "research-paper-writing", description: "Improve paper structure, paragraph flow, and reviewer-facing presentation.", category: "General", path: "/preview/Skills/Research-Paper-Writing-Skills/research-paper-writing", content: "# Research Paper Writing\n\nCreate clear, evidence-aligned academic manuscripts." },
  { id: "academic-research-skills/deep-research", collectionId: "academic-research-skills", collectionName: "Academic Research", name: "deep-research", description: "A rigorous workflow for literature search and cross-source synthesis.", category: "General", path: "/preview/Skills/academic-research-skills/deep-research", content: "# Deep Research\n\nPlan, search, verify, synthesize, and review academic evidence." },
  { id: "nature-skills/skills/nature-reader", collectionId: "nature-skills", collectionName: "Nature Research Toolkit", name: "nature-reader", description: "Build source-grounded, figure-aware full-paper readers.", category: "General", path: "/preview/Skills/nature-skills/nature-reader", content: "# Nature Reader\n\nRead complete papers with source anchors, figures, tables, and equations." },
  { id: "nature-skills/skills/nature-figure", collectionId: "nature-skills", collectionName: "Nature Research Toolkit", name: "nature-figure", description: "Produce publication-ready scientific figures.", category: "General", path: "/preview/Skills/nature-skills/nature-figure", content: "# Nature Figure\n\nDesign clear scientific figures and visual narratives." },
  { id: "paper-craft-skills/skills/paper-analyzer", collectionId: "paper-craft-skills", collectionName: "Paper Craft", name: "paper-analyzer", description: "Turn a paper into a deep, shareable analysis page.", category: "General", path: "/preview/Skills/paper-craft-skills/paper-analyzer", content: "# Paper Analyzer\n\nCreate an illustrated, code-aware explanation of an academic paper." },
  { id: "ARIS/research-lit", collectionId: "ARIS", collectionName: "ARIS", name: "research-lit", description: "Search and synthesize research literature with source verification.", category: "Literature & Evidence", path: "/preview/.agents/skills/research-lit", content: "# Research Literature\n\nSearch, verify, and synthesize literature for a focused research question." },
  { id: "ARIS/experiment-plan", collectionId: "ARIS", collectionName: "ARIS", name: "experiment-plan", description: "Turn a hypothesis into a decision-complete experiment plan.", category: "Experiments & Compute", path: "/preview/.agents/skills/experiment-plan", content: "# Experiment Plan\n\nDesign baselines, metrics, ablations, and execution checkpoints." },
];

function previewSnapshot(): WorkspaceSnapshot {
  return {
    workspace: previewWorkspace,
    tasks: [...previewTasks].reverse(),
    projects: structuredClone(previewProjects),
    archivedProjects: structuredClone(previewArchivedProjects),
    threads: previewThreads.map(({ turns: _turns, messages: _messages, ...thread }) => thread),
    archivedThreads: previewArchivedThreads.map(({ turns: _turns, messages: _messages, ...thread }) => thread),
    commands: [...previewCommands].reverse(),
    actions: [...previewActions].reverse(),
  };
}

function emitPreviewAgentEvent(payload: AgentEvent) {
  for (const listener of previewAgentListeners) listener(payload);
}

const previewBridge = {
  ...previewLibraryBridge,
  getInitialWorkspace: async () => null,
  chooseWorkspace: async () => DEFAULT_WORKSPACE || "Browser preview workspace",
  watchWorkspace: async (workspace: string) => workspace,
  revealWorkspace: async () => ({ opened: true }),
  chooseContextPaths: async () => { throw new Error("Use the desktop app to choose local files and folders."); },
  listContextResources: async (kind: "plugin" | "skill") => kind === "skill" ? previewSkills.map((skill) => ({ id: `skill:${skill.path}`, type: "skill" as const, name: skill.name, path: skill.path, detail: `${skill.collectionName} · ${skill.category}` })) : [],
  listSkillCollections: async () => structuredClone(previewSkillCollections),
  listSkills: async (_workspace: string, collectionId = "") => structuredClone(previewSkills.filter((skill) => !collectionId || skill.collectionId === collectionId).map(({ content: _content, ...skill }) => skill)),
  readSkill: async (_workspace: string, skillId: string) => {
    const skill = previewSkills.find((candidate) => candidate.id === skillId);
    if (!skill) throw new Error("Skill not found.");
    return structuredClone(skill);
  },
  getResearchSnapshot: async () => previewSnapshot(),
  openWorkspace: async (workspacePath?: string) => {
    previewWorkspace = workspacePath || previewWorkspace;
    return previewSnapshot();
  },
  listWorkspaceFiles: async (_workspace: string, directory = "") => {
    const now = new Date().toISOString();
    const entries = directory === "notes"
      ? [{ name: "research-brief.md", path: "notes/research-brief.md", type: "file" as const, kind: "markdown" as const, size: 92, modifiedAt: now }]
      : directory === "src"
        ? [{ name: "experiment.py", path: "src/experiment.py", type: "file" as const, kind: "text" as const, size: 54, modifiedAt: now }]
        : directory === "paper"
          ? [{ name: "main.tex", path: "paper/main.tex", type: "file" as const, kind: "text" as const, size: 410, modifiedAt: now }]
          : [{ name: "notes", path: "notes", type: "directory" as const }, { name: "paper", path: "paper", type: "directory" as const }, { name: "src", path: "src", type: "directory" as const }];
    return { directory, count: entries.length, truncated: false, entries };
  },
  readWorkspaceFile: async (_workspace: string, filePath: string) => ({
    name: filePath.split("/").at(-1) || filePath,
    path: filePath,
    kind: filePath.endsWith(".md") ? "markdown" as const : "text" as const,
    size: previewFileContents.get(filePath)?.length ?? 92,
    modifiedAt: new Date().toISOString(),
    content: previewFileContents.get(filePath) ?? (filePath.endsWith(".md") ? "# Research brief\n\nBrowser preview of the active workspace." : filePath.endsWith(".tex") ? "\\documentclass{article}\n\\usepackage{amsmath}\n\\title{Archimedes Paper}\n\\author{}\n\\begin{document}\n\\maketitle\n\\section{Introduction}\nWrite the paper here and the PDF preview updates automatically.\n\\end{document}\n" : "def run_experiment():\n    return {\"status\": \"ready\"}\n"),
  }),
  writeWorkspaceFile: async (_workspace: string, filePath: string, content: string) => {
    previewFileContents.set(filePath, content);
    for (const listener of previewWorkspaceListeners) listener({ path: filePath });
    return { name: filePath.split("/").at(-1) || filePath, path: filePath, kind: filePath.endsWith(".md") ? "markdown" as const : "text" as const, size: content.length, modifiedAt: new Date().toISOString(), content };
  },
  listLatexProjects: async () => [{ path: "paper/main.tex", title: "Archimedes Paper", main: true }],
  createLatexProject: async () => ({ name: "main.tex", path: "paper/main.tex", kind: "text" as const, size: 210, modifiedAt: new Date().toISOString(), content: "\\documentclass{article}\n\\title{Untitled Research Paper}\n\\begin{document}\n\\maketitle\n\\section{Introduction}\n\\end{document}\n" }),
  createLatexFile: async (_workspace: string, filePath: string) => {
    const normalizedPath = filePath.endsWith(".tex") ? filePath : `${filePath}.tex`;
    return { name: normalizedPath.split("/").at(-1) || normalizedPath, path: normalizedPath, kind: "text" as const, size: 19, modifiedAt: new Date().toISOString(), content: "% New LaTeX source\n" };
  },
  createLatexDirectory: async (_workspace: string, directoryPath: string) => ({ name: directoryPath.split("/").at(-1) || directoryPath, path: directoryPath, type: "directory" as const }),
  importLatexFolder: async () => { throw new Error("Folder import is available in the Archimedes desktop app."); },
  compileLatexDocument: async (_workspace: string, path: string) => ({ ok: true, engine: "latexmk", source_path: path, pdf_path: ".archimedes/latex-build/preview/main.pdf", duration_ms: 438, diagnostics: [], log: "Browser preview build succeeded." }),
  getResearchThread: async (threadId: string) => {
    const thread = previewThreads.find((candidate) => candidate.id === threadId);
    if (!thread) throw new Error("Research thread not found.");
    return structuredClone(thread);
  },
  saveTask: async ({ prompt, response, status = "completed" }: { prompt: string; response: string; status?: string }) => {
    const task = { id: crypto.randomUUID(), prompt, response, status, created_at: new Date().toISOString() };
    previewTasks.push(task);
    return task;
  },
  createResearchProject: async ({ name, description = "", workspacePath = "" }: { name: string; description?: string; workspacePath?: string }) => {
    const now = new Date().toISOString();
    const project = { id: crypto.randomUUID(), name, description, workspace_path: workspacePath || previewWorkspace, chat_count: 0, created_at: now, updated_at: now, archived_at: null, last_chat_at: null };
    previewProjects.unshift(project);
    return structuredClone(project);
  },
  renameResearchProject: async (id: string, name: string) => {
    const normalizedName = name.replace(/\s+/g, " ").trim();
    if (!normalizedName || normalizedName.length > 100) throw new Error("A project name of at most 100 characters is required.");
    const project = previewProjects.find((candidate) => candidate.id === id);
    if (!project) throw new Error("Research project not found.");
    project.name = normalizedName;
    project.updated_at = new Date().toISOString();
    return structuredClone(project);
  },
  setResearchProjectWorkspace: async (id: string, workspacePath: string) => {
    const project = previewProjects.find((candidate) => candidate.id === id) || previewArchivedProjects.find((candidate) => candidate.id === id);
    if (!project) throw new Error("Research project not found.");
    project.workspace_path = workspacePath;
    project.updated_at = new Date().toISOString();
    return structuredClone(project);
  },
  archiveResearchProject: async (id: string, archived = true) => {
    const source = archived ? previewProjects : previewArchivedProjects;
    const target = archived ? previewArchivedProjects : previewProjects;
    const index = source.findIndex((project) => project.id === id);
    if (index < 0) throw new Error("Research project not found.");
    const [project] = source.splice(index, 1);
    project.archived_at = archived ? new Date().toISOString() : null;
    project.updated_at = new Date().toISOString();
    target.unshift(project);
    const threadSource = archived ? previewThreads : previewArchivedThreads;
    const threadTarget = archived ? previewArchivedThreads : previewThreads;
    for (let index = threadSource.length - 1; index >= 0; index -= 1) {
      if (threadSource[index].project_id !== id) continue;
      const [thread] = threadSource.splice(index, 1);
      thread.archived_at = project.archived_at;
      threadTarget.unshift(thread);
    }
    return { archived };
  },
  deleteResearchProject: async (id: string) => {
    for (const collection of [previewProjects, previewArchivedProjects]) {
      const index = collection.findIndex((project) => project.id === id);
      if (index >= 0) collection.splice(index, 1);
    }
    for (const collection of [previewThreads, previewArchivedThreads]) {
      for (let index = collection.length - 1; index >= 0; index -= 1) {
        if (collection[index].project_id === id) collection.splice(index, 1);
      }
    }
    return { deleted: true };
  },
  archiveResearchThread: async (id: string, archived = true) => {
    const source = archived ? previewThreads : previewArchivedThreads;
    const target = archived ? previewArchivedThreads : previewThreads;
    const index = source.findIndex((thread) => thread.id === id);
    if (index < 0) throw new Error("Research thread not found.");
    const [thread] = source.splice(index, 1);
    thread.archived_at = archived ? new Date().toISOString() : null;
    target.unshift(thread);
    return structuredClone(thread);
  },
  deleteResearchThread: async (id: string) => {
    for (const collection of [previewThreads, previewArchivedThreads]) {
      const index = collection.findIndex((thread) => thread.id === id);
      if (index >= 0) collection.splice(index, 1);
    }
    return { deleted: true };
  },
  getModelConfig: async () => ({ provider: "custom" as ModelProviderId, baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini", hasApiKey: false, source: "environment" as const }),
  getModelCapabilities: async () => previewModelCapabilities,
  listProviderModels: async () => ({ models: [], source: "live" as const }),
  saveModelConfig: async ({ provider, baseUrl, model }: ModelConfigInput) => ({ provider, baseUrl, model, hasApiKey: true, source: "saved" as const }),
  testModelConfig: async ({ model }: ModelConfigInput) => ({ ok: true, latencyMs: 184, resolvedModel: model }),
  getWebSearchConfig: async () => ({ provider: "brave" as const, hasApiKey: false }),
  saveWebSearchConfig: async () => ({ provider: "brave" as const, hasApiKey: true }),
  readClipboardText: async () => "",
  writeClipboardText: async () => undefined,
  readClipboardImage: async () => null,
  runAgent: async ({ prompt, workspace, threadId, projectId, mode, reasoningEffort = "medium", contextLength = "standard", contextItems }: { prompt: string; workspace: string; threadId?: string; projectId?: string; mode: ResearchMode; reasoningEffort?: ReasoningEffort; contextLength?: ContextLength; contextItems?: ContextAttachment[] }) => {
    const now = new Date().toISOString();
    let thread = previewThreads.find((candidate) => candidate.id === threadId);
    if (!thread) {
      const resolvedProjectId = projectId || previewProjects[0]?.id || "preview-general";
      const projectWorkspace = previewProjects.find((candidate) => candidate.id === resolvedProjectId)?.workspace_path;
      thread = { id: crypto.randomUUID(), project_id: resolvedProjectId, title: prompt.slice(0, 72), mode, status: "running", context_summary: "", workspace_path: workspace || projectWorkspace || previewWorkspace, pending_actions: 0, turn_count: 0, created_at: now, updated_at: now, last_turn_at: now, archived_at: null, turns: [], messages: [], changeSets: [], events: [] };
      previewThreads.unshift(thread);
    }
    const turnId = crypto.randomUUID();
    const taskId = crypto.randomUUID();
    thread.messages.push({ id: `${turnId}:user`, turn_id: turnId, role: "user", text: prompt, created_at: now });
    thread.events ??= [];
    const appendPreviewEvent = (type: string, payload: unknown) => {
      thread!.events!.push({ id: crypto.randomUUID(), turn_id: turnId, sequence: thread!.events!.length + 1, type, payload, created_at: new Date().toISOString() });
    };
    appendPreviewEvent("user_message", { text: prompt, mode, reasoningEffort, contextLength });
    emitPreviewAgentEvent({ type: "status", threadId: thread.id, turnId, title: "Research turn started", detail: `Browser preview Agent · thinking: ${reasoningEffort} · context: ${contextLength}` });
    const actions: AgentAction[] = [];
    if (/(write|draft|note|生成|写入)/i.test(prompt)) {
      const action: AgentAction = {
        id: crypto.randomUUID(), task_id: taskId, kind: "write",
        payload: {
          path: "notes/agent-research-brief.md",
          content: "# Research brief\n\nThis artifact was proposed by the browser preview Agent.\n",
          change: { path: "notes/agent-research-brief.md", status: "created", additions: 3, deletions: 0 },
        },
        status: "pending", created_at: new Date().toISOString(), resolved_at: null,
      };
      previewActions.push(action);
      actions.push(action);
      appendPreviewEvent("tool_call", { call_id: crypto.randomUUID(), name: "write_file", arguments: { path: "notes/agent-research-brief.md", content: action.payload.content }, status: "approval_required" });
      emitPreviewAgentEvent({ type: "tool", threadId: thread.id, turnId, title: "write artifact", detail: "Prepared a draft for approval" });
    }
    const selectedMode = researchModes.find((candidate) => candidate.id === mode)?.label ?? "Research";
    const contextNote = contextItems?.length ? ` I received ${contextItems.length} attached context item${contextItems.length === 1 ? "" : "s"}.` : "";
    const response = `Preview Agent (${selectedMode}): I reviewed the active research workspace and framed the request as an evidence-backed next step.${contextNote} In the desktop app, this same request will use your configured model and restricted workspace tools.`;
    appendPreviewEvent("assistant_step", { content: "Reviewing the research request and available workspace context.", protocol: "preview", tool_calls: actions.length ? [{ id: actions[0].id, function: { name: "write_file", arguments: JSON.stringify(actions[0].payload) } }] : [] });
    emitPreviewAgentEvent({ type: "assistant_delta", threadId: thread.id, turnId, title: "Writing response", detail: "Streaming model output", delta: response });
    const completedAt = new Date().toISOString();
    const task = { id: taskId, prompt, response, status: "completed", created_at: now };
    previewTasks.push(task);
    thread.turns.push({ id: turnId, thread_id: thread.id, task_id: taskId, mode, user_message: prompt, assistant_message: response, status: "completed", created_at: now, completed_at: completedAt });
    thread.messages.push({ id: `${turnId}:assistant`, turn_id: turnId, role: "assistant", text: response, created_at: completedAt });
    appendPreviewEvent("assistant_message", { text: response, status: "completed", model: "gpt-4.1-mini" });
    thread.mode = mode;
    thread.status = "idle";
    thread.pending_actions = previewActions.filter((candidate) => candidate.status === "pending" && thread!.turns.some((turn) => turn.task_id === candidate.task_id)).length;
    thread.turn_count = thread.turns.length;
    thread.updated_at = completedAt;
    thread.last_turn_at = completedAt;
    emitPreviewAgentEvent({ type: "complete", threadId: thread.id, turnId, title: "Research turn complete", detail: `${actions.length} approval item${actions.length === 1 ? "" : "s"}` });
    return { threadId: thread.id, turnId, taskId: task.id, response, status: "completed", actions, thread: structuredClone(thread) };
  },
  interruptAgent: async () => ({ interrupted: true }),
  approveAgentAction: async (actionId: string) => {
    const action = previewActions.find((candidate) => candidate.id === actionId);
    if (!action) throw new Error("Agent action not found.");
    action.status = "approved";
    action.resolved_at = new Date().toISOString();
    const approvedThread = previewThreads.find((candidate) => candidate.turns.some((turn) => turn.task_id === action.task_id));
    if (approvedThread) approvedThread.pending_actions = Math.max(0, (approvedThread.pending_actions ?? 0) - 1);
    if (action.payload.change) {
      const thread = approvedThread;
      const changeSet: WorkspaceChangeSet = { id: action.id, actionId: action.id, taskId: action.task_id, threadId: thread?.id, kind: action.kind, changes: [action.payload.change], createdAt: action.created_at };
      if (thread) thread.changeSets.push(changeSet);
      for (const listener of previewChangeSetListeners) listener(changeSet);
    }
    return action;
  },
  rejectAgentAction: async (actionId: string) => {
    const action = previewActions.find((candidate) => candidate.id === actionId);
    if (!action) throw new Error("Agent action not found.");
    action.status = "rejected";
    action.resolved_at = new Date().toISOString();
    const rejectedThread = previewThreads.find((candidate) => candidate.turns.some((turn) => turn.task_id === action.task_id));
    if (rejectedThread) rejectedThread.pending_actions = Math.max(0, (rejectedThread.pending_actions ?? 0) - 1);
    return action;
  },
  runTerminal: async ({ command }: { command: string; cwd?: string }) => {
    const sessionId = crypto.randomUUID();
    const commandRunId = crypto.randomUUID();
    previewCommands.push({ id: commandRunId, command, cwd: previewWorkspace, status: "completed", output: "", exit_code: 0, created_at: new Date().toISOString(), completed_at: new Date().toISOString() });
    window.setTimeout(() => {
      for (const listener of previewListeners) {
        listener({ sessionId, data: `[browser preview] Command approved: ${command}\n[process exited with code 0]\n` });
      }
    }, 260);
    return { sessionId, commandRunId, workspace: previewWorkspace };
  },
  stopTerminal: async (sessionId: string) => {
    for (const listener of previewListeners) listener({ sessionId, data: "[process stopped]\n" });
  },
  getJourneySettings: async () => {
    try { return normalizeJourneySettings(JSON.parse(window.localStorage.getItem("archimedes-journey-settings") || "{}")); }
    catch { return defaultJourneySettings; }
  },
  saveJourneySettings: async (input: Partial<JourneySettings>) => {
    let current: JourneySettings = defaultJourneySettings;
    try { current = normalizeJourneySettings(JSON.parse(window.localStorage.getItem("archimedes-journey-settings") || "{}")); } catch { /* use defaults */ }
    const next = normalizeJourneySettings({ ...current, ...input });
    window.localStorage.setItem("archimedes-journey-settings", JSON.stringify(next));
    return next;
  },
  resetJourneySettings: async () => {
    window.localStorage.removeItem("archimedes-journey-settings");
    return defaultJourneySettings;
  },
  getJourneySummary: async (threadId: string) => {
    try { return JSON.parse(window.localStorage.getItem(`archimedes-journey-summary:${threadId}`) || "null"); }
    catch { return null; }
  },
  summarizeJourney: async (input: JourneySummaryInput) => {
    const snapshot: JourneySummarySnapshot = {
      threadId: input.threadId,
      brief: input.brief,
      nextMove: "Review the current chapter, then continue.",
      coversTo: input.coversTo,
      updatedAt: new Date().toISOString(),
      model: "preview",
      source: "preview",
      chapters: input.chapters.map((chapter) => ({
        id: chapter.id,
        title: chapter.title,
        summary: chapter.summary,
        episodes: chapter.episodes.map((episode) => ({ id: episode.id, title: episode.title, outcome: episode.outcome })),
      })),
      claims: [],
      chapterPlan: [],
    };
    window.localStorage.setItem(`archimedes-journey-summary:${input.threadId}`, JSON.stringify(snapshot));
    return snapshot;
  },
  clearJourneySummary: async (threadId: string) => {
    window.localStorage.removeItem(`archimedes-journey-summary:${threadId}`);
    return { cleared: true };
  },
  getTerminalSettings: async () => previewTerminalSettings,
  saveTerminalSettings: async (input: Partial<TerminalSettings>) => {
    previewTerminalSettings = { ...previewTerminalSettings, ...input };
    return previewTerminalSettings;
  },
  openExternalTerminal: async () => ({ opened: true, app: previewTerminalSettings.externalTerminalLabel }),
  createTerminal: async ({ cwd }: { cwd?: string; cols?: number; rows?: number }) => {
    const sessionId = crypto.randomUUID();
    previewPtySessions.set(sessionId, { cwd: cwd || previewWorkspace, line: "", ready: false });
    return { sessionId, workspace: cwd || previewWorkspace, shell: "zsh", pid: 0 };
  },
  readyTerminal: async (sessionId: string) => {
    const session = previewPtySessions.get(sessionId);
    if (!session || session.ready) return;
    session.ready = true;
    const folder = session.cwd.split("/").filter(Boolean).at(-1) || "workspace";
    for (const listener of previewPtyListeners) listener({ sessionId, data: `\x1b[32m${folder}\x1b[0m % ` });
  },
  writeTerminal: (sessionId: string, data: string) => {
    const session = previewPtySessions.get(sessionId);
    if (!session) return;
    if (data === "\r") {
      const command = session.line.trim();
      const output = command ? `\r\n\x1b[90m[browser preview]\x1b[0m ${command}\r\n` : "\r\n";
      session.line = "";
      for (const listener of previewPtyListeners) listener({ sessionId, data: `${output}\x1b[32marchimedes\x1b[0m % ` });
      return;
    }
    if (data === "\u007f") {
      session.line = session.line.slice(0, -1);
      for (const listener of previewPtyListeners) listener({ sessionId, data: "\b \b" });
      return;
    }
    if (data === "\t") return;
    session.line += data;
    for (const listener of previewPtyListeners) listener({ sessionId, data });
  },
  resizeTerminal: (_sessionId: string, _cols: number, _rows: number) => undefined,
  closeTerminal: async (sessionId: string) => {
    if (!previewPtySessions.delete(sessionId)) return;
    for (const listener of previewPtyExitListeners) listener({ sessionId, exitCode: 0 });
  },
  onTerminalData: (callback: (payload: { sessionId: string; data: string }) => void) => {
    previewListeners.add(callback);
    return () => previewListeners.delete(callback);
  },
  onPtyData: (callback: (payload: { sessionId: string; data: string }) => void) => {
    previewPtyListeners.add(callback);
    return () => previewPtyListeners.delete(callback);
  },
  onPtyExit: (callback: (payload: { sessionId: string; exitCode: number; signal?: number }) => void) => {
    previewPtyExitListeners.add(callback);
    return () => previewPtyExitListeners.delete(callback);
  },
  onAgentEvent: (callback: (payload: AgentEvent) => void) => {
    previewAgentListeners.add(callback);
    return () => previewAgentListeners.delete(callback);
  },
  onMenuNewChat: () => () => undefined,
  onMenuOpenFolder: () => () => undefined,
  onWorkspaceFilesChanged: (callback: (payload: { path: string }) => void) => {
    previewWorkspaceListeners.add(callback);
    return () => previewWorkspaceListeners.delete(callback);
  },
  onWorkspaceChangeSet: (callback: (payload: WorkspaceChangeSet) => void) => {
    previewChangeSetListeners.add(callback);
    return () => previewChangeSetListeners.delete(callback);
  },
};

const ArtifactCodeEditor = lazy(() => import("./ArtifactCodeEditor"));

const desktopBridge: ResearchDeskBridge = window.researchDesk ?? previewBridge;
const MAX_PASTED_IMAGE_BYTES = 6 * 1024 * 1024;
const PASTED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("The pasted image could not be read."));
    reader.onload = () => resolve(String(reader.result || ""));
    reader.readAsDataURL(blob);
  });
}

function imageDimensions(dataUrl: string) {
  return new Promise<{ width?: number; height?: number }>((resolve) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth || undefined, height: image.naturalHeight || undefined });
    image.onerror = () => resolve({});
    image.src = dataUrl;
  });
}

async function contextImageFromBlob(blob: Blob): Promise<ContextAttachment> {
  if (!PASTED_IMAGE_TYPES.has(blob.type)) throw new Error("Paste a PNG, JPEG, WebP, or GIF image.");
  if (!blob.size || blob.size > MAX_PASTED_IMAGE_BYTES) throw new Error("The pasted image must be 6 MB or smaller.");
  const dataUrl = await readDataUrl(blob);
  const dimensions = await imageDimensions(dataUrl);
  return contextImageFromData({ dataUrl, mimeType: blob.type as ContextImage["mimeType"], sizeBytes: blob.size, ...dimensions });
}

function contextImageFromData(image: ContextImage): ContextAttachment {
  if (!PASTED_IMAGE_TYPES.has(image.mimeType)) throw new Error("Paste a PNG, JPEG, WebP, or GIF image.");
  if (!image.sizeBytes || image.sizeBytes > MAX_PASTED_IMAGE_BYTES) throw new Error("The pasted image must be 6 MB or smaller.");
  return {
    id: `image:${crypto.randomUUID()}`,
    type: "image",
    name: "Pasted image",
    detail: `${image.mimeType.replace("image/", "").toUpperCase()} · ${formatBytes(image.sizeBytes)}${image.width && image.height ? ` · ${image.width} x ${image.height}` : ""}`,
    image,
  };
}

type AppTheme = "charcoal" | "paper";
type ThemePreference = AppTheme | "system";

const SIDEBAR_DEFAULT_WIDTH = 280;
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 420;

function clampSidebarWidth(value: number) {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(value)));
}

function readSidebarWidth() {
  if (typeof window === "undefined") return SIDEBAR_DEFAULT_WIDTH;
  const stored = Number(window.localStorage.getItem("archimedes-sidebar-width"));
  return Number.isFinite(stored) && stored > 0 ? clampSidebarWidth(stored) : SIDEBAR_DEFAULT_WIDTH;
}

function readSidebarHidden() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("archimedes-sidebar-hidden") === "true";
}

function systemTheme(): AppTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "charcoal";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "charcoal" : "paper";
}

function readThemePreference(): ThemePreference {
  if (typeof window === "undefined") return "system";
  const stored = window.localStorage.getItem("archimedes-theme");
  return stored === "charcoal" || stored === "paper" || stored === "system" ? stored : "system";
}

function readReasoningEffort(): ReasoningEffort {
  if (typeof window === "undefined") return "medium";
  const stored = window.localStorage.getItem("archimedes-reasoning-effort");
  return stored === "low" || stored === "medium" || stored === "high" ? stored : "medium";
}

function readContextLength(): ContextLength {
  if (typeof window === "undefined") return "standard";
  return window.localStorage.getItem("archimedes-context-length") === "extra-long" ? "extra-long" : "standard";
}

function App() {
  const { t } = useUISettings();
  const [themePreference, setThemePreference] = useState<ThemePreference>(readThemePreference);
  const [systemAppearance, setSystemAppearance] = useState<AppTheme>(systemTheme);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("general");
  const theme: AppTheme = themePreference === "system" ? systemAppearance : themePreference;
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);
  const [sidebarHidden, setSidebarHidden] = useState(readSidebarHidden);
  const sidebarDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [mainSection, setMainSection] = useState<MainSection>("chat");
  const [extensionsTab, setExtensionsTab] = useState<ExtensionsTab>("skills");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [runtimeMenuOpen, setRuntimeMenuOpen] = useState(false);
  const [imageCreationOpened, setImageCreationOpened] = useState(false);
  const [dailyStartMode, setDailyStartMode] = useState<DailyDiscoveryMode | "conference">("latest");
  const [libraryRefreshVersion, setLibraryRefreshVersion] = useState(0);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [events, setEvents] = useState<TimelineEvent[]>(initialEvents);
  const [trajectoryEvents, setTrajectoryEvents] = useState<ResearchEvent[]>([]);
  const [workspace, setWorkspace] = useState(DEFAULT_WORKSPACE);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [archivedProjects, setArchivedProjects] = useState<ResearchProject[]>([]);
  const [threads, setThreads] = useState<ResearchThread[]>([]);
  const [archivedThreads, setArchivedThreads] = useState<ResearchThread[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [runningThreadId, setRunningThreadId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [workbenchOpen, setWorkbenchOpen] = useState(false);
  const [workbenchTab, setWorkbenchTab] = useState<WorkbenchTab>("trajectory");
  const [trajectoryFocusSequence, setTrajectoryFocusSequence] = useState<number | null>(null);
  const [journeySettings, setJourneySettings] = useState<JourneySettings>(defaultJourneySettings);
  const [terminalSettings, setTerminalSettings] = useState<TerminalSettings | null>(null);
  const [terminalSettingsOpen, setTerminalSettingsOpen] = useState(false);
  const [terminalSettingsMode, setTerminalSettingsMode] = useState<"settings" | "onboarding">("settings");
  const [workbenchWidth, setWorkbenchWidth] = useState(() => {
    const saved = Number(localStorage.getItem("archimedes-workbench-width"));
    return Number.isFinite(saved) && saved > 0 ? clampWorkbenchWidth(saved) : defaultWorkbenchWidth();
  });
  const [runningSession, setRunningSession] = useState<string | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [interrupting, setInterrupting] = useState(false);
  const [chatViewNonce, setChatViewNonce] = useState(0);
  const [researchMode, setResearchMode] = useState<ResearchMode>("idea-spark");
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(readReasoningEffort);
  const [contextLength, setContextLength] = useState<ContextLength>(readContextLength);
  const [modelCapabilities, setModelCapabilities] = useState<ModelCapabilities>(previewModelCapabilities);
  const [contextItems, setContextItems] = useState<ContextAttachment[]>([]);
  const [fileTree, setFileTree] = useState<WorkspaceFileTree>({ entries: [], count: 0, truncated: false });
  const [loadingDirectories, setLoadingDirectories] = useState<Set<string>>(new Set());
  const [openFiles, setOpenFiles] = useState<WorkspaceFilePreview[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<WorkspaceFilePreview | null>(null);
  const [fileLoading, setFileLoading] = useState(false);
  const [fileError, setFileError] = useState("");
  const [paperOpenRequest, setPaperOpenRequest] = useState<PaperOpenRequest>(null);
  const [changeSets, setChangeSets] = useState<WorkspaceChangeSet[]>([]);
  const [papers, setPapers] = useState(initialPapers);
  const [modal, setModal] = useState<Modal>(null);
  const [activeModelConfig, setActiveModelConfig] = useState<PublicModelConfig | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectWorkspace, setNewProjectWorkspace] = useState("");
  const [newProjectError, setNewProjectError] = useState("");
  const [projectFolderError, setProjectFolderError] = useState("");
  const [projectToRemove, setProjectToRemove] = useState<ResearchProject | null>(null);
  const [threadToRemove, setThreadToRemove] = useState<ResearchThread | null>(null);
  const [threadRemoveError, setThreadRemoveError] = useState("");
  const [artifactName, setArtifactName] = useState("");
  const [artifactDrafts, setArtifactDrafts] = useState<Record<string, ArtifactDraft>>({});
  const [artifactSaving, setArtifactSaving] = useState<Set<string>>(new Set());
  const [artifactConflicts, setArtifactConflicts] = useState<Record<string, string>>({});
  const [artifactErrors, setArtifactErrors] = useState<Record<string, string>>({});
  const [composerRequest, setComposerRequest] = useState<{ id: string; text: string } | null>(null);
  const [evidenceTitle, setEvidenceTitle] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [searchQuery, setSearchQuery] = useState("retrieval budget reasoning");
  const [selectedSource, setSelectedSource] = useState("");
  const activeThreadIdRef = useRef<string | null>(null);
  const threadOpenRequestRef = useRef(0);
  const openFilesRef = useRef<WorkspaceFilePreview[]>([]);
  const artifactDraftsRef = useRef<Record<string, ArtifactDraft>>({});
  const artifactSavingRef = useRef<Set<string>>(new Set());
  const pendingAssistantDeltasRef = useRef(new Map<string, { delta: string; threadId?: string }>());
  const assistantDeltaFrameRef = useRef<number | null>(null);
  const mainWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const runtimeMenuRef = useRef<HTMLDivElement | null>(null);
  const threadsRef = useRef<ResearchThread[]>([]);
  const refreshingThreadsRef = useRef(false);
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null;
  // Research data lives in the primary workspace. Agent tools, files, terminal,
  // and paper writing operate inside the session folder: session snapshot →
  // project folder → primary workspace.
  const executionWorkspace = activeThread?.workspace_path || activeProject?.workspace_path || workspace;
  const executionWorkspaceName = executionWorkspace ? executionWorkspace.split(/[\\/]/).filter(Boolean).at(-1) ?? executionWorkspace : "";
  threadsRef.current = threads;

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "paper" ? "#fbfaf8" : "#20211F");
    const applyTitleBar = desktopBridge.setTitleBarTheme;
    if (applyTitleBar) void applyTitleBar(theme).catch(() => undefined);
  }, [theme]);

  useEffect(() => {
    const platform = desktopBridge.platform ?? "web";
    document.documentElement.dataset.platform = platform;
    document.documentElement.dataset.titlebar = platform === "win32" ? "overlay" : platform === "darwin" ? "inset" : "default";
  }, []);

  useEffect(() => {
    window.localStorage.setItem("archimedes-theme", themePreference);
  }, [themePreference]);

  useEffect(() => {
    const handleSettingsShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key !== ",") return;
      event.preventDefault();
      setSettingsOpen((open) => !open);
    };
    window.addEventListener("keydown", handleSettingsShortcut);
    return () => window.removeEventListener("keydown", handleSettingsShortcut);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("archimedes-reasoning-effort", reasoningEffort);
  }, [reasoningEffort]);

  useEffect(() => {
    window.localStorage.setItem("archimedes-context-length", contextLength);
  }, [contextLength]);

  useEffect(() => {
    let active = true;
    void desktopBridge.getModelCapabilities().then((capabilities) => {
      if (active) setModelCapabilities(capabilities);
    }).catch(() => {
      if (active) setModelCapabilities(previewModelCapabilities);
    });
    return () => { active = false; };
  }, [activeModelConfig?.provider, activeModelConfig?.model]);

  useEffect(() => {
    if (modelCapabilities.thinkingEfforts.length && !modelCapabilities.thinkingEfforts.includes(reasoningEffort)) {
      setReasoningEffort(modelCapabilities.thinkingEfforts.includes("medium") ? "medium" : modelCapabilities.thinkingEfforts[0]);
    }
    if (!modelCapabilities.contextLengths.includes(contextLength)) setContextLength("standard");
  }, [contextLength, modelCapabilities, reasoningEffort]);

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemAppearance(query.matches ? "charcoal" : "paper");
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    window.localStorage.setItem("archimedes-sidebar-width", String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    window.localStorage.setItem("archimedes-sidebar-hidden", String(sidebarHidden));
  }, [sidebarHidden]);

  useEffect(() => {
    window.localStorage.setItem("archimedes-workbench-width", String(workbenchWidth));
  }, [workbenchWidth]);

  useEffect(() => {
    const handleResize = () => setWorkbenchWidth((width) => clampWorkbenchWidth(width));
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // The workbench can leave the reading pane around 440px wide, which is well
  // below the viewport breakpoints used by the knowledge views. Tag the pane
  // itself so those views can reflow without container containment (which
  // would trap the fixed-position dialogs they render).
  useEffect(() => {
    const element = mainWorkspaceRef.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      element.toggleAttribute("data-narrow", entry.contentRect.width < 560);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!agentBusy || !activeThreadId) return;
    let cancelled = false;
    const refresh = () => {
      void desktopBridge.getResearchThread(activeThreadId, workspace)
        .then((thread) => {
          if (cancelled || activeThreadIdRef.current !== thread.id) return;
          setTrajectoryEvents(thread.events ?? []);
        })
        .catch(() => undefined);
    };
    const timer = window.setInterval(refresh, 8_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [activeThreadId, agentBusy, workspace]);

  useEffect(() => {
    let cancelled = false;
    void desktopBridge.getJourneySettings()
      .then((settings) => { if (!cancelled) setJourneySettings(normalizeJourneySettings(settings)); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  async function saveJourneySettings(patch: Partial<JourneySettings>) {
    const optimistic = normalizeJourneySettings({ ...journeySettings, ...patch });
    setJourneySettings(optimistic);
    try {
      const saved = await desktopBridge.saveJourneySettings(patch);
      setJourneySettings(normalizeJourneySettings(saved));
    } catch {
      void desktopBridge.getJourneySettings()
        .then((settings) => setJourneySettings(normalizeJourneySettings(settings)))
        .catch(() => undefined);
    }
  }

  async function resetJourneySettings() {
    try {
      const next = await desktopBridge.resetJourneySettings();
      setJourneySettings(normalizeJourneySettings(next));
    } catch {
      setJourneySettings(defaultJourneySettings);
    }
  }

  useEffect(() => {
    let cancelled = false;
    void desktopBridge.getTerminalSettings()
      .then((settings) => { if (!cancelled) setTerminalSettings(settings); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!terminalSettings || terminalSettings.onboarded || !workbenchOpen || workbenchTab !== "terminal") return;
    setTerminalSettingsMode("onboarding");
    setTerminalSettingsOpen(true);
  }, [terminalSettings, workbenchOpen, workbenchTab]);

  async function saveTerminalSettings(patch: Partial<TerminalSettings>) {
    const next = await desktopBridge.saveTerminalSettings(patch);
    setTerminalSettings(next);
    setTerminalSettingsOpen(false);
  }

  async function openExternalTerminal(externalTerminal: TerminalExternalTerminal) {
    const result = await desktopBridge.openExternalTerminal({ cwd: executionWorkspace, externalTerminal });
    if (!result.opened) throw new Error(result.error || `${result.app} could not be opened.`);
  }

  function closeTerminalSettings() {
    if (terminalSettingsMode === "onboarding" && terminalSettings && !terminalSettings.onboarded) {
      void desktopBridge.saveTerminalSettings({ onboarded: true }).then(setTerminalSettings).catch(() => undefined);
    }
    setTerminalSettingsOpen(false);
  }

  useEffect(() => {
    if (!runtimeMenuOpen) return;
    function handlePointerDown(event: PointerEvent) {
      if (!runtimeMenuRef.current?.contains(event.target as Node)) setRuntimeMenuOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setRuntimeMenuOpen(false);
    }
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [runtimeMenuOpen]);

  useEffect(() => {
    const handleWorkbenchShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "`") {
        event.preventDefault();
        toggleWorkbench();
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPaletteOpen((open) => !open);
      }
    };
    window.addEventListener("keydown", handleWorkbenchShortcut);
    return () => window.removeEventListener("keydown", handleWorkbenchShortcut);
  }, [workbenchOpen]);

  function openWorkbench(tab: WorkbenchTab) {
    setWorkbenchTab(tab);
    setWorkbenchOpen(true);
  }

  function activateSidebarEntry(entry: SidebarEntry) {
    if (entry.disabled) return;
    const section = entry.destination.section;
    if (section === "daily") setDailyStartMode("latest");
    if (section === "image-creation") setImageCreationOpened(true);
    setMainSection(section);
  }

  function openTrajectoryAt(sequence?: number) {
    setTrajectoryFocusSequence(typeof sequence === "number" ? sequence : null);
    setWorkbenchTab("trajectory");
  }

  function closeWorkbench() {
    if (Object.values(artifactDraftsRef.current).some(isDraftDirty) && !window.confirm("Hide the workbench? Unsaved file changes stay in the editor.")) return;
    setWorkbenchOpen(false);
  }

  function toggleWorkbench() {
    if (workbenchOpen) closeWorkbench();
    else setWorkbenchOpen(true);
  }

  useEffect(() => () => {
    document.body.classList.remove("sidebar-resizing");
    document.body.classList.remove("workbench-resizing");
  }, []);

  function beginSidebarResize(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    sidebarDragRef.current = { startX: event.clientX, startWidth: sidebarWidth };
    event.currentTarget.setPointerCapture(event.pointerId);
    document.body.classList.add("sidebar-resizing");
  }

  function moveSidebarResize(event: React.PointerEvent<HTMLDivElement>) {
    const drag = sidebarDragRef.current;
    if (!drag) return;
    setSidebarWidth(clampSidebarWidth(drag.startWidth + event.clientX - drag.startX));
  }

  function endSidebarResize(event: React.PointerEvent<HTMLDivElement>) {
    if (!sidebarDragRef.current) return;
    sidebarDragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    document.body.classList.remove("sidebar-resizing");
  }

  function handleSidebarResizeKey(event: React.KeyboardEvent<HTMLDivElement>) {
    const step = event.key === "ArrowLeft" ? -8 : event.key === "ArrowRight" ? 8 : 0;
    if (step) {
      event.preventDefault();
      setSidebarWidth((width) => clampSidebarWidth(width + step));
      return;
    }
    if (event.key === "Home") {
      event.preventDefault();
      setSidebarWidth(SIDEBAR_MIN_WIDTH);
    } else if (event.key === "End") {
      event.preventDefault();
      setSidebarWidth(SIDEBAR_MAX_WIDTH);
    }
  }

  function clearPendingAssistantDeltas() {
    pendingAssistantDeltasRef.current.clear();
    if (assistantDeltaFrameRef.current !== null) {
      cancelAnimationFrame(assistantDeltaFrameRef.current);
      assistantDeltaFrameRef.current = null;
    }
  }

  function flushAssistantDeltas() {
    assistantDeltaFrameRef.current = null;
    const pending = [...pendingAssistantDeltasRef.current.entries()];
    pendingAssistantDeltasRef.current.clear();
    if (!pending.length) return;
    setMessages((current) => {
      let next = current;
      for (const [streamId, update] of pending) {
        const index = next.findIndex((message) => message.id === streamId);
        if (index < 0) {
          if (next === current) next = [...current];
          next.push({ id: streamId, role: "assistant", text: update.delta });
          continue;
        }
        if (next === current) next = [...current];
        next[index] = { ...next[index], text: `${next[index].text}${update.delta}` };
      }
      return next;
    });
  }

  function queueAssistantDelta(event: AgentEvent) {
    if (!event.turnId || !event.delta) return;
    const streamId = `${event.turnId}:stream`;
    const existing = pendingAssistantDeltasRef.current.get(streamId);
    pendingAssistantDeltasRef.current.set(streamId, {
      delta: `${existing?.delta ?? ""}${event.delta}`,
      threadId: event.threadId,
    });
    if (assistantDeltaFrameRef.current === null) {
      assistantDeltaFrameRef.current = requestAnimationFrame(flushAssistantDeltas);
    }
  }

  useEffect(() => {
    activeThreadIdRef.current = activeThreadId;
  }, [activeThreadId]);

  useEffect(() => {
    openFilesRef.current = openFiles;
  }, [openFiles]);

  useEffect(() => {
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (!Object.values(artifactDraftsRef.current).some(isDraftDirty)) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, []);

  useEffect(() => () => clearPendingAssistantDeltas(), []);

  useEffect(() => {
    const unsubscribe = desktopBridge.onTerminalData(({ sessionId, data }) => {
      if (sessionId === runningSession && (data.includes("[process exited") || data.includes("[process stopped]"))) {
        setRunningSession(null);
        setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: "The approved command finished and its output was recorded in the workspace history." }]);
      }
    });
    return unsubscribe;
  }, [runningSession]);

  useEffect(() => {
    const unsubscribe = desktopBridge.onAgentEvent((event) => {
      if (event.threadId) {
        setRunningThreadId(event.threadId);
        if (!activeThreadIdRef.current) {
          activeThreadIdRef.current = event.threadId;
          setActiveThreadId(event.threadId);
        }
        // A new chat exists in the database before its first turn finishes.
        // Pull one snapshot so its Work row can show the live Running state.
        if (!threadsRef.current.some((thread) => thread.id === event.threadId) && !refreshingThreadsRef.current) {
          refreshingThreadsRef.current = true;
          void desktopBridge.getResearchSnapshot?.().then((snapshot) => {
            setProjects(snapshot.projects);
            setArchivedProjects(snapshot.archivedProjects ?? []);
            setThreads(snapshot.threads);
            setArchivedThreads(snapshot.archivedThreads ?? []);
            const runningThread = snapshot.threads.find((thread) => thread.id === event.threadId);
            if (runningThread?.workspace_path) void desktopBridge.watchWorkspace?.(runningThread.workspace_path).catch(() => undefined);
          }).catch(() => undefined).finally(() => {
            refreshingThreadsRef.current = false;
          });
        }
      }
      if (event.type === "assistant_delta" && event.turnId && event.delta) {
        if (event.threadId && activeThreadIdRef.current !== event.threadId) return;
        queueAssistantDelta(event);
        return;
      }
      if (event.type === "complete" || event.type === "failed" || event.type === "interrupted") {
        flushAssistantDeltas();
        setInterrupting(false);
      }
      if (event.type === "approval" && event.action && (!event.threadId || activeThreadIdRef.current === event.threadId)) {
        setPendingAction({ ...event.action, source: "agent" });
        if (event.threadId) setThreads((current) => current.map((thread) => thread.id === event.threadId ? { ...thread, pending_actions: (thread.pending_actions ?? 0) + 1 } : thread));
      }
      const state = event.type === "complete" ? "done" : event.type === "configuration" || event.type === "failed" || event.type === "interrupted" ? "waiting" : "active";
      setEvents((current) => [...current.filter((item) => item.title !== event.title), { title: event.title, detail: event.detail, state }]);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const unsubscribeFiles = desktopBridge.onWorkspaceFilesChanged(() => {
      if (executionWorkspace) void refreshWorkspaceFiles();
    });
    const unsubscribeChanges = desktopBridge.onWorkspaceChangeSet((changeSet) => {
      if (!changeSet.threadId || activeThreadIdRef.current === changeSet.threadId) {
        setChangeSets((current) => upsertChangeSet(current, changeSet));
      }
      if (executionWorkspace) void refreshWorkspaceFiles();
    });
    return () => {
      unsubscribeFiles();
      unsubscribeChanges();
    };
  }, [executionWorkspace, selectedFilePath]);

  useEffect(() => {
    if (!workspaceReady || !executionWorkspace) return;
    void desktopBridge.watchWorkspace?.(executionWorkspace).catch(() => undefined);
    openFilesRef.current = [];
    setOpenFiles([]);
    setSelectedFilePath(null);
    setSelectedFile(null);
    setFileError("");
    void refreshWorkspaceFiles();
  }, [executionWorkspace, workspaceReady]);

  useEffect(() => {
    void desktopBridge.getInitialWorkspace().then((initialWorkspace) => loadWorkspace(initialWorkspace ?? DEFAULT_WORKSPACE));
    void desktopBridge.getModelConfig().then(setActiveModelConfig).catch(() => setActiveModelConfig(null));
  }, []);

  useEffect(() => {
    const unsubscribeNewChat = desktopBridge.onMenuNewChat(() => startNewTask());
    const unsubscribeOpenFolder = desktopBridge.onMenuOpenFolder((selectedWorkspace) => {
      if (!agentBusy) void loadWorkspace(selectedWorkspace);
    });
    return () => {
      unsubscribeNewChat();
      unsubscribeOpenFolder();
    };
  }, [activeProjectId, agentBusy]);

  async function chooseWorkspace() {
    if (agentBusy) return;
    const selected = await desktopBridge.chooseWorkspace();
    if (selected) await loadWorkspace(selected);
  }

  async function loadWorkspace(workspacePath: string) {
    if (Object.values(artifactDraftsRef.current).some(isDraftDirty) && !window.confirm("Discard unsaved artifact changes?")) return;
    clearPendingAssistantDeltas();
    setWorkspaceReady(false);
    const snapshot = await desktopBridge.openWorkspace(workspacePath);
    setWorkspace(snapshot.workspace);
    setProjects(snapshot.projects ?? []);
    setArchivedProjects(snapshot.archivedProjects ?? []);
    setThreads(snapshot.threads);
    setArchivedThreads(snapshot.archivedThreads ?? []);
    const nextTree = await desktopBridge.listWorkspaceFiles(snapshot.workspace);
    setFileTree(nextTree);
    setLoadingDirectories(new Set());
    openFilesRef.current = [];
    setOpenFiles([]);
    setSelectedFilePath(null);
    setSelectedFile(null);
    setFileError("");
    setDrafts({});
    artifactSavingRef.current = new Set();
    setArtifactSaving(new Set());
    setArtifactConflicts({});
    setArtifactErrors({});
    setWorkspaceReady(true);

    if (snapshot.threads.length) {
      const thread = await desktopBridge.getResearchThread(snapshot.threads[0].id, snapshot.workspace);
      setMessages(thread.messages.length ? thread.messages : initialMessages);
      setTrajectoryEvents(thread.events ?? []);
      setEvents([]);
      setActiveThreadId(thread.id);
      setActiveProjectId(thread.project_id);
      setResearchMode(thread.mode);
      setChangeSets(thread.changeSets ?? []);
    } else {
      setMessages(initialMessages);
      setTrajectoryEvents([]);
      setEvents([]);
      setActiveThreadId(null);
      setActiveProjectId(snapshot.projects?.[0]?.id ?? null);
      setChangeSets([]);
    }

    const action = snapshot.actions.find((candidate) => candidate.status === "pending");
    setPendingAction(action ? { ...action, source: "agent" } : null);

  }

  function setDrafts(next: Record<string, ArtifactDraft>) {
    artifactDraftsRef.current = next;
    setArtifactDrafts(next);
  }

  function setArtifactSavingPath(filePath: string, saving: boolean) {
    const next = new Set(artifactSavingRef.current);
    if (saving) next.add(filePath); else next.delete(filePath);
    artifactSavingRef.current = next;
    setArtifactSaving(next);
  }

  function ensureArtifactDraft(file: WorkspaceFilePreview) {
    if (!isEditableArtifact(file)) return;
    const current = artifactDraftsRef.current[file.path];
    const draft = createArtifactDraft(file);
    if (!draft || (current && isDraftDirty(current))) return;
    setDrafts({ ...artifactDraftsRef.current, [file.path]: draft });
  }

  async function refreshWorkspaceFiles() {
    if (!executionWorkspace) return;
    try {
      const nextTree = await desktopBridge.listWorkspaceFiles(executionWorkspace);
      setFileTree(nextTree);
      const currentOpenFiles = openFilesRef.current;
      if (currentOpenFiles.length) {
        const refreshedFiles = await Promise.all(currentOpenFiles.map(async (file) => {
          try {
            return await desktopBridge.readWorkspaceFile(executionWorkspace, file.path);
          } catch {
            return file;
          }
        }));
        const merged = mergeRefreshedArtifactFiles(currentOpenFiles, refreshedFiles, artifactDraftsRef.current, artifactSavingRef.current);
        openFilesRef.current = merged.files;
        setOpenFiles(merged.files);
        setArtifactConflicts(merged.conflicts);
        if (selectedFilePath) setSelectedFile(merged.files.find((file) => file.path === selectedFilePath) ?? null);
      }
    } catch (error) {
      setFileError(error instanceof Error ? error.message : String(error));
    }
  }

  async function loadWorkspaceDirectory(directory: string) {
    if (!executionWorkspace || !directory) return;
    setLoadingDirectories((current) => new Set(current).add(directory));
    try {
      const listing = await desktopBridge.listWorkspaceFiles(executionWorkspace, directory);
      setFileTree((current) => ({ ...current, entries: setDirectoryChildren(current.entries, directory, listing.entries) }));
    } catch {
      setFileTree((current) => ({ ...current, entries: setDirectoryChildren(current.entries, directory, []) }));
    } finally {
      setLoadingDirectories((current) => {
        const next = new Set(current);
        next.delete(directory);
        return next;
      });
    }
  }

  function startNewTask(projectId = activeProjectId) {
    if (agentBusy) return;
    setMainSection("chat");
    clearPendingAssistantDeltas();
    setChatViewNonce((current) => current + 1);
    if (projectId) setActiveProjectId(projectId);
    activeThreadIdRef.current = null;
    setActiveThreadId(null);
    setMessages(initialMessages);
    setTrajectoryEvents([]);
    setPendingAction(null);
    setContextItems([]);
    setChangeSets([]);
  }

  async function openResearchThread(threadSummary: ResearchThread) {
    clearPendingAssistantDeltas();
    setMainSection("chat");
    activeThreadIdRef.current = threadSummary.id;
    setActiveThreadId(threadSummary.id);
    setActiveProjectId(threadSummary.project_id);
    const requestId = ++threadOpenRequestRef.current;
    try {
      const thread = await desktopBridge.getResearchThread(threadSummary.id, workspace);
      if (requestId !== threadOpenRequestRef.current) return;
      activeThreadIdRef.current = thread.id;
      setActiveThreadId(thread.id);
      setActiveProjectId(thread.project_id);
      setMessages(thread.messages.length ? thread.messages : initialMessages);
      setTrajectoryEvents(thread.events ?? []);
      setEvents([]);
      setResearchMode(thread.mode);
      setChangeSets(thread.changeSets ?? []);
      const action = thread.turns.map((turn) => turn.task_id).filter(Boolean);
      setPendingAction((current) => current && action.includes(current.task_id) ? current : null);
    } catch (error) {
      if (requestId !== threadOpenRequestRef.current) return;
      setMessages([{ id: crypto.randomUUID(), role: "assistant", text: `Could not open this research chat: ${String(error)}` }]);
      setChangeSets([]);
    }
  }

  function openNewProject() {
    if (agentBusy) return;
    setNewProjectName("");
    setNewProjectWorkspace(activeProject?.workspace_path || workspace);
    setNewProjectError("");
    setNewProjectOpen(true);
  }

  async function chooseNewProjectFolder() {
    const selected = await desktopBridge.chooseWorkspace();
    if (selected) setNewProjectWorkspace(selected);
  }

  async function createProject() {
    const name = newProjectName.trim();
    if (!name || agentBusy) return;
    try {
      const project = await desktopBridge.createResearchProject({ name, workspacePath: newProjectWorkspace || workspace });
      setProjects((current) => [project, ...current]);
      setNewProjectName("");
      setNewProjectError("");
      setNewProjectOpen(false);
      startNewTask(project.id);
    } catch (error) {
      setNewProjectError(error instanceof Error ? error.message : String(error));
    }
  }

  async function changeProjectWorkspace(project: ResearchProject) {
    if (agentBusy) return;
    const selected = await desktopBridge.chooseWorkspace();
    if (!selected) return;
    try {
      const updated = await desktopBridge.setResearchProjectWorkspace(project.id, selected);
      setProjects((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
      setProjectFolderError("");
    } catch (error) {
      setProjectFolderError(error instanceof Error ? error.message : String(error));
    }
  }

  async function renameProject(projectId: string, name: string) {
    if (agentBusy) return;
    const project = await desktopBridge.renameResearchProject(projectId, name);
    setProjects((current) => current.map((candidate) => candidate.id === project.id ? project : candidate));
  }

  async function archiveThread(thread: ResearchThread, archived: boolean) {
    if (agentBusy) return;
    await desktopBridge.archiveResearchThread(thread.id, archived);
    const snapshot = await desktopBridge.openWorkspace(workspace);
    setProjects(snapshot.projects);
    setArchivedProjects(snapshot.archivedProjects ?? []);
    setThreads(snapshot.threads);
    setArchivedThreads(snapshot.archivedThreads);
    if (archived && activeThreadId === thread.id) {
      const next = snapshot.threads.find((candidate) => candidate.project_id === thread.project_id);
      if (next) await openResearchThread(next); else startNewTask(thread.project_id);
    }
  }

  async function removeThread(thread: ResearchThread) {
    if (agentBusy) return;
    if (typeof desktopBridge.deleteResearchThread !== "function") {
      setThreadRemoveError("Restart the desktop app to finish installing chat deletion.");
      return;
    }
    try {
      await desktopBridge.deleteResearchThread(thread.id);
      setThreadRemoveError("");
      setThreadToRemove(null);
      const snapshot = await desktopBridge.openWorkspace(workspace);
      setProjects(snapshot.projects);
      setArchivedProjects(snapshot.archivedProjects ?? []);
      setThreads(snapshot.threads);
      setArchivedThreads(snapshot.archivedThreads);
      if (activeThreadId === thread.id) {
        const next = snapshot.threads[0];
        if (next) await openResearchThread(next);
        else {
          activeThreadIdRef.current = null;
          setActiveThreadId(null);
          setMessages(initialMessages);
          setChangeSets([]);
        }
      }
    } catch (error) {
      setThreadRemoveError(error instanceof Error ? error.message : "The chat could not be deleted.");
    }
  }

  async function archiveProject(project: ResearchProject, archived: boolean) {
    if (agentBusy) return;
    await desktopBridge.archiveResearchProject(project.id, archived);
    const snapshot = await desktopBridge.openWorkspace(workspace);
    setProjects(snapshot.projects);
    setArchivedProjects(snapshot.archivedProjects ?? []);
    setThreads(snapshot.threads);
    setArchivedThreads(snapshot.archivedThreads);
    if (archived && activeProjectId === project.id) {
      const nextThread = snapshot.threads[0];
      if (nextThread) await openResearchThread(nextThread);
      else {
        activeThreadIdRef.current = null;
        setActiveThreadId(null);
        setActiveProjectId(snapshot.projects[0]?.id ?? null);
        setMessages(initialMessages);
        setChangeSets([]);
      }
    }
  }

  async function removeProject(project: ResearchProject) {
    if (agentBusy) return;
    await desktopBridge.deleteResearchProject(project.id);
    setProjectToRemove(null);
    const snapshot = await desktopBridge.openWorkspace(workspace);
    setProjects(snapshot.projects);
    setArchivedProjects(snapshot.archivedProjects ?? []);
    setThreads(snapshot.threads);
    setArchivedThreads(snapshot.archivedThreads);
    if (activeProjectId === project.id) {
      const nextThread = snapshot.threads[0];
      if (nextThread) await openResearchThread(nextThread);
      else {
        activeThreadIdRef.current = null;
        setActiveThreadId(null);
        setActiveProjectId(snapshot.projects[0]?.id ?? null);
        setMessages(initialMessages);
        setChangeSets([]);
      }
    }
  }

  async function submitPrompt(draft: string, requestedMode: ResearchMode = researchMode, requestedReasoningEffort: ReasoningEffort = reasoningEffort, requestedContextLength: ContextLength = contextLength) {
    const question = draft.trim();
    const hasPastedImage = contextItems.some((item) => item.type === "image");
    if ((!question && !hasPastedImage) || agentBusy) return;
    const requestPrompt = question || "Please analyze the attached image.";
    const submittedContext = contextItems;
    const submittedThreadId = activeThreadIdRef.current;

    setResearchMode(requestedMode);

    clearPendingAssistantDeltas();
    setAgentBusy(true);
    setInterrupting(false);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text: requestPrompt, created_at: new Date().toISOString() }]);
    setEvents([{ title: "Evidence synthesis", detail: "Reading workspace and knowledge context", state: "active" }]);

    try {
      const result = await desktopBridge.runAgent({ prompt: requestPrompt, workspace: executionWorkspace, threadId: activeThreadId || undefined, projectId: activeProjectId || undefined, mode: requestedMode, reasoningEffort: requestedReasoningEffort, contextLength: requestedContextLength, contextItems: submittedContext });
      setThreads((current) => [result.thread, ...current.filter((thread) => thread.id !== result.threadId)]);
      const stillViewingSubmittedThread = activeThreadIdRef.current === result.threadId
        || (submittedThreadId === null && activeThreadIdRef.current === null);
      if (stillViewingSubmittedThread) {
        clearPendingAssistantDeltas();
        activeThreadIdRef.current = result.threadId;
        setMessages(result.thread.messages.length ? result.thread.messages : initialMessages);
        setTrajectoryEvents(result.thread.events ?? []);
        setEvents([]);
        setActiveThreadId(result.threadId);
        setActiveProjectId(result.thread.project_id);
        setChangeSets(result.thread.changeSets ?? []);
        setEvents((current) => current.map((event) => event.title === "Evidence synthesis" ? { ...event, detail: "Turn saved to this research thread", state: "done" } : event));
        const proposedAction = result.actions.find((action) => action.status === "pending");
        if (proposedAction) setPendingAction({ ...proposedAction, source: "agent" });
      }
      setContextItems((current) => current.filter((item) => !submittedContext.some((submitted) => submitted.id === item.id)));
    } catch (error) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: `Archimedes could not start this task: ${String(error)}` }]);
    } finally {
      setAgentBusy(false);
      setRunningThreadId(null);
      setInterrupting(false);
    }
  }

  async function interruptResearchTurn() {
    if (!runningThreadId || interrupting) return;
    setInterrupting(true);
    setEvents((current) => [
      ...current.filter((event) => event.title !== "Cancelling task"),
      { title: "Cancelling task", detail: "Stopping the active research turn", state: "active" },
    ]);
    try {
      await desktopBridge.interruptAgent(runningThreadId);
    } catch (error) {
      setInterrupting(false);
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: `Archimedes could not interrupt this task: ${String(error)}` }]);
    }
  }

  async function runCommand(command: string, actionId?: string) {
    const trimmedCommand = command.trim();
    if (!trimmedCommand || runningSession) return;
    openWorkbench("terminal");
    try {
      const { sessionId } = await desktopBridge.runTerminal({ command: trimmedCommand, cwd: executionWorkspace, actionId });
      setRunningSession(sessionId);
    } catch (error) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: `The command could not start: ${String(error)}` }]);
    }
  }

  async function openArtifact(filePath: string, surface: "workbench" | "page" = "workbench") {
    if (surface === "page") setMainSection("artifacts");
    else openWorkbench("files");
    setSelectedFilePath(filePath);
    setFileLoading(true);
    setFileError("");
    try {
      const file = await desktopBridge.readWorkspaceFile(executionWorkspace, filePath);
      ensureArtifactDraft(file);
      setSelectedFile(file);
      setOpenFiles((current) => {
        const existingIndex = current.findIndex((candidate) => candidate.path === file.path);
        const next = existingIndex < 0
          ? [...current, file]
          : current.map((candidate, index) => index === existingIndex ? file : candidate);
        openFilesRef.current = next;
        return next;
      });
      setArtifactConflicts((current) => withoutKey(current, filePath));
      setArtifactErrors((current) => withoutKey(current, filePath));
    } catch (error) {
      setSelectedFile(null);
      setFileError(error instanceof Error ? error.message : String(error));
    } finally {
      setFileLoading(false);
    }
  }

  function openChangedFile(filePath: string) {
    if (/\.(?:tex|bib|bst|cls|sty|cfg)$/i.test(filePath)) {
      setPaperOpenRequest({ path: filePath, token: Date.now() });
      setMainSection("writing");
      return;
    }
    void openArtifact(filePath);
  }

  function askAIAboutPaper(filePath: string) {
    const absolutePath = `${executionWorkspace.replace(/[\\/]$/, "")}/${filePath.replace(/^\/+/, "")}`;
    const attachment: ContextAttachment = { id: `file:${absolutePath}`, type: "file", name: filePath.split("/").at(-1) || filePath, path: absolutePath, detail: `LaTeX paper source · ${filePath}` };
    setContextItems((current) => current.some((item) => item.id === attachment.id) ? current : [...current, attachment].slice(0, 12));
    setResearchMode("paper-generation");
    setMainSection("chat");
  }

  function selectOpenArtifact(file: WorkspaceFilePreview, surface: "workbench" | "page" = "workbench") {
    if (surface === "page") setMainSection("artifacts");
    else openWorkbench("files");
    setSelectedFilePath(file.path);
    setSelectedFile(file);
    setFileError("");
    ensureArtifactDraft(file);
  }

  function closeArtifact(filePath: string) {
    if (isDraftDirty(artifactDraftsRef.current[filePath]) && !window.confirm(`Discard unsaved changes to ${filePath}?`)) return;
    const current = openFilesRef.current;
    const closedIndex = current.findIndex((file) => file.path === filePath);
    if (closedIndex < 0) return;
    const next = current.filter((file) => file.path !== filePath);
    openFilesRef.current = next;
    setOpenFiles(next);
    const nextDrafts = { ...artifactDraftsRef.current };
    delete nextDrafts[filePath];
    setDrafts(nextDrafts);
    setArtifactConflicts((current) => withoutKey(current, filePath));
    setArtifactErrors((current) => withoutKey(current, filePath));
    if (selectedFilePath !== filePath) return;
    const replacement = next[Math.min(closedIndex, next.length - 1)] ?? null;
    setSelectedFilePath(replacement?.path ?? null);
    setSelectedFile(replacement);
    setFileError("");
  }

  function updateArtifactDraft(filePath: string, content: string) {
    const draft = artifactDraftsRef.current[filePath];
    if (!draft || draft.content === content) return;
    setDrafts({ ...artifactDraftsRef.current, [filePath]: { ...draft, content } });
    setArtifactErrors((current) => withoutKey(current, filePath));
  }

  async function saveArtifact(filePath: string) {
    const draft = artifactDraftsRef.current[filePath];
    if (!draft || !isDraftDirty(draft)) return;
    const contentAtSave = draft.content;
    setArtifactSavingPath(filePath, true);
    setArtifactErrors((current) => withoutKey(current, filePath));
    try {
      const saved = await desktopBridge.writeWorkspaceFile(executionWorkspace, filePath, prepareArtifactContent(draft));
      const savedContent = toEditorText(saved.content ?? contentAtSave);
      const latest = artifactDraftsRef.current[filePath];
      if (latest) {
        setDrafts({
          ...artifactDraftsRef.current,
          [filePath]: markDraftSaved({ ...latest, savedContent }, savedContent, saved.modifiedAt),
        });
      }
      const updateFile = (file: WorkspaceFilePreview) => file.path === filePath
        ? { ...file, ...saved, content: saved.content ?? file.content }
        : file;
      openFilesRef.current = openFilesRef.current.map(updateFile);
      setOpenFiles(openFilesRef.current);
      setSelectedFile((current) => current ? updateFile(current) : current);
      setArtifactConflicts((current) => withoutKey(current, filePath));
    } catch (error) {
      setArtifactErrors((current) => ({ ...current, [filePath]: error instanceof Error ? error.message : String(error) }));
    } finally {
      setArtifactSavingPath(filePath, false);
    }
  }

  async function reloadArtifact(filePath: string) {
    try {
      const file = await desktopBridge.readWorkspaceFile(executionWorkspace, filePath);
      const draft = createArtifactDraft(file);
      const nextDrafts = { ...artifactDraftsRef.current };
      if (draft) nextDrafts[filePath] = draft;
      else delete nextDrafts[filePath];
      setDrafts(nextDrafts);
      openFilesRef.current = openFilesRef.current.map((candidate) => candidate.path === filePath ? file : candidate);
      setOpenFiles(openFilesRef.current);
      setSelectedFile((current) => current?.path === filePath ? file : current);
      setArtifactConflicts((current) => withoutKey(current, filePath));
      setArtifactErrors((current) => withoutKey(current, filePath));
    } catch (error) {
      setArtifactErrors((current) => ({ ...current, [filePath]: error instanceof Error ? error.message : String(error) }));
    }
  }

  function dismissArtifactConflict(filePath: string) {
    const onDisk = artifactConflicts[filePath];
    const draft = artifactDraftsRef.current[filePath];
    if (draft && onDisk !== undefined) {
      setDrafts({ ...artifactDraftsRef.current, [filePath]: { ...draft, savedContent: onDisk } });
    }
    setArtifactConflicts((current) => withoutKey(current, filePath));
  }

  function addArtifactComment(comment: ArtifactComment) {
    setComposerRequest({ id: crypto.randomUUID(), text: formatArtifactComment(comment) });
    setMainSection("chat");
  }

  async function createArtifact() {
    const name = artifactName.trim();
    if (!name) return;
    const normalizedName = name.endsWith(".md") ? name : `${name}.md`;
    await desktopBridge.writeWorkspaceFile(executionWorkspace, normalizedName, `# ${normalizedName.split("/").at(-1)?.replace(/\.md$/, "")}\n\n`);
    setArtifactName("");
    setModal(null);
    await refreshWorkspaceFiles();
    await openArtifact(normalizedName);
  }

  function addEvidence(title = evidenceTitle, url = evidenceUrl) {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    setPapers((current) => [...current, { title: trimmedTitle, meta: url.trim() || "Manually added source", score: "New" }]);
    setEvidenceTitle("");
    setEvidenceUrl("");
    setModal(null);
  }

  function clearThreadPendingAction() {
    const threadId = activeThreadIdRef.current;
    if (!threadId) return;
    setThreads((current) => current.map((thread) => thread.id === threadId ? { ...thread, pending_actions: Math.max(0, (thread.pending_actions ?? 0) - 1) } : thread));
  }

  async function approvePendingAction() {
    const action = pendingAction;
    if (!action) return;
    try {
      if (action.source === "agent") await desktopBridge.approveAgentAction(action.id);
      setPendingAction(null);
      clearThreadPendingAction();
      if (action.kind === "command" && action.payload.command) {
        await runCommand(action.payload.command, action.id);
      } else if (action.kind === "write" && action.payload.path) {
        await refreshWorkspaceFiles();
      }
    } catch (error) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: `Could not approve this action: ${String(error)}` }]);
    }
  }

  function reviewPendingAction() {
    requestAnimationFrame(() => {
      document.querySelector(".approval-card")?.scrollIntoView({ block: "center", behavior: "smooth" });
    });
  }

  async function rejectPendingAction() {
    const action = pendingAction;
    if (!action) return;
    if (action.source === "agent") await desktopBridge.rejectAgentAction(action.id);
    setPendingAction(null);
    clearThreadPendingAction();
  }

  function openWelcomeWorkflow(action: ResearchWelcomeAction) {
    if (action === "idea") {
      setResearchMode("idea-spark");
      return;
    }
    if (action === "replication") {
      setMainSection("writing");
      return;
    }
    if (action === "literature") {
      setDailyStartMode("latest");
      setMainSection("daily");
      return;
    }
    setImageCreationOpened(true);
    setMainSection("image-creation");
  }

  const dirtyArtifactPaths = useMemo(() => new Set(Object.values(artifactDrafts).filter(isDraftDirty).map((draft) => draft.path)), [artifactDrafts]);
  const mainTitle = mainSection === "chat" ? activeThread?.title ?? t("New research task") : mainSection === "extensions" ? t("Extensions") : mainSection === "library" ? t("Library") : mainSection === "daily" ? t("Daily papers") : mainSection === "benchmark-radar" ? t("Benchmark Radar") : mainSection === "image-creation" ? t("Image creation") : mainSection === "writing" ? t("Paper writing") : t("Artifacts");
  const mainSubtitle = mainSection === "image-creation" ? t("Generate and remix research figures") : mainSection === "writing" ? t("LaTeX workspace") : mainSection === "daily" ? t("Live research feed") : mainSection === "benchmark-radar" ? t("Benchmark intelligence") : workspaceReady ? t("Local · {folder}", { folder: executionWorkspaceName || t("Workspace") }) : t("Opening workspace");
  const moduleCommands: PaletteCommand[] = (["knowledge", "create"] as const).flatMap((section) =>
    sidebarEntries(section)
      .filter((entry) => !entry.disabled)
      .map((entry) => ({
        id: entry.commandId,
        group: t(section === "knowledge" ? "Knowledge" : "Create"),
        label: t(entry.labelKey),
        icon: entry.icon,
        run: () => activateSidebarEntry(entry),
      })),
  );
  const paletteCommands: PaletteCommand[] = [
    { id: "new-research", group: t("Work"), label: t("New research task"), detail: t("Start a chat in the current project"), shortcut: "Ctrl N", icon: <Plus size={15} />, run: () => startNewTask() },
    { id: "new-project", group: t("Work"), label: t("New project"), detail: t("Bind a folder for related chats"), icon: <FolderOpen size={15} />, run: openNewProject },
    { id: "open-chat", group: t("Work"), label: t("Open current chat"), icon: <MessageCircle size={15} />, run: () => setMainSection("chat") },
    ...moduleCommands,
    { id: "extensions-skills", group: t("Extensions"), label: t("Skills"), icon: <Puzzle size={15} />, run: () => { setExtensionsTab("skills"); setMainSection("extensions"); } },
    { id: "extensions-mcp", group: t("Extensions"), label: t("MCP servers"), icon: <Puzzle size={15} />, run: () => { setExtensionsTab("mcp"); setMainSection("extensions"); } },
    { id: "extensions-plugins", group: t("Extensions"), label: t("Plugins"), icon: <Puzzle size={15} />, run: () => { setExtensionsTab("plugins"); setMainSection("extensions"); } },
    { id: "files", group: t("Panels"), label: t("Files"), detail: t("Open the workbench file browser"), icon: <FolderOpen size={15} />, run: () => openWorkbench("files") },
    { id: "terminal", group: t("Panels"), label: t("Terminal"), detail: executionWorkspace, icon: <SquareTerminal size={15} />, run: () => openWorkbench("terminal") },
    { id: "journey", group: t("Panels"), label: t("Journey"), icon: <Flag size={15} />, run: () => openWorkbench("journey") },
    { id: "reveal-folder", group: t("System"), label: t("Show working folder"), detail: executionWorkspace, icon: <FolderOpen size={15} />, run: () => void desktopBridge.revealWorkspace?.(executionWorkspace).catch(() => undefined) },
    { id: "settings", group: t("System"), label: t("Settings"), shortcut: "Ctrl ,", icon: <Settings size={15} />, run: () => { setSettingsSection("general"); setSettingsOpen(true); } },
    { id: "toggle-sidebar", group: t("System"), label: sidebarHidden ? t("Show sidebar") : t("Hide sidebar"), icon: <PanelLeftOpen size={15} />, run: () => setSidebarHidden((hidden) => !hidden) },
  ];

  return (
    <main className={`codex-shell theme-${theme}${sidebarHidden ? " sidebar-hidden" : ""}`} style={{ "--sidebar-width": `${sidebarWidth}px` } as React.CSSProperties}>
      <aside className="codex-sidebar" aria-label={t("Archimedes navigation")} data-ui="application-navigation" inert={sidebarHidden}>
        <div className="codex-brand">
          <ArchimedesMark className="codex-brand-symbol" size={24} variant="small" />
          <ArchimedesWordmark className="codex-brand-wordmark" />
          <button className="sidebar-search-button" onClick={() => setPaletteOpen(true)} title={`${t("Search or run a command")} (Ctrl K)`} aria-label={t("Search or run a command")}><Search size={15} /></button>
          <button className="sidebar-collapse-button" onClick={() => setSidebarHidden(true)} title={t("Hide sidebar")} aria-label={t("Hide sidebar")}><PanelLeftClose size={16} /></button>
        </div>

        <button className="new-task-button" onClick={() => startNewTask()} title={t("New research task")} disabled={agentBusy}>
          <Plus size={17} />
          <span>{t("New research")}</span>
        </button>

        <nav className="sidebar-nav sidebar-modules" aria-label={t("Primary")}>
          {(["knowledge", "create"] as const).map((section) => <section className={`sidebar-group ${section}-group`} key={section}>
            <div className="codex-sidebar-label">{t(section === "knowledge" ? "Knowledge" : "Create")}</div>
            {sidebarEntries(section).map((entry) => <button className={mainSection === entry.destination.section ? "codex-nav-item active" : "codex-nav-item"} key={entry.id} onClick={() => activateSidebarEntry(entry)} title={t(entry.labelKey)} disabled={entry.disabled}>
              {entry.icon}<span>{t(entry.labelKey)}</span>{entry.badge && <span className="nav-tail">{t(entry.badge)}</span>}
            </button>)}
          </section>)}
        </nav>

        <ProjectSidebar
          projects={projects}
          archivedProjects={archivedProjects}
          threads={threads}
          archivedThreads={archivedThreads}
          activeProjectId={activeProjectId}
          activeThreadId={activeThreadId}
          runningThreadId={runningThreadId}
          disabled={agentBusy}
          onNewProject={openNewProject}
          onNewChat={(projectId) => startNewTask(projectId)}
          onRenameProject={(projectId, name) => renameProject(projectId, name)}
          onArchiveProject={(project, archived) => void archiveProject(project, archived)}
          onRemoveProject={setProjectToRemove}
          onChangeProjectWorkspace={(project) => void changeProjectWorkspace(project)}
          onOpenThread={(thread) => void openResearchThread(thread)}
          onArchiveThread={(thread, archived) => void archiveThread(thread, archived)}
          onRemoveThread={(thread) => { setThreadRemoveError(""); setThreadToRemove(thread); }}
          filterError={projectFolderError}
        />

        <div className="sidebar-runtime">
          <div className="runtime-tabs" role="group" aria-label={t("Runtime location")}>
            <button className="runtime-tab active" aria-pressed="true">{t("Local")}</button>
            <button className="runtime-tab coming" aria-pressed="false" disabled title={t("Coming in a later update")}>{t("Cloud")}<span>{t("Soon")}</span></button>
          </div>
          <button className="sidebar-settings-button" onClick={() => { setSettingsSection("general"); setSettingsOpen(true); }} title={t("Settings")} aria-label={t("Settings")}><Settings size={15} strokeWidth={1.7} /></button>
        </div>
        <div className="sidebar-resizer" role="separator" aria-orientation="vertical" aria-label="Resize sidebar" aria-valuemin={SIDEBAR_MIN_WIDTH} aria-valuemax={SIDEBAR_MAX_WIDTH} aria-valuenow={sidebarWidth} tabIndex={0} onPointerDown={beginSidebarResize} onPointerMove={moveSidebarResize} onPointerUp={endSidebarResize} onPointerCancel={endSidebarResize} onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)} onKeyDown={handleSidebarResizeKey} />
      </aside>

      <section className={workbenchOpen ? "codex-main workbench-open" : "codex-main"} style={{ "--workbench-width": workbenchOpen ? `${workbenchWidth}px` : "0px" } as React.CSSProperties}>
        <header className="main-toolbar" data-ui="application-toolbar">
          {sidebarHidden && <button className="quiet-icon-button sidebar-restore-button" onClick={() => setSidebarHidden(false)} title={t("Show sidebar")} aria-label={t("Show sidebar")} aria-pressed={sidebarHidden}><PanelLeftOpen size={17} /></button>}
          <div className="conversation-title"><strong>{mainTitle}</strong><span>{mainSubtitle}</span></div>
          <div className="main-toolbar-actions">
            <div id="module-toolbar-actions" className="module-toolbar-actions" />
            <button className={workbenchOpen ? "quiet-icon-button active" : "quiet-icon-button"} onClick={toggleWorkbench} title={workbenchOpen ? `${t("Hide workbench")} (Ctrl+\`)` : `${t("Show workbench")} (Ctrl+\`)`} aria-label={workbenchOpen ? t("Hide workbench") : t("Show workbench")} aria-pressed={workbenchOpen}>
              <PanelRight size={18} />
            </button>
          </div>
        </header>

        <div className="main-workspace" ref={mainWorkspaceRef}>
        <div className={mainSection === "chat" ? "main-view chat-main" : "main-view knowledge-main"}>
          {mainSection === "chat" && (
            <ConversationView
              key={activeThreadId ?? `new:${chatViewNonce}`}
              messages={messages}
              events={events}
              trajectoryEvents={trajectoryEvents}
              workspace={executionWorkspace}
              agentBusy={agentBusy}
              interrupting={interrupting}
              pendingAction={pendingAction}
              changeSets={changeSets}
              onSubmit={(draft, routedMode, effort, selectedContextLength) => void submitPrompt(draft, routedMode, effort, selectedContextLength)}
              onInterrupt={() => void interruptResearchTurn()}
              canInterrupt={Boolean(runningThreadId) && !interrupting}
              researchMode={researchMode}
              onResearchMode={setResearchMode}
              reasoningEffort={reasoningEffort}
              onReasoningEffort={setReasoningEffort}
              contextLength={contextLength}
              onContextLength={setContextLength}
              modelCapabilities={modelCapabilities}
              contextItems={contextItems}
              onAddContext={(added) => setContextItems((current) => [...current, ...added.filter((item) => !current.some((candidate) => candidate.id === item.id))].slice(0, 12))}
              onRemoveContext={(id) => setContextItems((current) => current.filter((item) => item.id !== id))}
              onApprove={() => void approvePendingAction()}
              onReject={() => void rejectPendingAction()}
              onOpenFile={openChangedFile}
              showWelcome={activeThreadId === null && messages.length === 1 && messages[0]?.id === "welcome" && !agentBusy}
              onWelcomeAction={openWelcomeWorkflow}
              composerRequest={composerRequest}
              onComposerRequestApplied={(id) => setComposerRequest((current) => current?.id === id ? null : current)}
            />
          )}
          <div className={mainSection === "library" ? "library-view-cache" : "library-view-cache hidden"} aria-hidden={mainSection !== "library"}>
            {workspaceReady && <LibraryView key={workspace} bridge={desktopBridge} mode="library" active={mainSection === "library"} workspace={workspace} projectId={activeProjectId} libraryRefreshVersion={libraryRefreshVersion} onAgentRun={(result) => setThreads((current) => [result.thread, ...current.filter((thread) => thread.id !== result.threadId)])} onInternalReviewThreadsDeleted={(threadIds) => setThreads((current) => current.filter((thread) => !threadIds.includes(thread.id)))} />}
          </div>
          {mainSection === "daily" && workspaceReady && <LibraryView key={dailyStartMode} bridge={desktopBridge} mode="daily" active={mainSection === "daily"} initialDailyMode={dailyStartMode} workspace={workspace} projectId={activeProjectId} onLibraryImported={() => setLibraryRefreshVersion((version) => version + 1)} onAgentRun={(result) => setThreads((current) => [result.thread, ...current.filter((thread) => thread.id !== result.threadId)])} onInternalReviewThreadsDeleted={(threadIds) => setThreads((current) => current.filter((thread) => !threadIds.includes(thread.id)))} />}
          {mainSection === "benchmark-radar" && <BenchmarkRadarView />}
          {imageCreationOpened && <div className={mainSection === "image-creation" ? "image-creation-view-cache" : "image-creation-view-cache hidden"} aria-hidden={mainSection !== "image-creation"}><ImageCreationView active={mainSection === "image-creation"} onBrowseProceedings={() => { setDailyStartMode("conference"); setMainSection("daily"); }} /></div>}
          {mainSection === "extensions" && <ExtensionsView bridge={desktopBridge} workspace={executionWorkspace} tab={extensionsTab} onTabChange={setExtensionsTab} attachedIds={new Set(contextItems.map((item) => item.id))} onAttach={(item) => setContextItems((current) => current.some((candidate) => candidate.id === item.id) ? current : [...current, item].slice(0, 12))} />}
          {mainSection === "artifacts" && (
            <ArtifactsView workspace={executionWorkspace} tree={fileTree} openFiles={openFiles} selectedPath={selectedFilePath} file={selectedFile} loading={fileLoading} error={fileError} loadingDirectories={loadingDirectories} drafts={artifactDrafts} dirtyFiles={dirtyArtifactPaths} savingFiles={artifactSaving} conflicts={artifactConflicts} saveErrors={artifactErrors} onOpenFile={(filePath) => void openArtifact(filePath, "page")} onSelectOpenFile={(file) => selectOpenArtifact(file, "page")} onCloseFile={closeArtifact} onLoadDirectory={(directory) => void loadWorkspaceDirectory(directory)} onRefresh={() => void refreshWorkspaceFiles()} onNewArtifact={() => setModal("artifact")} onDraftChange={updateArtifactDraft} onSave={(filePath) => void saveArtifact(filePath)} onReload={(filePath) => void reloadArtifact(filePath)} onDismissConflict={dismissArtifactConflict} onAddComment={addArtifactComment} />
          )}
          <div className={mainSection === "writing" ? "paper-writing-view-cache" : "paper-writing-view-cache hidden"} aria-hidden={mainSection !== "writing"}>
            {workspaceReady && <PaperWritingView bridge={desktopBridge} workspace={executionWorkspace} openRequest={paperOpenRequest} onRefresh={refreshWorkspaceFiles} onAskAI={askAIAboutPaper} />}
          </div>
        </div>
        </div>
        <RightWorkbench
          bridge={desktopBridge}
          open={workbenchOpen}
          theme={theme}
          workspace={executionWorkspace}
          width={workbenchWidth}
          activeTab={workbenchTab}
          terminalSettings={terminalSettings}
          dirtyFileCount={dirtyArtifactPaths.size}
          onTabChange={setWorkbenchTab}
          onWidthChange={(width) => setWorkbenchWidth(clampWorkbenchWidth(width))}
          onOpenTerminalSettings={() => { setSettingsSection("terminal"); setSettingsOpen(true); }}
          journey={<JourneyView
            bridge={desktopBridge}
            thread={activeThread ?? null}
            events={trajectoryEvents}
            modeLabel={researchModes.find((mode) => mode.id === researchMode)?.label ?? researchMode}
            settings={journeySettings}
            pendingAction={pendingAction}
            agentBusy={agentBusy && Boolean(activeThreadId) && runningThreadId === activeThreadId}
            active={workbenchOpen && workbenchTab === "journey"}
            onOpenTrajectory={() => openTrajectoryAt()}
            onOpenTrajectoryAt={openTrajectoryAt}
            onOpenSettings={() => { setSettingsSection("journey"); setSettingsOpen(true); }}
            onReviewPending={reviewPendingAction}
          />}
          trajectory={<TrajectoryView
            thread={activeThread ?? null}
            events={trajectoryEvents}
            provider={activeModelConfig?.provider}
            model={activeModelConfig?.model}
            modeLabel={researchModes.find((mode) => mode.id === researchMode)?.label ?? researchMode}
            onCopy={(text) => desktopBridge.writeClipboardText(text)}
            onOpenJourney={() => setWorkbenchTab("journey")}
            focusSequence={trajectoryFocusSequence}
            onFocusApplied={() => setTrajectoryFocusSequence(null)}
          />}
          files={<ArtifactsView
            compact
            compactWidth={workbenchWidth}
            workspace={executionWorkspace}
            tree={fileTree}
            openFiles={openFiles}
            selectedPath={selectedFilePath}
            file={selectedFile}
            loading={fileLoading}
            error={fileError}
            loadingDirectories={loadingDirectories}
            drafts={artifactDrafts}
            dirtyFiles={dirtyArtifactPaths}
            savingFiles={artifactSaving}
            conflicts={artifactConflicts}
            saveErrors={artifactErrors}
            onOpenFile={(filePath) => void openArtifact(filePath)}
            onSelectOpenFile={(file) => selectOpenArtifact(file)}
            onCloseFile={closeArtifact}
            onLoadDirectory={(directory) => void loadWorkspaceDirectory(directory)}
            onRefresh={() => void refreshWorkspaceFiles()}
            onNewArtifact={() => setModal("artifact")}
            onDraftChange={updateArtifactDraft}
            onSave={(filePath) => void saveArtifact(filePath)}
            onReload={(filePath) => void reloadArtifact(filePath)}
            onDismissConflict={dismissArtifactConflict}
            onAddComment={addArtifactComment}
            onOpenFull={() => { setMainSection("artifacts"); setWorkbenchOpen(false); }}
          />}
        />
      </section>

      <WorkspaceModal
        modal={modal ?? (selectedSource ? "source" : null)}
        artifactName={artifactName}
        evidenceTitle={evidenceTitle}
        evidenceUrl={evidenceUrl}
        searchQuery={searchQuery}
        selectedSource={selectedSource}
        onArtifactName={setArtifactName}
        onEvidenceTitle={setEvidenceTitle}
        onEvidenceUrl={setEvidenceUrl}
        onSearchQuery={setSearchQuery}
        onClose={() => { setModal(null); setSelectedSource(""); }}
        onCreateArtifact={() => void createArtifact()}
        onAddEvidence={addEvidence}
      />
      <TerminalSettingsModal open={terminalSettingsOpen && terminalSettingsMode === "onboarding"} mode="onboarding" settings={terminalSettings} workspace={executionWorkspace} onClose={closeTerminalSettings} onSave={saveTerminalSettings} onOpenExternal={openExternalTerminal} />
      <SettingsModal
        open={settingsOpen}
        section={settingsSection}
        onSectionChange={setSettingsSection}
        onClose={() => setSettingsOpen(false)}
        themePreference={themePreference}
        systemAppearance={systemAppearance}
        onThemePreferenceChange={setThemePreference}
        bridge={desktopBridge}
        onModelSaved={setActiveModelConfig}
        workspace={workspace}
        workspaceReady={workspaceReady}
        agentBusy={agentBusy}
        onChooseWorkspace={() => void chooseWorkspace()}
        journeySettings={journeySettings}
        onSaveJourneySettings={saveJourneySettings}
        onResetJourneySettings={resetJourneySettings}
        onOpenModels={() => setSettingsSection("models")}
        terminalSettings={terminalSettings}
        onSaveTerminalSettings={saveTerminalSettings}
        onOpenExternalTerminal={openExternalTerminal}
      />
      <NewProjectModal
        open={newProjectOpen}
        name={newProjectName}
        onName={setNewProjectName}
        workspacePath={newProjectWorkspace}
        onWorkspacePath={setNewProjectWorkspace}
        onChooseFolder={() => void chooseNewProjectFolder()}
        onClose={() => { setNewProjectOpen(false); setNewProjectName(""); setNewProjectError(""); }}
        onCreate={() => void createProject()}
        error={newProjectError}
      />
      <CommandPalette open={paletteOpen} commands={paletteCommands} onClose={() => setPaletteOpen(false)} />
      <ProjectRemoveModal project={projectToRemove} onClose={() => setProjectToRemove(null)} onRemove={() => projectToRemove && void removeProject(projectToRemove)} />
      <ThreadRemoveModal thread={threadToRemove} error={threadRemoveError} onClose={() => { setThreadRemoveError(""); setThreadToRemove(null); }} onRemove={() => threadToRemove && void removeThread(threadToRemove)} />
    </main>
  );
}

function ConversationView({ messages, events, trajectoryEvents, workspace, agentBusy, interrupting, canInterrupt, pendingAction, changeSets, researchMode, reasoningEffort, contextLength, modelCapabilities, contextItems, onSubmit, onInterrupt, onResearchMode, onReasoningEffort, onContextLength, onAddContext, onRemoveContext, onApprove, onReject, onOpenFile, showWelcome, onWelcomeAction, composerRequest, onComposerRequestApplied }: {
  messages: Message[];
  events: TimelineEvent[];
  trajectoryEvents: ResearchEvent[];
  workspace: string;
  agentBusy: boolean;
  interrupting: boolean;
  canInterrupt: boolean;
  pendingAction: PendingAction | null;
  changeSets: WorkspaceChangeSet[];
  researchMode: ResearchMode;
  reasoningEffort: ReasoningEffort;
  contextLength: ContextLength;
  modelCapabilities: ModelCapabilities;
  contextItems: ContextAttachment[];
  onSubmit: (draft: string, mode: ResearchMode, reasoningEffort: ReasoningEffort, contextLength: ContextLength) => void;
  onInterrupt: () => void;
  onResearchMode: (mode: ResearchMode) => void;
  onReasoningEffort: (effort: ReasoningEffort) => void;
  onContextLength: (length: ContextLength) => void;
  onAddContext: (items: ContextAttachment[]) => void;
  onRemoveContext: (id: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onOpenFile: (filePath: string) => void;
  showWelcome: boolean;
  onWelcomeAction: (action: ResearchWelcomeAction) => void;
  composerRequest: { id: string; text: string } | null;
  onComposerRequestApplied: (id: string) => void;
}) {
  const activeMode = researchModes.find((mode) => mode.id === researchMode) ?? researchModes[0];
  const [reasoningMenuOpen, setReasoningMenuOpen] = useState(false);
  const [contextLengthMenuOpen, setContextLengthMenuOpen] = useState(false);
  const [acceptedStages, setAcceptedStages] = useState<ResearchStageId[]>(() => {
    const activeIndex = Math.max(0, researchStages.findIndex((stage) => stage.mode === researchMode));
    return researchStages.slice(0, activeIndex).map((stage) => stage.id);
  });
  const [staleStages, setStaleStages] = useState<ResearchStageId[]>([]);
  const [selectedStage, setSelectedStage] = useState<ResearchStageId | null>(null);
  const [branchCount, setBranchCount] = useState(1);
  const [journeyNotice, setJourneyNotice] = useState("");
  const [composerMenu, setComposerMenu] = useState<{ x: number; y: number } | null>(null);
  const [composerError, setComposerError] = useState("");
  const [prompt, setPrompt] = useState("");
  const [historyStart, setHistoryStart] = useState(() => Math.max(0, messages.length - INITIAL_VISIBLE_MESSAGE_COUNT));
  const reasoningMenuRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const appliedComposerRequestRef = useRef<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followOutputRef = useRef(true);
  const [followingOutput, setFollowingOutput] = useState(true);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const welcomeVisible = showWelcome && !welcomeDismissed;

  useEffect(() => {
    if (!composerRequest || appliedComposerRequestRef.current === composerRequest.id) return;
    appliedComposerRequestRef.current = composerRequest.id;
    setPrompt((current) => current.trim() ? `${current.trim()}\n\n${composerRequest.text}` : composerRequest.text);
    onComposerRequestApplied(composerRequest.id);
    requestAnimationFrame(() => composerRef.current?.focus());
  }, [composerRequest, onComposerRequestApplied]);

  const activeStage = stageForMode(researchMode);
  const predictedMode = inferResearchMode(prompt, researchMode);
  const visibleMessages = messages.slice(historyStart);
  const hiddenMessageCount = historyStart;
  const lastUserIndex = visibleMessages.reduce((last, message, index) => message.role === "user" ? index : last, -1);
  const messageContextCharacters = useMemo(
    () => messages.reduce((total, message) => total + message.text.length, 0),
    [messages],
  );
  const attachedContextCharacters = useMemo(
    () => contextItems.reduce((total, item) => total + estimateAttachmentContextCharacters(item), 0),
    [contextItems],
  );
  const contextCharacterLimit = modelCapabilities.contextCharacterLimits[contextLength] || 300_000;
  const estimatedContextCharacters = Math.min(
    contextCharacterLimit,
    CONTEXT_INSTRUCTION_OVERHEAD_CHARS + messageContextCharacters + attachedContextCharacters + prompt.length,
  );
  const contextUsage = estimatedContextCharacters / contextCharacterLimit;
  const contextUsageState = contextUsage >= 0.9 ? "critical" : contextUsage >= 0.7 ? "warning" : "normal";
  const contextUsageTitle = `Estimated context usage: ${estimatedContextCharacters.toLocaleString()} of ${contextCharacterLimit.toLocaleString()} characters (${Math.round(contextUsage * 100)}%). Includes chat, draft, and attachment metadata; the final request can differ after automatic context compaction.`;
  const contextUsageLabel = `${Math.round(contextUsage * 100)}%`;
  const availableThinkingEfforts = reasoningEfforts.filter((effort) => modelCapabilities.thinkingEfforts.includes(effort.id));
  const availableContextLengths = contextLengths.filter((length) => modelCapabilities.contextLengths.includes(length.id));

  const scrollToLatest = () => {
    const container = scrollRef.current;
    if (!container) return;
    container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
  };

  const updateFollowState = () => {
    const container = scrollRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 56;
    if (followOutputRef.current !== isNearBottom) {
      followOutputRef.current = isNearBottom;
      setFollowingOutput(isNearBottom);
    }
  };

  useEffect(() => {
    if (welcomeVisible) {
      followOutputRef.current = true;
      setFollowingOutput(true);
      const frame = requestAnimationFrame(() => scrollRef.current?.scrollTo({ top: 0, behavior: "auto" }));
      return () => cancelAnimationFrame(frame);
    }
    if (!followOutputRef.current) return;
    const frame = requestAnimationFrame(scrollToLatest);
    return () => cancelAnimationFrame(frame);
  }, [messages, agentBusy, pendingAction, changeSets, welcomeVisible]);

  useEffect(() => {
    setHistoryStart((current) => Math.min(current, Math.max(0, messages.length - INITIAL_VISIBLE_MESSAGE_COUNT)));
  }, [messages.length]);

  useEffect(() => {
    if (!reasoningMenuOpen) return;
    const closeMenu = (event: MouseEvent) => {
      if (!reasoningMenuRef.current?.contains(event.target as Node)) {
        setReasoningMenuOpen(false);
        setContextLengthMenuOpen(false);
      }
    };
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, [reasoningMenuOpen]);

  useEffect(() => {
    const closeMenu = () => setComposerMenu(null);
    document.addEventListener("click", closeMenu);
    return () => document.removeEventListener("click", closeMenu);
  }, []);

  async function attachPastedImage(blob: Blob) {
    if (contextItems.filter((item) => item.type === "image").length >= 4) {
      setComposerError("You can attach up to four pasted images in one message.");
      return;
    }
    try {
      const image = await contextImageFromBlob(blob);
      onAddContext([image]);
      setComposerError("");
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "The pasted image could not be attached.");
    }
  }

  function insertClipboardText(text: string) {
    const textarea = composerRef.current;
    if (!textarea || !text) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    setPrompt(`${prompt.slice(0, start)}${text}${prompt.slice(end)}`);
    requestAnimationFrame(() => {
      textarea.focus();
      const cursor = start + text.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  async function pasteFromSystemClipboard() {
    setComposerMenu(null);
    try {
      const image = await desktopBridge.readClipboardImage();
      if (image) {
        if (contextItems.filter((item) => item.type === "image").length >= 4) {
          setComposerError("You can attach up to four pasted images in one message.");
          return;
        }
        onAddContext([contextImageFromData(image)]);
        setComposerError("");
        return;
      }
      insertClipboardText(await desktopBridge.readClipboardText());
      setComposerError("");
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "Nothing compatible was found on the clipboard.");
    }
  }

  async function copySelection(cut = false) {
    const textarea = composerRef.current;
    if (!textarea || textarea.selectionStart === textarea.selectionEnd) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    try {
      await desktopBridge.writeClipboardText(prompt.slice(start, end));
      if (cut) {
        setPrompt(`${prompt.slice(0, start)}${prompt.slice(end)}`);
        requestAnimationFrame(() => { textarea.focus(); textarea.setSelectionRange(start, start); });
      }
      setComposerError("");
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "The selected text could not be copied.");
    } finally {
      setComposerMenu(null);
    }
  }

  function handleComposerPaste(event: ReactClipboardEvent<HTMLTextAreaElement>) {
    const item = Array.from(event.clipboardData.items).find((candidate) => candidate.type.startsWith("image/"));
    const image = item?.getAsFile();
    if (!image) return;
    event.preventDefault();
    void attachPastedImage(image);
  }

  function submitCurrentPrompt() {
    if (agentBusy || (!prompt.trim() && !contextItems.some((item) => item.type === "image"))) return;
    const draft = prompt;
    setPrompt("");
    onResearchMode(predictedMode);
    setSelectedStage(null);
    setJourneyNotice("");
    onSubmit(draft, predictedMode, reasoningEffort, contextLength);
  }

  function acceptCurrentCheckpoint() {
    const currentIndex = researchStages.findIndex((stage) => stage.id === activeStage.id);
    const nextStage = researchStages[currentIndex + 1];
    setAcceptedStages((current) => current.includes(activeStage.id) ? current : [...current, activeStage.id]);
    setStaleStages((current) => current.filter((id) => id !== activeStage.id));
    setJourneyNotice(`${activeStage.checkpoint} accepted${nextStage ? `. Archimedes will route new work toward ${nextStage.label}.` : ". Research cycle complete."}`);
    setSelectedStage(null);
    if (nextStage) onResearchMode(nextStage.mode);
  }

  function requestCheckpointChanges() {
    setPrompt(`Revise the current ${activeStage.checkpoint.toLowerCase()}. Preserve the accepted evidence, explain what changed, and prepare a new checkpoint for review.`);
    setSelectedStage(null);
    requestAnimationFrame(() => composerRef.current?.focus());
  }

  function branchFromCheckpoint() {
    const nextBranch = branchCount + 1;
    setBranchCount(nextBranch);
    setJourneyNotice(`Created branch B${nextBranch} from ${activeStage.label}. The accepted branch remains available.`);
    setSelectedStage(null);
  }

  function returnToStage(stage: ResearchStage) {
    const targetIndex = researchStages.findIndex((candidate) => candidate.id === stage.id);
    const downstream = researchStages.slice(targetIndex + 1).map((candidate) => candidate.id);
    setStaleStages((current) => Array.from(new Set([...current, ...downstream.filter((id) => acceptedStages.includes(id))])));
    setJourneyNotice(`Returned to ${stage.label}. Downstream accepted work is preserved and marked stale until revalidated.`);
    setSelectedStage(null);
    onResearchMode(stage.mode);
  }

  function selectWelcomeWorkflow(action: ResearchWelcomeAction) {
    onWelcomeAction(action);
    if (action === "idea") {
      setWelcomeDismissed(true);
      requestAnimationFrame(() => composerRef.current?.focus());
    }
  }

  return <div className={welcomeVisible ? "conversation-layout has-welcome" : "conversation-layout has-journey"}>
    {!welcomeVisible && <section className="research-journey" aria-label="Research progress">
      <header className="research-journey-header">
        <div><span>Research path</span><strong>AI routed · {activeStage.label}</strong></div>
        <div className="research-journey-actions">
          {journeyNotice && <span className="research-journey-notice">{journeyNotice}</span>}
          <button onClick={() => setSelectedStage((current) => current === activeStage.id ? null : activeStage.id)}><Flag size={13} />Review checkpoint</button>
        </div>
      </header>
      <div className="research-stage-track">
        {researchStages.map((stage, index) => {
          const accepted = acceptedStages.includes(stage.id);
          const stale = staleStages.includes(stage.id);
          const active = stage.id === activeStage.id;
          const status = stale ? "stale" : active ? agentBusy ? "running" : "active" : accepted ? "accepted" : "planned";
          return <div className="research-stage-segment" key={stage.id}>
            <button className={`research-stage ${status} ${selectedStage === stage.id ? "selected" : ""}`} onClick={() => setSelectedStage((current) => current === stage.id ? null : stage.id)} aria-current={active ? "step" : undefined}>
              <span className="research-stage-node">{accepted && !stale ? <Check size={12} /> : index + 1}</span>
              <span><strong>{stage.label}</strong><small>{stale ? "Needs revalidation" : accepted ? "Accepted" : active ? agentBusy ? "Running" : "Current focus" : "Planned"}</small></span>
            </button>
            {index < researchStages.length - 1 && <span className={`research-stage-line ${accepted && !stale ? "complete" : ""}`} />}
          </div>;
        })}
      </div>
      {selectedStage && (() => {
        const stage = researchStages.find((candidate) => candidate.id === selectedStage) ?? activeStage;
        const isActive = stage.id === activeStage.id;
        return <div className="research-checkpoint-panel">
          <div><span>{isActive ? "Next checkpoint" : stage.label}</span><strong>{stage.checkpoint}</strong><p>{stage.description}</p></div>
          <div className="research-checkpoint-actions">
            {isActive && <button className="journey-primary" onClick={acceptCurrentCheckpoint}><Check size={13} />Accept & advance</button>}
            {isActive && <button onClick={requestCheckpointChanges}><RefreshCw size={13} />Request changes</button>}
            {isActive && <button onClick={branchFromCheckpoint}><Blocks size={13} />Create branch</button>}
            {!isActive && <button onClick={() => returnToStage(stage)}><RefreshCw size={13} />Return here</button>}
          </div>
        </div>;
      })()}
    </section>}
    <div className="conversation-scroll-area">
    <div className="conversation-scroll" ref={scrollRef} onScroll={updateFollowState}>
      {welcomeVisible ? <ResearchWelcome onSelect={selectWelcomeWorkflow} /> : <div className="conversation-thread">
        {hiddenMessageCount > 0 && <button className="conversation-load-history" onClick={() => setHistoryStart((current) => Math.max(0, current - HISTORY_MESSAGE_PAGE_SIZE))}>
          Show {Math.min(HISTORY_MESSAGE_PAGE_SIZE, hiddenMessageCount)} earlier {Math.min(HISTORY_MESSAGE_PAGE_SIZE, hiddenMessageCount) === 1 ? "message" : "messages"}
        </button>}
        {visibleMessages.slice(0, lastUserIndex + 1).map((message) => <ConversationMessage key={message.id} message={message} streaming={agentBusy && message.id.endsWith(":stream")} />)}

        {lastUserIndex >= 0 && <ChatActivityTimeline events={events} rawEvents={trajectoryEvents} busy={agentBusy} interrupting={interrupting} />}

        {visibleMessages.slice(lastUserIndex + 1).map((message) => <ConversationMessage key={message.id} message={message} streaming={agentBusy && message.id.endsWith(":stream")} />)}

        {changeSets.map((changeSet) => <WorkspaceChangesCard key={changeSet.id} changeSet={changeSet} onOpenFile={onOpenFile} />)}

        {pendingAction && (
          <section className="conversation-approval">
            <div className="approval-icon">{pendingAction.kind === "write" ? <FileText size={16} /> : <SquareTerminal size={16} />}</div>
            <div className="approval-content">
              <span>{pendingAction.kind === "write" ? "File write requires approval" : "Command requires approval"}</span>
              <code>{pendingAction.kind === "write" ? pendingAction.payload.path : pendingAction.payload.command}</code>
              {pendingAction.payload.change && <div className="approval-diff-stats"><span>+{pendingAction.payload.change.additions}</span><span>-{pendingAction.payload.change.deletions}</span></div>}
              {pendingAction.kind === "write" && pendingAction.payload.content && <pre className="proposal-preview">{pendingAction.payload.content.slice(0, 260)}</pre>}
              <p>{pendingAction.kind === "write" ? "This will write a file inside the selected workspace." : "This will run in the selected workspace and record its output."}</p>
              <div className="approval-actions">
                <button className="secondary-button" onClick={onReject}><X size={14} />Dismiss</button>
                <button className="primary-button" onClick={onApprove}>{pendingAction.kind === "write" ? <Check size={14} /> : <Play size={14} />}{pendingAction.kind === "write" ? "Apply" : "Run"}</button>
              </div>
            </div>
          </section>
        )}
      </div>}
    </div>
    <TurnRail messages={visibleMessages} scrollRef={scrollRef} />
    {!followingOutput && <button className="conversation-jump-latest" onClick={() => {
      followOutputRef.current = true;
      setFollowingOutput(true);
      scrollToLatest();
    }} title="Jump to latest message">
      <ArrowDown size={15} />
      <span>Latest</span>
    </button>}
    </div>

    <div className="conversation-composer-wrap" data-ui="research-composer">
      <div className="conversation-composer">
        <textarea ref={composerRef} value={prompt} onChange={(event) => setPrompt(event.target.value)} onPaste={handleComposerPaste} onContextMenu={(event) => { event.preventDefault(); setComposerMenu({ x: event.clientX, y: event.clientY }); }} onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            submitCurrentPrompt();
          }
        }} placeholder={activeMode.placeholder} rows={3} />
        <ContextChips items={contextItems} onRemove={onRemoveContext} />
        {composerMenu && <div className="composer-context-menu" role="menu" style={{ left: composerMenu.x, top: composerMenu.y }} onClick={(event) => event.stopPropagation()}>
          <button role="menuitem" onClick={() => void copySelection(true)} disabled={composerRef.current?.selectionStart === composerRef.current?.selectionEnd}>Cut</button>
          <button role="menuitem" onClick={() => void copySelection()} disabled={composerRef.current?.selectionStart === composerRef.current?.selectionEnd}>Copy</button>
          <button role="menuitem" onClick={() => void pasteFromSystemClipboard()}>Paste</button>
        </div>}
        {composerError && <div className="composer-attachment-error" role="alert">{composerError}</div>}
        <div className="conversation-composer-footer">
          <ContextPicker bridge={desktopBridge} workspace={workspace} items={contextItems} onAdd={onAddContext} />
          <div className="reasoning-effort-picker" ref={reasoningMenuRef}>
            <button className={reasoningMenuOpen ? "composer-tool reasoning-trigger active" : "composer-tool reasoning-trigger"} onClick={() => { setReasoningMenuOpen((open) => !open); setContextLengthMenuOpen(false); }} title={availableThinkingEfforts.length ? `Thinking effort: ${reasoningEffort}` : "Thinking effort is not exposed by this model"} aria-haspopup="menu" aria-expanded={reasoningMenuOpen} disabled={!availableThinkingEfforts.length}>
              <span className={`reasoning-meter ${reasoningEffort}`} aria-hidden="true"><i /><i /><i /></span><span>Thinking effort · {availableThinkingEfforts.length ? reasoningEffort[0].toUpperCase() + reasoningEffort.slice(1) : "Unavailable"}</span><ChevronDown size={13} />
            </button>
            {reasoningMenuOpen && <div className="reasoning-effort-menu" role="menu" aria-label="Thinking effort">
              <div className="reasoning-effort-heading"><strong>Thinking effort</strong></div>
              {availableThinkingEfforts.map((effort) => <button key={effort.id} className={effort.id === reasoningEffort ? "reasoning-effort-option selected" : "reasoning-effort-option"} role="menuitemradio" aria-checked={effort.id === reasoningEffort} onClick={() => { onReasoningEffort(effort.id); setReasoningMenuOpen(false); }}>
                <span className="reasoning-effort-copy"><strong>{effort.label}</strong></span>
                <span className="reasoning-option-mark" aria-hidden="true" />
              </button>)}
              <div className="reasoning-settings-divider" />
              <button className={contextLengthMenuOpen ? "context-length-menu-trigger active" : "context-length-menu-trigger"} role="menuitem" aria-haspopup="menu" aria-expanded={contextLengthMenuOpen} onClick={() => setContextLengthMenuOpen((open) => !open)}>
                <span>Context length</span><span>{contextLength === "extra-long" ? "Extra Long" : "Standard"}</span><ChevronRight size={13} />
              </button>
              {contextLengthMenuOpen && <div className="context-length-menu-options" role="menu" aria-label="Context length">
                {availableContextLengths.map((length) => <button key={length.id} className={length.id === contextLength ? "reasoning-effort-option selected" : "reasoning-effort-option"} role="menuitemradio" aria-checked={length.id === contextLength} onClick={() => { onContextLength(length.id); setContextLengthMenuOpen(false); }}>
                  <span className="reasoning-effort-copy"><strong>{length.label}</strong></span>
                  <span className="reasoning-option-mark" aria-hidden="true" />
                </button>)}
              </div>}
            </div>}
          </div>
          <div className="composer-context"><ShieldCheck size={13} /><span>{workspace ? workspace.split("/").filter(Boolean).at(-1) : "No workspace"}</span></div>
          <div
            className={`context-usage ${contextUsageState}`}
            data-context-usage={contextUsageLabel}
            aria-label={contextUsageTitle}
            role="img"
          >
            <span
              className="context-usage-ring"
              style={{ "--context-usage-progress": `${Math.round(contextUsage * 1_000) / 10}%` } as React.CSSProperties}
              aria-hidden="true"
            />
          </div>
          <button className="conversation-send" onClick={agentBusy ? onInterrupt : submitCurrentPrompt} disabled={agentBusy ? !canInterrupt : !prompt.trim() && !contextItems.some((item) => item.type === "image")} title={agentBusy ? interrupting ? "Stopping task" : "Stop" : "Send"}>
            {agentBusy ? <Square size={14} fill="currentColor" /> : <SendHorizontal size={16} />}
          </button>
        </div>
      </div>
      <p className="composer-note">Archimedes can make mistakes. Review sources and workspace changes.</p>
    </div>
  </div>;
}

const ConversationMessage = memo(function ConversationMessage({ message, streaming }: { message: Message; streaming: boolean }) {
  return <article className={`conversation-message ${message.role}`} data-turn-id={message.role === "user" ? message.id : undefined}>
    <div className="conversation-message-copy">
      <div className="conversation-message-role">{message.role === "assistant" ? "Archimedes" : "You"}</div>
      {message.role === "assistant"
        ? streaming ? <StreamingMarkdownMessage content={message.text} /> : <MarkdownMessage content={message.text} />
        : <p>{message.text}</p>}
      {Boolean(message.sources?.length) && <div className="conversation-sources" aria-label="Sources read by Archimedes">
        {message.sources?.map((source, index) => <a key={`${source.url}:${source.startPage}:${index}`} href={source.startPage ? `${source.url}#page=${source.startPage}` : source.url} target="_blank" rel="noreferrer" title={[source.title, source.url, source.query && `Query: ${source.query}`, source.excerpt, source.retrievedAt && `Read: ${source.retrievedAt}`].filter(Boolean).join("\n\n")}>
          <FileText size={12} /><span>{source.startPage ? `${new URL(source.url).hostname} · pp. ${source.startPage}${source.endPage !== source.startPage ? `-${source.endPage}` : ""}` : source.title}</span>
        </a>)}
      </div>}
    </div>
  </article>;
});

const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  return <ReactMarkdown
    remarkPlugins={[remarkGfm, remarkMath]}
    rehypePlugins={[rehypeKatex]}
    components={{
      a: ({ children, ...props }) => <a {...props} target="_blank" rel="noreferrer">{children}</a>,
      code: ({ className, children, ...props }) => {
        const language = /language-([\w-]+)/.exec(className || "")?.[1];
        if (!language) return <code className={className} {...props}>{children}</code>;
        return <div className="code-block-shell">
          <CopyButton text={String(children).replace(/\n$/, "")} />
          <SyntaxHighlighter
            className="message-code-block"
            language={language}
            useInlineStyles={false}
            PreTag="div"
            customStyle={{ margin: 0, padding: "13px 15px", fontSize: "11px", lineHeight: 1.65 }}
            codeTagProps={{ style: { fontFamily: "var(--font-mono)" } }}
          >{String(children).replace(/\n$/, "")}</SyntaxHighlighter>
        </div>;
      },
    }}
  >{normalizeMathDelimiters(content)}</ReactMarkdown>;
});

const MarkdownMessage = memo(function MarkdownMessage({ content }: { content: string }) {
  return <div className="message-markdown">
    <MarkdownContent content={content} />
  </div>;
});

const StreamingMarkdownMessage = memo(function StreamingMarkdownMessage({ content }: { content: string }) {
  const blocks = splitStreamingMarkdownBlocks(content);
  return <div className="message-markdown streaming-markdown">
    {blocks.map((block, index) => <MarkdownContent key={index} content={block} />)}
  </div>;
});

function splitStreamingMarkdownBlocks(content: string) {
  const blocks: string[] = [];
  let current: string[] = [];
  let activeFence = "";
  let inDisplayMath = false;

  for (const line of content.split("\n")) {
    current.push(line);
    const fence = /^\s*(`{3,}|~{3,})/.exec(line)?.[1] || "";
    if (fence) {
      if (!activeFence) activeFence = fence[0];
      else if (activeFence === fence[0]) activeFence = "";
      continue;
    }
    if (!activeFence && (line.match(/\$\$/g)?.length ?? 0) % 2 === 1) inDisplayMath = !inDisplayMath;
    if (!activeFence && !inDisplayMath && !line.trim() && current.some((item) => item.trim())) {
      blocks.push(current.join("\n"));
      current = [];
    }
  }
  if (current.length) blocks.push(current.join("\n"));
  return blocks;
}

function normalizeMathDelimiters(markdownContent: string) {
  let activeFence = "";
  return markdownContent.split("\n").map((line) => {
    const fence = /^\s*(`{3,}|~{3,})/.exec(line)?.[1] || "";
    if (fence) {
      if (!activeFence) activeFence = fence[0];
      else if (fence[0] === activeFence) activeFence = "";
      return line;
    }
    if (activeFence) return line;
    return normalizeMathDelimitersInLine(line);
  }).join("\n");
}

function normalizeMathDelimitersInLine(line: string) {
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
    if (delimiter === "\\[" || delimiter === "\\]") {
      result += "$$";
      index += 2;
      continue;
    }
    if (delimiter === "\\(" || delimiter === "\\)") {
      result += "$";
      index += 2;
      continue;
    }
    result += line[index];
    index += 1;
  }
  return result;
}

const WorkspaceChangesCard = memo(function WorkspaceChangesCard({ changeSet, onOpenFile }: { changeSet: WorkspaceChangeSet; onOpenFile: (filePath: string) => void }) {
  const [expanded, setExpanded] = useState(changeSet.changes.length <= 4);
  const visible = expanded ? changeSet.changes : changeSet.changes.slice(0, 3);
  const additions = changeSet.changes.reduce((total, change) => total + change.additions, 0);
  const deletions = changeSet.changes.reduce((total, change) => total + change.deletions, 0);
  return <section className="workspace-change-card">
    <header>
      <span className="change-card-icon"><FileCode2 size={17} /></span>
      <div><strong>Edited {changeSet.changes.length} {changeSet.changes.length === 1 ? "file" : "files"}</strong><small><span>+{additions}</span><span>-{deletions}</span></small></div>
    </header>
    <div className="change-file-list">
      {visible.map((change) => <button key={change.path} disabled={change.status === "deleted"} onClick={() => onOpenFile(change.path)} title={change.status === "deleted" ? "Deleted file" : `Open ${change.path}`}>
        <span>{change.path}</span>
        <small className={`change-status ${change.status}`}>{change.status}</small>
        <em>+{change.additions}</em><i>-{change.deletions}</i>
      </button>)}
    </div>
    {changeSet.changes.length > 3 && <button className="change-card-expand" onClick={() => setExpanded((current) => !current)}>{expanded ? "Show less" : `Show ${changeSet.changes.length - 3} more`}<ChevronDown size={14} /></button>}
  </section>;
});

function workspaceFileIcon(entry: Pick<WorkspaceFileEntry, "type" | "kind">) {
  if (entry.type === "directory") return <Folder size={14} />;
  if (entry.kind === "pdf" || entry.kind === "markdown") return <FileText size={14} />;
  if (entry.kind === "image") return <FileImage size={14} />;
  if (entry.kind === "text") return <FileCode2 size={14} />;
  return <File size={14} />;
}

function WorkspaceTreeNode({ entry, depth, expanded, selectedPath, loadingDirectories, onToggle, onLoadDirectory, onOpenFile }: {
  entry: WorkspaceFileEntry;
  depth: number;
  expanded: Set<string>;
  selectedPath: string | null;
  loadingDirectories: Set<string>;
  onToggle: (filePath: string) => void;
  onLoadDirectory: (filePath: string) => void;
  onOpenFile: (filePath: string) => void;
}) {
  const isDirectory = entry.type === "directory";
  const isExpanded = isDirectory && expanded.has(entry.path);
  const isLoading = loadingDirectories.has(entry.path);
  useEffect(() => {
    if (isExpanded && entry.children === undefined && !isLoading) onLoadDirectory(entry.path);
  }, [entry.children, entry.path, isExpanded, isLoading, onLoadDirectory]);
  return <div className="workspace-tree-node">
    <button className={entry.path === selectedPath ? "workspace-tree-row active" : "workspace-tree-row"} style={{ paddingLeft: `${8 + depth * 15}px` }} onClick={() => isDirectory ? onToggle(entry.path) : onOpenFile(entry.path)} title={entry.path}>
      <span className="tree-disclosure">{isLoading ? <RefreshCw className="spin" size={11} /> : isDirectory ? isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}</span>
      <span className="tree-file-icon">{workspaceFileIcon(entry)}</span>
      <strong>{entry.name}</strong>
    </button>
    {isExpanded && entry.children?.map((child) => <WorkspaceTreeNode key={child.path} entry={child} depth={depth + 1} expanded={expanded} selectedPath={selectedPath} loadingDirectories={loadingDirectories} onToggle={onToggle} onLoadDirectory={onLoadDirectory} onOpenFile={onOpenFile} />)}
  </div>;
}

function FilePreview({ file, draft, dirty, saving, conflict, saveError, loading, error, onDraftChange, onSave, onReload, onDismissConflict, onAddComment, compact = false }: {
  file: WorkspaceFilePreview | null;
  draft?: ArtifactDraft;
  dirty: boolean;
  saving: boolean;
  conflict?: string;
  saveError?: string;
  loading: boolean;
  error: string;
  onDraftChange: (filePath: string, content: string) => void;
  onSave: () => void;
  onReload: () => void;
  onDismissConflict: () => void;
  onAddComment: (comment: ArtifactComment) => void;
  compact?: boolean;
}) {
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [selection, setSelection] = useState<ArtifactSelection | null>(null);
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  useEffect(() => {
    setMode(dirty ? "edit" : "preview");
    setSelection(null);
    setCommentOpen(false);
    setCommentBody("");
  }, [file?.path]);
  const editable = Boolean(draft);
  const editing = editable && mode === "edit";

  useEffect(() => {
    if (!dirty) return;
    const handleSave = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "s" || event.defaultPrevented) return;
      event.preventDefault();
      onSaveRef.current();
    };
    window.addEventListener("keydown", handleSave);
    return () => window.removeEventListener("keydown", handleSave);
  }, [dirty]);

  if (loading) return <div className="artifact-empty"><RefreshCw className="spin" size={18} />Loading file...</div>;
  if (error) return <div className="artifact-empty error"><FileText size={22} /><strong>Could not open this file</strong><span>{error}</span></div>;
  if (!file) return <div className="artifact-empty"><FolderOpen size={24} /><strong>Select a file from the workspace</strong><span>Code, Markdown, PDF, and images can be previewed here.</span></div>;

  return <section className="artifact-editor">
    <div className="artifact-editor-top">
      {(editable || !compact) && <div className={compact ? "artifact-editor-header compact" : "artifact-editor-header"}>
        {!compact && <><span>{workspaceFileIcon({ type: "file", kind: file.kind })}</span>
        <strong>{file.path}</strong>
        <small>{formatFileSize(file.size)}</small></>}
        {editable && <div className="artifact-editor-actions">
          <div className="artifact-view-toggle">
            <button className={mode === "preview" ? "active" : ""} onClick={() => setMode("preview")}>Preview</button>
            <button className={mode === "edit" ? "active" : ""} onClick={() => setMode("edit")}>Edit</button>
          </div>
          {editing && <button className="secondary-button artifact-comment-button" disabled={!selection} onClick={() => setCommentOpen(true)} title={selection ? `Comment on lines ${selection.startLine}${selection.endLine !== selection.startLine ? `-${selection.endLine}` : ""}` : "Select text in the editor to comment"}><MessageSquareText size={12} />Comment</button>}
          {(saving || dirty) && <span className={`artifact-save-state ${saving ? "saving" : "unsaved"}`}>
            {saving ? <LoaderCircle className="spin" size={11} /> : <CircleDot size={11} />}
            {saving ? "Saving" : "Unsaved"}
          </span>}
          <button className="secondary-button artifact-save-button" disabled={!dirty || saving} onClick={onSave} title="Save (Ctrl/Cmd+S)"><Save size={12} />Save</button>
        </div>}
      </div>}
      {commentOpen && selection && <form className="artifact-comment-box" onSubmit={(event) => {
        event.preventDefault();
        if (!commentBody.trim()) return;
        onAddComment({ path: file.path, startLine: selection.startLine, endLine: selection.endLine, excerpt: selection.excerpt, body: commentBody });
        setCommentOpen(false);
        setCommentBody("");
      }}>
        <div className="artifact-comment-reference"><strong>{file.path}</strong><span>{selection.startLine === selection.endLine ? `Line ${selection.startLine}` : `Lines ${selection.startLine}-${selection.endLine}`}</span></div>
        <pre>{selection.excerpt.slice(0, 1_200)}</pre>
        <textarea autoFocus value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="What should Archimedes address?" aria-label="Review comment" />
        <div className="artifact-comment-actions"><button type="button" className="secondary-button" onClick={() => { setCommentOpen(false); setCommentBody(""); }}>Cancel</button><button type="submit" className="primary-button" disabled={!commentBody.trim()}>Add to chat</button></div>
      </form>}
      {(conflict !== undefined || saveError) && <div className={`artifact-notice${saveError ? " error" : ""}`}>
        <AlertTriangle size={13} />
        {saveError ? <span>{saveError}</span> : <>
          <span>This file changed on disk.</span>
          <button className="secondary-button" onClick={onReload}>Reload</button>
          <button className="secondary-button" onClick={onDismissConflict}>Keep editing</button>
        </>}
      </div>}
    </div>
    <div className={`artifact-preview-surface${editing ? " editing" : ""}`}>
      {editing ? <Suspense fallback={<div className="artifact-empty"><LoaderCircle className="spin" size={18} />Loading editor...</div>}>
        <ArtifactCodeEditor filePath={file.path} value={draft?.content ?? ""} onChange={(value) => onDraftChange(file.path, value)} onSave={onSave} onSelectionChange={setSelection} />
      </Suspense> : <>
        {file.kind === "markdown" && <article className="markdown-preview"><MarkdownContent content={draft?.content ?? file.content ?? ""} /></article>}
        {file.kind === "text" && <CodePreview content={draft?.content ?? file.content ?? ""} filePath={file.path} />}
        {file.kind === "pdf" && file.previewUrl && <iframe className="pdf-preview" src={file.previewUrl} title={file.name} />}
        {file.kind === "image" && file.previewUrl && <div className="image-preview"><img src={file.previewUrl} alt={file.name} /></div>}
        {file.kind === "binary" && <div className="artifact-empty"><File size={24} /><strong>Binary preview is unavailable</strong><span>{file.name} is still available in the workspace.</span></div>}
      </>}
    </div>
  </section>;
}

function languageForFile(filePath: string) {
  const name = filePath.split("/").at(-1)?.toLowerCase() || "";
  if (name === "dockerfile" || name === "makefile") return "bash";
  const extension = name.includes(".") ? name.split(".").at(-1) : "";
  return ({
    bash: "bash", c: "c", cc: "cpp", cjs: "javascript", cpp: "cpp", css: "css", go: "go",
    h: "c", hpp: "cpp", htm: "markup", html: "markup", java: "java", js: "javascript",
    json: "json", jsonl: "json", jsx: "jsx", latex: "latex", md: "markdown", mdx: "markdown",
    mjs: "javascript", py: "python", rs: "rust", sh: "bash", sql: "sql", tex: "latex",
    toml: "yaml", ts: "typescript", tsx: "tsx", xml: "markup", yaml: "yaml", yml: "yaml", zsh: "bash",
  } as Record<string, string>)[extension || ""];
}

function CodePreview({ content, filePath }: { content: string; filePath: string }) {
  return <div className="code-preview">
    <CopyButton text={content || ""} />
    <SyntaxHighlighter
      language={languageForFile(filePath)}
      useInlineStyles={false}
      showLineNumbers
      wrapLines
      wrapLongLines={false}
      lineNumberStyle={{ minWidth: "43px", paddingRight: "13px", textAlign: "right", userSelect: "none" }}
      lineProps={{ className: "syntax-line" }}
      customStyle={{ minWidth: "max-content", minHeight: "100%", margin: 0, padding: "13px 22px 28px 0", fontSize: "11px", lineHeight: 1.65, tabSize: 2 }}
      codeTagProps={{ style: { fontFamily: "var(--font-mono)" } }}
    >{content || " "}</SyntaxHighlighter>
  </div>;
}

function formatFileSize(size: number) {
  if (size < 1_024) return `${size} B`;
  if (size < 1_048_576) return `${(size / 1_024).toFixed(1)} KB`;
  return `${(size / 1_048_576).toFixed(1)} MB`;
}

function withoutKey<T>(record: Record<string, T>, key: string): Record<string, T> {
  if (!(key in record)) return record;
  const next = { ...record };
  delete next[key];
  return next;
}

const FILES_PANE_DEFAULT_WIDTH = 236;
const FILES_PANE_MIN_WIDTH = 160;
const FILES_EDITOR_MIN_WIDTH = 260;

function clampFilesPaneWidth(width: number, compactWidth: number) {
  const maximum = Math.max(FILES_PANE_MIN_WIDTH, compactWidth - FILES_EDITOR_MIN_WIDTH - 7);
  return Math.min(maximum, Math.max(FILES_PANE_MIN_WIDTH, Math.round(width)));
}

function readFilesPaneWidth() {
  const saved = Number(window.localStorage.getItem("archimedes-files-pane-width"));
  return Number.isFinite(saved) && saved >= FILES_PANE_MIN_WIDTH ? saved : FILES_PANE_DEFAULT_WIDTH;
}

function ArtifactsView({ workspace, tree, openFiles, selectedPath, file, loading, error, loadingDirectories, drafts, dirtyFiles, savingFiles, conflicts, saveErrors, onOpenFile, onSelectOpenFile, onCloseFile, onLoadDirectory, onRefresh, onNewArtifact, onDraftChange, onSave, onReload, onDismissConflict, onAddComment, compact = false, compactWidth = 0, onOpenFull }: {
  workspace: string;
  tree: WorkspaceFileTree;
  openFiles: WorkspaceFilePreview[];
  selectedPath: string | null;
  file: WorkspaceFilePreview | null;
  loading: boolean;
  error: string;
  loadingDirectories: Set<string>;
  drafts: Record<string, ArtifactDraft>;
  dirtyFiles: Set<string>;
  savingFiles: Set<string>;
  conflicts: Record<string, string>;
  saveErrors: Record<string, string>;
  onOpenFile: (filePath: string) => void;
  onSelectOpenFile: (file: WorkspaceFilePreview) => void;
  onCloseFile: (filePath: string) => void;
  onLoadDirectory: (directory: string) => void;
  onRefresh: () => void;
  onNewArtifact: () => void;
  onDraftChange: (filePath: string, content: string) => void;
  onSave: (filePath: string) => void;
  onReload: (filePath: string) => void;
  onDismissConflict: (filePath: string) => void;
  onAddComment: (comment: ArtifactComment) => void;
  compact?: boolean;
  compactWidth?: number;
  onOpenFull?: () => void;
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [compactPane, setCompactPane] = useState<"browse" | "editor">(selectedPath ? "editor" : "browse");
  const [filesPaneWidth, setFilesPaneWidth] = useState(readFilesPaneWidth);
  const [filesListCollapsed, setFilesListCollapsed] = useState(false);
  const [filesEditorCollapsed, setFilesEditorCollapsed] = useState(false);
  const workspaceName = workspace.split("/").filter(Boolean).at(-1) || "Workspace";
  useEffect(() => {
    if (!selectedPath) {
      setCompactPane("browse");
      return;
    }
    setCompactPane("editor");
    setFilesEditorCollapsed(false);
    const parts = selectedPath.split("/");
    setExpanded((current) => {
      const next = new Set(current);
      for (let index = 1; index < parts.length; index += 1) next.add(parts.slice(0, index).join("/"));
      return next;
    });
  }, [selectedPath]);
  const toggleDirectory = (filePath: string) => setExpanded((current) => {
    const next = new Set(current);
    if (next.has(filePath)) next.delete(filePath); else next.add(filePath);
    return next;
  });

  useEffect(() => {
    window.localStorage.setItem("archimedes-files-pane-width", String(filesPaneWidth));
  }, [filesPaneWidth]);

  useEffect(() => {
    if (!compact) return;
    setFilesPaneWidth((width) => clampFilesPaneWidth(width, compactWidth));
  }, [compact, compactWidth]);

  function toggleFilesList() {
    setFilesListCollapsed((collapsed) => {
      const next = !collapsed;
      if (next && filesEditorCollapsed) setFilesEditorCollapsed(false);
      return next;
    });
  }

  function toggleFilesEditor() {
    setFilesEditorCollapsed((collapsed) => {
      const next = !collapsed;
      if (next && filesListCollapsed) setFilesListCollapsed(false);
      return next;
    });
  }

  function startFilesPaneResize(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = filesPaneWidth;
    const onPointerMove = (pointerEvent: PointerEvent) => {
      setFilesPaneWidth(clampFilesPaneWidth(startWidth + pointerEvent.clientX - startX, compactWidth));
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      document.body.classList.remove("files-pane-resizing");
    };
    document.body.classList.add("files-pane-resizing");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
  }

  function handleFilesPaneResizeKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setFilesPaneWidth((width) => clampFilesPaneWidth(width - 16, compactWidth));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setFilesPaneWidth((width) => clampFilesPaneWidth(width + 16, compactWidth));
    } else if (event.key === "Home") {
      event.preventDefault();
      setFilesPaneWidth(FILES_PANE_DEFAULT_WIDTH);
    }
  }

  const browser = <aside className="artifact-browser">
    {!compact && <div className="artifact-browser-title"><FolderOpen size={14} /><strong>{workspaceName}</strong></div>}
    {tree.entries.map((entry) => <WorkspaceTreeNode key={entry.path} entry={entry} depth={0} expanded={expanded} selectedPath={selectedPath} loadingDirectories={loadingDirectories} onToggle={toggleDirectory} onLoadDirectory={onLoadDirectory} onOpenFile={onOpenFile} />)}
    {!tree.entries.length && <p className="artifact-browser-empty">This workspace has no visible files.</p>}
  </aside>;

  const editor = <div className={compact && openFiles.length <= 1 ? "artifact-editor-pane no-tabs" : "artifact-editor-pane"}>
    {(!compact || openFiles.length > 1) && <div className="artifact-tabs" role="tablist" aria-label="Open files">
      {openFiles.map((openFile) => <div className={openFile.path === selectedPath ? "artifact-tab active" : "artifact-tab"} key={openFile.path}>
        <button className="artifact-tab-main" role="tab" aria-selected={openFile.path === selectedPath} onClick={() => onSelectOpenFile(openFile)} title={openFile.path}>
          {dirtyFiles.has(openFile.path) && <span className="artifact-dirty-dot" title="Unsaved changes" />}
          {workspaceFileIcon({ type: "file", kind: openFile.kind })}<span>{openFile.name}</span>
        </button>
        <button className="artifact-tab-close" onClick={() => onCloseFile(openFile.path)} title={`Close ${openFile.name}`}><X size={12} /></button>
      </div>)}
    </div>}
    <FilePreview
      compact={compact}
      file={file}
      draft={file ? drafts[file.path] : undefined}
      dirty={Boolean(file && dirtyFiles.has(file.path))}
      saving={Boolean(file && savingFiles.has(file.path))}
      conflict={file ? conflicts[file.path] : undefined}
      saveError={file ? saveErrors[file.path] : undefined}
      loading={loading}
      error={error}
      onDraftChange={onDraftChange}
      onSave={() => file && onSave(file.path)}
      onReload={() => file && onReload(file.path)}
      onDismissConflict={() => file && onDismissConflict(file.path)}
      onAddComment={onAddComment}
    />
  </div>;

  if (compact) {
    const split = compactWidth >= 560;
    const showingEditor = compactPane === "editor";
    const bodyClass = split
      ? filesListCollapsed ? "artifact-workbench-body editor-only"
        : filesEditorCollapsed ? "artifact-workbench-body browser-only"
          : "artifact-workbench-body split"
      : showingEditor ? "artifact-workbench-body editor" : "artifact-workbench-body";
    return <div className="artifact-workbench">
      <header className="artifact-workbench-toolbar">
        <div className="artifact-workbench-location">
          {showingEditor && !split
            ? <button className="artifact-workbench-back" onClick={() => setCompactPane("browse")} title="Back to files"><ChevronLeft size={13} /><span>Files</span></button>
            : <strong className="artifact-workbench-workspace" title={workspace}>{workspaceName}</strong>}
          {showingEditor && file && openFiles.length <= 1 && <span className="artifact-workbench-file" title={file.path}>{file.name}</span>}
        </div>
        <div className="artifact-workbench-actions">
          {split && <div className="artifact-workbench-pane-toggles" role="group" aria-label="File panes">
            <button className={filesListCollapsed ? "" : "active"} onClick={toggleFilesList} title={filesListCollapsed ? "Show file list" : "Collapse file list"} aria-label={filesListCollapsed ? "Show file list" : "Collapse file list"} aria-pressed={!filesListCollapsed}>{filesListCollapsed ? <PanelLeftOpen size={13} /> : <PanelLeftClose size={13} />}</button>
            <button className={filesEditorCollapsed ? "" : "active"} onClick={toggleFilesEditor} title={filesEditorCollapsed ? "Show editor" : "Collapse editor"} aria-label={filesEditorCollapsed ? "Show editor" : "Collapse editor"} aria-pressed={!filesEditorCollapsed}>{filesEditorCollapsed ? <PanelRightOpen size={13} /> : <PanelRightClose size={13} />}</button>
          </div>}
          <button onClick={onRefresh} title="Refresh workspace files" aria-label="Refresh workspace files"><RefreshCw size={13} /></button>
          <button onClick={onNewArtifact} title="New file" aria-label="New file"><Plus size={14} /></button>
          {onOpenFull && <button onClick={onOpenFull} title="Open full editor" aria-label="Open full editor"><Maximize2 size={13} /></button>}
        </div>
      </header>
      <div className={bodyClass} style={{ "--files-pane-width": `${filesPaneWidth}px` } as React.CSSProperties}>
        {split ? <>
          {!filesListCollapsed && browser}
          {!filesListCollapsed && !filesEditorCollapsed && <div className="artifact-workbench-divider" role="separator" aria-orientation="vertical" aria-label="Resize file list" aria-valuemin={FILES_PANE_MIN_WIDTH} aria-valuemax={Math.max(FILES_PANE_MIN_WIDTH, compactWidth - FILES_EDITOR_MIN_WIDTH - 7)} aria-valuenow={filesPaneWidth} tabIndex={0} onPointerDown={startFilesPaneResize} onDoubleClick={() => setFilesPaneWidth(FILES_PANE_DEFAULT_WIDTH)} onKeyDown={handleFilesPaneResizeKey}><span /></div>}
          {!filesEditorCollapsed && editor}
        </> : showingEditor ? editor : browser}
      </div>
    </div>;
  }

  return <div className="artifacts-page">
    <header className="artifacts-header">
      <div><span className="page-kicker">Workspace</span><h1>Artifacts</h1><p>Browse the active folder and inspect files created or changed by Archimedes.</p></div>
      <div className="artifacts-header-actions"><button className="secondary-button" onClick={onRefresh} title="Refresh workspace files"><RefreshCw size={14} />Refresh</button><button className="primary-button" onClick={onNewArtifact}><Plus size={15} />New file</button></div>
    </header>
    <div className="artifacts-workspace">
      {browser}
      {editor}
    </div>
  </div>;
}

function WorkspaceModal({ modal, artifactName, evidenceTitle, evidenceUrl, searchQuery, selectedSource, onArtifactName, onEvidenceTitle, onEvidenceUrl, onSearchQuery, onClose, onCreateArtifact, onAddEvidence }: { modal: Modal; artifactName: string; evidenceTitle: string; evidenceUrl: string; searchQuery: string; selectedSource: string; onArtifactName: (value: string) => void; onEvidenceTitle: (value: string) => void; onEvidenceUrl: (value: string) => void; onSearchQuery: (value: string) => void; onClose: () => void; onCreateArtifact: () => void; onAddEvidence: () => void }) {
  const dialogRef = useDialogFocus<HTMLElement>(Boolean(modal), onClose);
  if (!modal) return null;
  const firstTerm = searchQuery.toLowerCase().trim().split(" ")[0];
  const previewResults = initialPapers.filter((paper) => !firstTerm || paper.title.toLowerCase().includes(firstTerm));
  const title = modal === "artifact" ? "New research artifact" : modal === "evidence" ? "Add evidence" : modal === "search" ? "Search research" : "Source record";

  return <div className="modal-backdrop" role="presentation" onMouseDown={onClose}><section ref={dialogRef} tabIndex={-1} className="workspace-modal" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
    <div className="modal-header"><div><span className="eyebrow">Archimedes workspace</span><h2>{title}</h2></div><button className="icon-button" onClick={onClose} title="Close"><X size={16} /></button></div>
    {modal === "artifact" && <><p>Create a session draft, then select it from the left workspace tree.</p><label>Artifact name<input autoFocus value={artifactName} onChange={(event) => onArtifactName(event.target.value)} placeholder="literature-gap.md" onKeyDown={(event) => event.key === "Enter" && onCreateArtifact()} /></label><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={onCreateArtifact}><Plus size={14} />Create draft</button></div></>}
    {modal === "evidence" && <><p>Add a paper, dataset, or web source to the current evidence ledger.</p><label>Title<input autoFocus value={evidenceTitle} onChange={(event) => onEvidenceTitle(event.target.value)} placeholder="Paper or source title" /></label><label>URL or citation<input value={evidenceUrl} onChange={(event) => onEvidenceUrl(event.target.value)} placeholder="https://... or Author et al., 2025" onKeyDown={(event) => event.key === "Enter" && onAddEvidence()} /></label><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={onAddEvidence}><Plus size={14} />Add evidence</button></div></>}
    {modal === "search" && <><p>Search is a local preview catalogue for now; choose a result, then add it to the evidence ledger.</p><label>Research query<input autoFocus value={searchQuery} onChange={(event) => onSearchQuery(event.target.value)} /></label><div className="search-results">{previewResults.length ? previewResults.map((paper) => <button key={paper.title} className="search-result" onClick={() => { onEvidenceTitle(paper.title); onEvidenceUrl(`${paper.meta} · preview catalogue`); }}><Search size={15} /><span>{paper.title}</span><Plus size={14} /></button>) : <p>No local preview matches. Use Add evidence to enter a source manually.</p>}</div><div className="modal-actions"><button className="secondary-button" onClick={onClose}>Close</button><button className="primary-button" onClick={onAddEvidence}><Plus size={14} />Add selected</button></div></>}
    {modal === "source" && <><p><strong>{selectedSource}</strong></p><p>This is a linked-source detail placeholder. The next data layer will persist a citation, source URL, extracted passage, and its connection to a claim.</p><div className="modal-actions"><button className="primary-button" onClick={onClose}>Close record</button></div></>}
  </section></div>;
}

export default App;
