import { Fragment, lazy, memo, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type ClipboardEvent as ReactClipboardEvent, type ReactNode } from "react";
import ReactMarkdown from "react-markdown";
import { WorkspaceMarkdownLink, WorkspaceMarkdownProvider, workspaceMarkdownUrlTransform } from "./WorkspaceMarkdownLink";
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
import { applyAppearance, readAppearance, resolveTheme, writeAppearance, type AppearanceSettings, type AppTheme, type ThemePreset } from "./appearance";
import { chooseIconName } from "./file-icons/opencode/choose-icon-name";
import { ensureOpenCodeSprite } from "./file-icons/opencode/sprite";
import ResearchWelcome, { type ResearchWelcomeAction } from "./ResearchWelcome";
import ContextPicker, { ContextChips } from "./ContextPicker";
import ProjectSidebar, { NewProjectModal, ProjectRemoveModal } from "./ProjectSidebar";
import { type ExtensionsTab } from "./ExtensionsView";
import { useConfirm } from "./ConfirmDialog";
import { Dialog } from "./Dialog";
import CommandPalette, { type PaletteCommand } from "./CommandPalette";
import { defaultDisabledResearchApps, researchAppMetadata } from "./research-apps";
import { sidebarEntries, sidebarModule, type MainSection, type SidebarEntry, type SidebarModuleId } from "./sidebar-registry";
import { loadSidebarPlugins, PluginModuleView } from "./plugin-runtime";
import RightWorkbench, { clampWorkbenchWidth, defaultWorkbenchWidth } from "./RightWorkbench";
import SessionSwitcher from "./SessionSwitcher";
import WorkspaceDialog from "./WorkspaceDialog";
import ChangesView from "./ChangesView";
import NotesView from "./NotesView";
import VoiceInputButton from "./VoiceInputButton";
import SideConversation from "./SideConversation";
import { INIT_PROMPT, type ConversationCommand, type ConversationCommandResult } from "./conversation-commands";
import workspaceNameLibrary from "../shared/workspace-names.json";
import { workspacePathName } from "./workspace-path";
import { readSessionToolPreferences, writeSessionToolPreferences, type SessionToolPreferences } from "./session-tools";
import { shouldSubmitPaperChatKey } from "./paperChatKeyboard";
import BrowserView from "./BrowserView";
import { DEFAULT_WORKBENCH_PREFERENCES, activeWorkbenchPaneTabs, normalizeWorkbenchPreferences, selectWorkbenchTab, type WorkbenchTabId, type WorkbenchTabPreferences } from "./workbench-tabs";
import ArtifactsPanel from "./ArtifactsPanel";
import ChatActivityTimeline from "./ChatActivityTimeline";
import NativeAgentPanel, { NativeContextUsage, NativeQuestionCard } from "./NativeAgentPanel";
import { mergeNativeEvent, nativeTurnEvents, nativeUsage, updateNativeQuestions } from "./native-agent-state";
import HarnessPicker from "./HarnessPicker";
import NewChatModePicker, { draftForNewChatMode, RESEARCH_EXAMPLE, type NewChatMode } from "./NewChatModePicker";
import JourneyView from "./JourneyView";
import { defaultJourneySettings, normalizeJourneySettings } from "./journeySettings";
import TrajectoryView from "./TrajectoryView";
import TurnRail from "./TurnRail";
import TerminalPanel from "./TerminalPanel";
import TerminalSettingsModal from "./TerminalSettingsModal";
import SettingsModal, { type SettingsSection } from "./SettingsModal";
import ThreadShareModal from "./ThreadShareModal";
import SessionComments, { type SessionCommentsScope } from "./SessionComments";
import AccountChip from "./AccountChip";
import packageMetadata from "../package.json";
import AuthModal from "./AuthModal";
import { useUISettings } from "./i18n";
import { moveSidebarOrder, orderSidebarIds, readSidebarOrder, reconcileSidebarOrder, writeSidebarOrder, type SidebarOrderGroup } from "./sidebar-order";
import { type PaperOpenRequest } from "./PaperWritingView";
import { createFileDraft, formatFileComment, isDraftDirty, isEditableFile, markDraftSaved, mergeRefreshedFiles, prepareFileContent, toEditorText, type FileComment, type FileDraft, type FileSelection } from "./file-editor";
import { shortcutMatches } from "./file-text-size";
import { previewLibraryBridge } from "./library-preview";
import AgentLayer from "./AgentLayer";
import ResearchPathPanel from "./ResearchPathPanel";
import ProactiveAgentPanel from "./ProactiveAgentPanel";
import ProactiveSettingsPanel from "./ProactiveSettingsPanel";
import { researchStages, stageForMode, type ResearchStage, type ResearchStageId } from "./research-path";
import { useProactiveAgent } from "./useProactiveAgent";
import type { ProactiveSuggestion } from "./proactive-types";
import CopyButton from "./CopyButton";
import { MenuDivider, MenuItem, MenuLabel, MenuSurface } from "./Menu";
import ArchimedesMark from "./brand/ArchimedesMark";
import ArchimedesWordmark from "./brand/ArchimedesWordmark";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  BookOpen,
  BookOpenCheck,
  Calendar,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronsLeft,
  ChevronsRight,
  ChevronRight,
  CircleDot,
  Clipboard,
  Copy,
  Cpu,
  Download,
  File,
  FileAudio,
  FileBraces,
  FileCode,
  FileCode2,
  FileCog,
  FileImage,
  FileJson,
  FileLock,
  FilePen,
  FileSpreadsheet,
  FileTerminal,
  FileText,
  FileType,
  FileVideo,
  Flag,
  FlaskConical,
  Folder,
  FolderOpen,
  GitCompareArrows,
  GitFork,
  ImagePlus,
  Laptop,
  Lightbulb,
  LoaderCircle,
  Maximize2,
  MessageCircle,
  MessageCircleReply,
  Minimize2,
  NotebookPen,
  Package,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRight,
  PanelRightClose,
  PanelRightOpen,
  Play,
  Plus,
  Puzzle,
  Radar,
  RefreshCw,
  Route,
  Save,
  Scissors,
  Search,
  Settings,
  Share2,
  Shield,
  Sparkle,
  Square,
  SquareTerminal,
  Undo2,
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
  turn_id?: string;
  role: "user" | "assistant";
  text: string;
  sources?: ResearchSource[];
  attachments?: MessageAttachment[];
  created_at?: string;
};

type TimelineEvent = {
  title: string;
  detail: string;
  state: "done" | "active" | "waiting";
};

type PendingAction = AgentAction & { source: "agent" | "manual" };
type Modal = "file" | null;
type ResearchMode = NewChatMode | "free-chat" | "idea-spark" | "experiment-setup" | "paper-generation" | "paper-review" | "deep-research";
type ReasoningEffort = "low" | "medium" | "high";
type ContextLength = "standard" | "extra-long";

const researchModes: Array<{ id: ResearchMode; label: string; description: string; icon: React.ReactNode; placeholder: string }> = [
  { id: "standard", label: "Standard", description: "Ask questions and work with your research context", icon: <MessageCircle size={15} />, placeholder: "Ask anything or start a conversation..." },
  { id: "research", label: "Research", description: "Explore a research question", icon: <Lightbulb size={15} />, placeholder: "Describe a topic, observation, or open question..." },
  { id: "create", label: "Create", description: "Design a Research App", icon: <FilePen size={15} />, placeholder: "Describe a Research App you want to create." },
  { id: "free-chat", label: "Free chat", description: "Talk with AI without a predefined workflow", icon: <MessageCircle size={15} />, placeholder: "Ask anything or start a conversation..." },
  { id: "idea-spark", label: "Idea spark", description: "Find gaps and form testable research ideas", icon: <Lightbulb size={15} />, placeholder: "Describe a topic, observation, or open question..." },
  { id: "experiment-setup", label: "Experiment setup", description: "Design experiments, baselines, and metrics", icon: <FlaskConical size={15} />, placeholder: "Describe the hypothesis or experiment you want to build..." },
  { id: "paper-generation", label: "Paper writing", description: "Plan and draft an evidence-grounded paper", icon: <FilePen size={15} />, placeholder: "What section or argument would you like to write?" },
  { id: "paper-review", label: "Paper review", description: "Critique claims, methods, and presentation", icon: <BookOpenCheck size={15} />, placeholder: "What paper or draft would you like to review?" },
];

const previewModelCapabilities: ModelCapabilities = {
  thinkingEfforts: ["low", "medium", "high"],
  contextLengths: ["standard", "extra-long"],
  nativeThinking: true,
  contextCharacterLimits: { standard: 500_000, "extra-long": 1_000_000 },
};

function chatModeFromThread(mode: ResearchMode, events: ResearchEvent[] = []): NewChatMode {
  if (mode === "standard" || mode === "research" || mode === "create") return mode;
  return events.some((event) => event.type === "research_skill" && (event.payload as { skill?: string } | null)?.skill === "idea-spark") ? "research" : "standard";
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
const COMPOSER_DRAFT_STORAGE_PREFIX = "archimedes-composer-draft:";
const COMPOSER_HISTORY_STORAGE_KEY = "archimedes-composer-history";
const COMPOSER_HISTORY_LIMIT = 30;

type ComposerDraft = { text: string; selectionStart: number; selectionEnd: number; newChatMode?: NewChatMode };
type QueuedPrompt = { id: string; draft: string; mode: ResearchMode; reasoningEffort: ReasoningEffort; contextLength: ContextLength; contextItems: ContextAttachment[] };

function readComposerDraft(key: string): ComposerDraft | null {
  try {
    const raw = window.localStorage.getItem(`${COMPOSER_DRAFT_STORAGE_PREFIX}${key}`);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<ComposerDraft>;
    if (typeof value.text !== "string") return null;
    return {
      text: value.text,
      selectionStart: typeof value.selectionStart === "number" ? value.selectionStart : value.text.length,
      selectionEnd: typeof value.selectionEnd === "number" ? value.selectionEnd : value.text.length,
      newChatMode: value.newChatMode === "research" || value.newChatMode === "create" ? value.newChatMode : "standard",
    };
  } catch {
    return null;
  }
}

function writeComposerDraft(key: string, draft: ComposerDraft | null) {
  try {
    const storageKey = `${COMPOSER_DRAFT_STORAGE_PREFIX}${key}`;
    if (!draft) window.localStorage.removeItem(storageKey);
    else window.localStorage.setItem(storageKey, JSON.stringify(draft));
  } catch {
    // Drafts are a convenience; storage failures must not block sending.
  }
}

function readComposerHistory(): string[] {
  try {
    const value = JSON.parse(window.localStorage.getItem(COMPOSER_HISTORY_STORAGE_KEY) || "[]") as unknown;
    return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, COMPOSER_HISTORY_LIMIT) : [];
  } catch {
    return [];
  }
}

function writeComposerHistory(history: string[]) {
  try {
    window.localStorage.setItem(COMPOSER_HISTORY_STORAGE_KEY, JSON.stringify(history.slice(0, COMPOSER_HISTORY_LIMIT)));
  } catch {
    // History is optional.
  }
}

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

// Explicit links can point into directories normally omitted from the file
// tree. Add only the requested chain, leaving unrelated ignored entries hidden.
function ensureDirectoryPath(entries: WorkspaceFileEntry[], directory: string): WorkspaceFileEntry[] {
  const parts = directory.split("/").filter(Boolean);
  function visit(current: WorkspaceFileEntry[], index: number): WorkspaceFileEntry[] {
    if (index >= parts.length) return current;
    const entryPath = parts.slice(0, index + 1).join("/");
    const existing = current.find((entry) => entry.path === entryPath && entry.type === "directory");
    const entry: WorkspaceFileEntry = existing ?? { name: parts[index], path: entryPath, type: "directory" };
    const updated = index === parts.length - 1 ? entry : { ...entry, children: visit(entry.children ?? [], index + 1) };
    return existing ? current.map((candidate) => candidate === existing ? updated : candidate) : [...current, updated];
  }
  return visit(entries, 0);
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
let previewAuthState: AuthState = { configured: true, user: null, expiresAt: 0, error: "", providers: { email: true, google: false } };
let previewLocalIdentity: LocalIdentity = {
  version: 1,
  userId: "usr_preview_local",
  displayName: "Local researcher",
  deviceId: "dev_preview_device",
  deviceName: "Browser preview",
  createdAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
  updatedAt: new Date("2026-01-01T00:00:00.000Z").toISOString(),
};
const previewFileContents = new Map<string, string>();
const previewArtifactImages: Record<string, string> = {
  "figures/figure-3.png": "https://qwdwqfwq.github.io/topconf-paper-figure-gallery/images/cvpr/final/cvpr2023-Boutros_CR-FIQA_Face_Image_Quality_Assessment_by_Learning_Sample_Relative_Classifiability_CVPR_2023_paper.jpg",
  "figures/framework.png": "https://qwdwqfwq.github.io/topconf-paper-figure-gallery/images/iclr/final/iclr2023-0009.jpg",
  "figures/pipeline.png": "https://qwdwqfwq.github.io/topconf-paper-figure-gallery/images/icml/final/icml2023-0042.jpg",
  "figures/teaser.png": "https://qwdwqfwq.github.io/topconf-paper-figure-gallery/images/neurips/final/neurips2023-0013.jpg",
};
const previewArtifacts: ResearchArtifact[] = [];
let previewArtifactsSeededFor = "";
function ensurePreviewArtifacts(threadId: string) {
  if (previewArtifactsSeededFor === threadId) return;
  previewArtifactsSeededFor = threadId;
  previewArtifacts.splice(0, previewArtifacts.length);
  const thread = previewThreads.find((candidate) => candidate.id === threadId);
  const latest = thread?.turns.at(-1)?.id ?? "preview-turn";
  const earlier = thread && thread.turns.length > 1 ? thread.turns[0].id : "preview-earlier-turn";
  const now = new Date().toISOString();
  const earlierAt = new Date(Date.now() - 86_400_000).toISOString();
  const add = (input: Partial<ResearchArtifact> & Pick<ResearchArtifact, "path" | "title" | "kind" | "size_bytes">) => {
    const artifact = {
      id: `preview-artifact-${previewArtifacts.length + 1}`,
      thread_id: threadId,
      turn_id: input.turn_id ?? latest,
      modified_at: input.modified_at ?? now,
      version: input.version ?? 1,
      source: input.source ?? "agent",
      created_at: input.created_at ?? now,
      updated_at: input.updated_at ?? now,
      seen: input.seen ?? false,
      ...input,
    } as ResearchArtifact;
    previewArtifacts.push(artifact);
  };
  add({ path: "figures/figure-3.png", title: "figure-3.png", kind: "image", size_bytes: 1_200_000, version: 3 });
  add({ path: "figures/framework.png", title: "framework.png", kind: "image", size_bytes: 840_000 });
  add({ path: "notes/research-brief.md", title: "research-brief.md", kind: "markdown", size_bytes: 4_200 });
  add({ path: "data/results.csv", title: "results.csv", kind: "csv", size_bytes: 12_000, turn_id: earlier, created_at: earlierAt, updated_at: earlierAt, modified_at: earlierAt, seen: true });
  add({ path: "figures/pipeline.png", title: "pipeline.png", kind: "image", size_bytes: 1_100_000, turn_id: earlier, created_at: earlierAt, updated_at: earlierAt, modified_at: earlierAt, seen: true });
  add({ path: "figures/teaser.png", title: "teaser.png", kind: "image", size_bytes: 970_000, turn_id: earlier, created_at: earlierAt, updated_at: earlierAt, modified_at: earlierAt, seen: true });
  add({ path: "paper/main.pdf", title: "main.pdf", kind: "pdf", size_bytes: 2_400_000, turn_id: earlier, created_at: earlierAt, updated_at: earlierAt, modified_at: earlierAt, seen: true });
  add({ path: "web/experiment.html", title: "experiment.html", kind: "html", size_bytes: 3_600, turn_id: earlier, created_at: earlierAt, updated_at: earlierAt, modified_at: earlierAt, seen: true });
  add({ path: "data/config.json", title: "config.json", kind: "json", size_bytes: 900, turn_id: earlier, created_at: earlierAt, updated_at: earlierAt, modified_at: earlierAt, seen: true });
  previewFileContents.set("notes/research-brief.md", "# Research brief\n\n**Question.** Can evidence-aware retrieval reduce unsupported claims in long-context reasoning?\n\n## Evidence\n\n- Retrieval budget is the main confound across the three strongest baselines.\n- Re-ranking helps most when the context exceeds 4k tokens.\n- We still need a held-out claim-support annotation.\n\n## Next test\n\nRun the 4k/8k budget ablation with fixed seeds and report support precision alongside accuracy.\n");
}
const previewTasks: SavedTask[] = [];
const previewProjects: ResearchProject[] = [{ id: "preview-general", name: "General", description: "Default research project", workspace_path: DEFAULT_WORKSPACE || null, chat_count: 0, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), archived_at: null, last_chat_at: null }];
const previewArchivedProjects: ResearchProject[] = [];
const previewWorkspaceNames = new Map<string, string>();

function previewDefaultWorkspaceName(projectId: string) {
  const existing = previewWorkspaceNames.get(projectId);
  if (existing) return existing;
  const used = new Set([...previewWorkspaceNames.values()].map((name) => name.toLowerCase()));
  const available = workspaceNameLibrary.filter((entry) => !used.has(entry.name.toLowerCase()));
  const name = available.length
    ? available[Math.floor(Math.random() * available.length)].name
    : `Workspace ${crypto.randomUUID().slice(0, 8)}`;
  previewWorkspaceNames.set(projectId, name);
  return name;
}
const previewThreads: ResearchThreadDetail[] = [];
const previewThreadSnapshots: Array<{ id: string; thread_id: string; project_id: string; sequence: number; created_at: string; manifest: Record<string, unknown> }> = [];
const previewComments: ResearchComment[] = [];
const previewProjectMembers: ProjectMember[] = [{ project_id: "preview-general", user_id: "usr_preview_local", role: "owner", joined_at: new Date("2026-01-01T00:00:00.000Z").toISOString(), invited_by: null, display_name: "Local researcher", email: "", avatar_color: "" }];
const previewAuditEvents: AuditEvent[] = [];
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
    threads: previewThreads.filter((thread) => thread.kind !== "paper").map(({ turns: _turns, messages: _messages, ...thread }) => thread),
    archivedThreads: previewArchivedThreads.filter((thread) => thread.kind !== "paper").map(({ turns: _turns, messages: _messages, ...thread }) => thread),
    workspaces: previewProjects.map((project) => ({
      id: `preview-workspace-${project.id}`,
      project_id: project.id,
      kind: "shared",
      name: previewDefaultWorkspaceName(project.id),
      root: project.workspace_path || DEFAULT_WORKSPACE,
      base_ref: null,
      last_session_id: null,
      created_at: project.created_at,
      updated_at: project.updated_at,
      session_count: 0,
      is_default: true,
    })),
    commands: [...previewCommands].reverse(),
    actions: [...previewActions].reverse(),
  };
}

function emitPreviewAgentEvent(payload: AgentEvent) {
  for (const listener of previewAgentListeners) listener(payload);
}

const previewExtensionSources: ExtensionSource[] = [
  { id: "archimedes", name: "Archimedes index", type: "archimedes", url: "", enabled: true, builtin: true, count: 8, total: 8 },
  { id: "github", name: "GitHub", type: "github", url: "https://api.github.com/search/repositories?q=topic%3Aclaude-skills", enabled: true, builtin: true, count: 12, total: 13654 },
  { id: "mcp-registry", name: "MCP Registry", type: "mcp", url: "https://registry.modelcontextprotocol.io/v0/servers", enabled: true, builtin: true, count: 12, total: 12 },
  { id: "npm", name: "npm", type: "npm", url: "https://registry.npmjs.org/-/v1/search?text=keywords%3Amcp-server", enabled: true, builtin: true, count: 12, total: 10814 },
];

const previewExtensionItems: ExtensionMarketplaceItem[] = [
  ...previewSkills.slice(0, 4).map((skill, index) => ({
    id: `archimedes/${skill.id.split("/").pop()}`,
    canonicalId: `archimedes/${skill.id.split("/").pop()}`,
    name: skill.name,
    type: "skill" as const,
    description: skill.description,
    version: ["1.4.2", "2.1.0", "1.0.6", "1.2.3"][index],
    author: "Archimedes",
    license: "MIT",
    homepage: "https://github.com/Johanson-colab/Archimedes",
    sourceUrl: "https://github.com/Johanson-colab/Archimedes",
    permissions: ["read:workspace", "write:artifacts"],
    installs: [1284, 986, 742, 611][index],
    size: [4200, 3600, 2800, 5100][index],
    updatedAt: "2026-10-18",
    source: "Archimedes index",
    sourceId: "archimedes",
    sourceType: "archimedes" as const,
    files: [{ path: "SKILL.md", content: skill.content }],
    config: null,
  })),
  { id: "archimedes/zotero-mcp", canonicalId: "archimedes/zotero-mcp", name: "Zotero", type: "mcp", description: "Search a local Zotero library and pull citation metadata into the conversation.", version: "0.9.4", author: "Zotero community", license: "AGPL-3.0", homepage: "https://www.zotero.org/", sourceUrl: "https://www.zotero.org/", permissions: ["read:library", "local:network"], installs: 2306, size: 0, updatedAt: "2026-10-21", source: "Archimedes index", sourceId: "archimedes", sourceType: "archimedes", config: { mcpServers: { zotero: { command: "npx", args: ["-y", "@zotero/mcp-server"] } } } },
  { id: "archimedes/overleaf-source", canonicalId: "archimedes/overleaf-source", name: "Overleaf", type: "source", description: "Keep a manuscript workspace synchronized with an Overleaf project.", version: "1.1.0", author: "Archimedes", license: "MIT", homepage: "https://www.overleaf.com/", sourceUrl: "https://www.overleaf.com/", permissions: ["read:workspace", "network:overleaf"], installs: 438, size: 0, updatedAt: "2026-10-02", source: "Archimedes index", sourceId: "archimedes", sourceType: "archimedes", config: { provider: "overleaf" } },
  { id: "archimedes/git-hygiene", canonicalId: "archimedes/git-hygiene", name: "Git Hygiene", type: "plugin", description: "Check diffs for accidental artifacts, secrets, and unreviewed generated files.", version: "1.3.0", author: "Archimedes", license: "MIT", homepage: "https://github.com/Johanson-colab/Archimedes", sourceUrl: "https://github.com/Johanson-colab/Archimedes", permissions: ["read:workspace", "execute:git"], installs: 276, size: 0, updatedAt: "2026-10-19", source: "Archimedes index", sourceId: "archimedes", sourceType: "archimedes", config: { commands: ["git status --short"] } },
  { id: "archimedes/daily-digest", canonicalId: "archimedes/daily-digest", name: "Daily Digest", type: "automation", description: "Collect new papers in a saved search and prepare a short morning brief.", version: "0.8.2", author: "Archimedes", license: "MIT", homepage: "https://github.com/Johanson-colab/Archimedes", sourceUrl: "https://github.com/Johanson-colab/Archimedes", permissions: ["network:search", "write:artifacts"], installs: 355, size: 0, updatedAt: "2026-09-24", source: "Archimedes index", sourceId: "archimedes", sourceType: "archimedes", config: { schedule: "weekdays 08:00" } },
];

function readPreviewSidebarSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("archimedes-research-apps") || "null");
    if (Array.isArray(saved?.disabledCore)) {
      const disabledCore: string[] = saved.disabledCore.filter((id: unknown): id is string => typeof id === "string" && Object.hasOwn(researchAppMetadata, id));
      if ((Number(saved.version) || 0) < 4 && disabledCore.includes("image-creation") && !disabledCore.includes("data-charts")) disabledCore.push("data-charts");
      return { version: 4, layout: "flat" as const, disabledCore };
    }
  } catch { /* Preview storage is optional. */ }
  return { version: 4, layout: "flat" as const, disabledCore: [...defaultDisabledResearchApps] };
}

const previewBridge = {
  ...previewLibraryBridge,
  getInitialWorkspace: async () => null,
  getLocalIdentity: async () => structuredClone(previewLocalIdentity),
  getAuthState: async () => structuredClone(previewAuthState),
  getAuthProviders: async () => structuredClone(previewAuthState.providers || { email: true, google: false }),
  signInWithMagicLink: async (email: string) => {
    previewAuthState = { configured: true, user: { id: "usr_preview_cloud", email, displayName: email.split("@")[0] }, expiresAt: Math.floor(Date.now() / 1000) + 3600, error: "", providers: { email: true, google: false } };
    return structuredClone(previewAuthState);
  },
  signUpAndConfirm: async (email: string) => {
    previewAuthState = { configured: true, user: { id: "usr_preview_cloud", email, displayName: email.split("@")[0] }, expiresAt: Math.floor(Date.now() / 1000) + 3600, error: "", providers: { email: true, google: false } };
    return structuredClone(previewAuthState);
  },
  signInWithOAuth: async () => { throw new Error("Google sign-in is not configured."); },
  requestPasswordReset: async (email: string) => ({ ...(await desktopBridge.signIn(email, "")), recovery: true }),
  updateCloudPassword: async () => structuredClone(previewAuthState),
  updateCloudProfile: async (displayName: string) => {
    if (previewAuthState.user) previewAuthState = { ...previewAuthState, user: { ...previewAuthState.user, displayName } };
    return structuredClone(previewAuthState);
  },
  resendConfirmation: async () => structuredClone(previewAuthState),
  signIn: async (email: string) => {
    previewAuthState = { configured: true, user: { id: "usr_preview_cloud", email, displayName: email.split("@")[0] }, expiresAt: Math.floor(Date.now() / 1000) + 3600, error: "" };
    return structuredClone(previewAuthState);
  },
  signUp: async (email: string) => {
    previewAuthState = { configured: true, user: { id: "usr_preview_cloud", email, displayName: email.split("@")[0] }, expiresAt: Math.floor(Date.now() / 1000) + 3600, error: "" };
    return structuredClone(previewAuthState);
  },
  signOut: async () => {
    previewAuthState = { configured: true, user: null, expiresAt: 0, error: "" };
    return structuredClone(previewAuthState);
  },
  getAuthAccessToken: async () => "preview-token",
  updateLocalIdentity: async (patch: { displayName: string }) => {
    const displayName = String(patch.displayName || "").replace(/\s+/g, " ").trim();
    if (!displayName || displayName.length > 80) throw new Error("Display names must be between 1 and 80 characters.");
    previewLocalIdentity = { ...previewLocalIdentity, displayName, updatedAt: new Date().toISOString() };
    return structuredClone(previewLocalIdentity);
  },
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
  listExtensionSources: async () => structuredClone(previewExtensionSources),
  saveExtensionSources: async (sources: ExtensionSource[]) => sources,
  resetExtensionSources: async () => structuredClone(previewExtensionSources),
  listExtensions: async () => ({
    items: structuredClone(previewExtensionItems),
    total: previewExtensionItems.length,
    sources: structuredClone(previewExtensionSources),
    syncedAt: new Date().toISOString(),
  }),
  previewExtension: async ({ id }: { id: string }) => {
    const item = previewExtensionItems.find((candidate) => candidate.id === id);
    if (!item) throw new Error("Extension not found.");
    const file = item.files?.[0];
    return {
      id,
      filename: file?.path || (item.type === "mcp" ? "mcp.json" : "README.md"),
      language: item.type === "mcp" ? "json" : "markdown",
      content: file?.content || (item.config ? JSON.stringify(item.config, null, 2) : item.description),
      item: structuredClone(item),
    };
  },
  installExtension: async ({ id }: { id: string }) => {
    const item = previewExtensionItems.find((candidate) => candidate.id === id);
    if (!item) throw new Error("Extension not found.");
    return { item: { ...structuredClone(item), installed: true }, path: `/preview/.agents/skills/${item.name.toLowerCase().replaceAll(/\s+/g, "-")}`, scope: "workspace" as const };
  },
  listInstalledExtensions: async () => ({
    skills: previewSkills.map((skill) => ({ id: `skill:${skill.path}`, type: "skill" as const, name: skill.name, path: skill.path, detail: `${skill.collectionName} · ${skill.category}`, description: skill.description })),
    plugins: [],
  }),
  readExtensionFile: async (path: string) => {
    const skill = previewSkills.find((candidate) => candidate.path === path);
    if (!skill) throw new Error("Skill not found.");
    return { filename: "SKILL.md", content: skill.content };
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
  inspectWorkspacePath: async (_workspace: string, filePath: string) => ({
    path: filePath, type: ["notes", "paper", "src"].includes(filePath) ? "directory" as const : "file" as const,
  }),
  readWorkspaceFile: async (_workspace: string, filePath: string) => {
    const imageUrl = previewArtifactImages[filePath];
    if (imageUrl) return { name: filePath.split("/").at(-1) || filePath, path: filePath, kind: "image" as const, size: 1_200_000, modifiedAt: new Date().toISOString(), previewUrl: imageUrl };
    if (filePath.endsWith(".csv")) return { name: filePath.split("/").at(-1) || filePath, path: filePath, kind: "text" as const, size: 12_000, modifiedAt: new Date().toISOString(), content: "model,accuracy,latency_ms\nbaseline,71.2,42\nours,78.9,39\nours + rerank,81.4,53\n" };
    if (filePath.endsWith(".json")) return { name: filePath.split("/").at(-1) || filePath, path: filePath, kind: "text" as const, size: 900, modifiedAt: new Date().toISOString(), content: "{\n  \"model\": \"retrieval-v3\",\n  \"seeds\": [13, 21, 34],\n  \"budget\": 4096\n}\n" };
    if (filePath.endsWith(".html")) return { name: filePath.split("/").at(-1) || filePath, path: filePath, kind: "text" as const, size: 3_600, modifiedAt: new Date().toISOString(), content: "<!doctype html><html><head><style>body{font-family:system-ui;margin:0;padding:32px;background:#f5f2e9;color:#24231f}table{border-collapse:collapse;width:100%;margin-top:16px}th,td{border:1px solid #d8d2c4;padding:8px;text-align:left}th{background:#ebe5d7}</style></head><body><h2>Retrieval ablation</h2><p>Held-out accuracy across retrieval budgets.</p><table><tr><th>Budget</th><th>Baseline</th><th>Ours</th></tr><tr><td>2k</td><td>68.1</td><td>74.6</td></tr><tr><td>4k</td><td>71.2</td><td>78.9</td></tr><tr><td>8k</td><td>72.0</td><td>81.4</td></tr></table></body></html>" };
    if (filePath.endsWith(".pdf")) return { name: filePath.split("/").at(-1) || filePath, path: filePath, kind: "pdf" as const, size: 2_400_000, modifiedAt: new Date().toISOString() };
    return {
      name: filePath.split("/").at(-1) || filePath,
      path: filePath,
      kind: filePath.endsWith(".md") ? "markdown" as const : "text" as const,
      size: previewFileContents.get(filePath)?.length ?? 92,
      modifiedAt: new Date().toISOString(),
      content: previewFileContents.get(filePath) ?? (filePath.endsWith(".md") ? "# Research brief\n\nBrowser preview of the active workspace." : filePath.endsWith(".tex") ? "\\documentclass{article}\n\\usepackage{amsmath}\n\\title{Archimedes Paper}\n\\author{}\n\\begin{document}\n\\maketitle\n\\section{Introduction}\nWrite the paper here and the PDF preview updates automatically.\n\\end{document}\n" : "def run_experiment():\n    return {\"status\": \"ready\"}\n"),
    };
  },
  writeWorkspaceFile: async (_workspace: string, filePath: string, content: string) => {
    previewFileContents.set(filePath, content);
    for (const listener of previewWorkspaceListeners) listener({ path: filePath });
    return { name: filePath.split("/").at(-1) || filePath, path: filePath, kind: filePath.endsWith(".md") ? "markdown" as const : "text" as const, size: content.length, modifiedAt: new Date().toISOString(), content };
  },
  listArtifacts: async (threadId: string) => {
    ensurePreviewArtifacts(threadId);
    return structuredClone(previewArtifacts.filter((artifact) => artifact.thread_id === threadId));
  },
  markArtifactsSeen: async (threadId: string) => {
    ensurePreviewArtifacts(threadId);
    let marked = 0;
    for (const artifact of previewArtifacts) if (artifact.thread_id === threadId && !artifact.seen) { artifact.seen = true; marked += 1; }
    return { marked };
  },
  countUnseenArtifacts: async (threadId: string) => {
    ensurePreviewArtifacts(threadId);
    return previewArtifacts.filter((artifact) => artifact.thread_id === threadId && !artifact.seen).length;
  },
  deleteArtifact: async (id: string) => {
    const index = previewArtifacts.findIndex((artifact) => artifact.id === id);
    if (index >= 0) previewArtifacts.splice(index, 1);
    return { deleted: index >= 0 };
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
  importLocalLibraryPaper: async () => { throw new Error("Local PDF import is available in the desktop app."); },
  getResearchTurnImage: async (threadId: string, turnId: string, position: number) => previewThreads.find((thread) => thread.id === threadId)?.messages.find((message) => message.turn_id === turnId && message.role === "user")?.attachments?.find((item) => item.position === position)?.imageData ?? null,
  getResearchThread: async (threadId: string) => {
    const thread = previewThreads.find((candidate) => candidate.id === threadId);
    if (!thread) throw new Error("Research session not found.");
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
    previewDefaultWorkspaceName(project.id);
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
  listProjectMembers: async (projectId: string) => structuredClone(previewProjectMembers.filter((member) => member.project_id === projectId)),
  addProjectMember: async (input: { projectId: string; userId: string; role?: ProjectMember["role"]; displayName?: string; email?: string }) => {
    const member: ProjectMember = { project_id: input.projectId, user_id: input.userId, role: input.role || "commenter", joined_at: new Date().toISOString(), invited_by: previewLocalIdentity.userId, display_name: input.displayName || input.userId, email: input.email || "", avatar_color: "" };
    previewProjectMembers.push(member);
    return structuredClone(member);
  },
  updateProjectMemberRole: async (projectId: string, userId: string, role: ProjectMember["role"]) => {
    const member = previewProjectMembers.find((candidate) => candidate.project_id === projectId && candidate.user_id === userId);
    if (!member || member.role === "owner") return member ? structuredClone(member) : null;
    member.role = role;
    return structuredClone(member);
  },
  removeProjectMember: async (projectId: string, userId: string) => {
    const index = previewProjectMembers.findIndex((member) => member.project_id === projectId && member.user_id === userId && member.role !== "owner");
    if (index >= 0) previewProjectMembers.splice(index, 1);
    return { removed: index >= 0 };
  },
  getCollaborationStatus: async () => ({ signedIn: false, user: null, error: "Cloud collaboration is available in the desktop app." }),
  joinProjectPresence: async () => ({ joined: false }),
  updateProjectPresence: async () => ({ updated: false }),
  leaveProjectPresence: async () => ({ left: true }),
  onPresenceUpdate: () => () => {},
  listCloudProjects: async () => [],
  publishProject: async () => { throw new Error("Cloud collaboration is available in the desktop app."); },
  syncCloudProject: async () => { throw new Error("Cloud collaboration is available in the desktop app."); },
  addCloudProjectMember: async () => { throw new Error("Cloud collaboration is available in the desktop app."); },
  updateCloudProjectMember: async () => { throw new Error("Cloud collaboration is available in the desktop app."); },
  removeCloudProjectMember: async () => { throw new Error("Cloud collaboration is available in the desktop app."); },
  importCloudProject: async () => { throw new Error("Cloud collaboration is available in the desktop app."); },
  syncProjectLibraries: async () => { throw new Error("Cloud collaboration is available in the desktop app."); },
  syncProjectAnnotations: async () => { throw new Error("Cloud collaboration is available in the desktop app."); },
  syncProjectThreads: async () => { throw new Error("Cloud collaboration is available in the desktop app."); },
  exportProject: async () => ({}),
  listRemoteAudit: async () => [],
  getSharedDocument: async () => null,
  applySharedDocumentUpdate: async () => { throw new Error("Shared documents are available in the desktop app."); },
  listAgentRuns: async () => [],
  startAgentRun: async () => { throw new Error("Shared agent runs are available in the desktop app."); },
  joinAgentRun: async () => { throw new Error("Shared agent runs are available in the desktop app."); },
  enqueueAgentPrompt: async () => { throw new Error("Shared agent runs are available in the desktop app."); },
  claimAgentPrompt: async () => null,
  finishAgentRun: async () => { throw new Error("Shared agent runs are available in the desktop app."); },
  requestAgentAction: async () => { throw new Error("Shared agent runs are available in the desktop app."); },
  resolveAgentAction: async () => ({ resolved: false }),
  createShareLink: async () => { throw new Error("Cloud sharing is available in the desktop app."); },
  revokeShareLink: async () => ({ revoked: false }),
  redeemShareLink: async () => { throw new Error("Guest links are available in the desktop app."); },
  listAuditEvents: async (projectId?: string | null) => structuredClone([...previewAuditEvents].reverse()),
  listComments: async (input: { resourceType: ResearchComment["resource_type"]; resourceId: string; includeResolved?: boolean }) => structuredClone(previewComments.filter((comment) => comment.resource_type === input.resourceType && comment.resource_id === input.resourceId && (input.includeResolved !== false || !comment.resolved_at))),
  createComment: async (input: { resourceType: ResearchComment["resource_type"]; resourceId: string; body: string; parentId?: string | null; anchor?: Record<string, unknown> }) => {
    const now = new Date().toISOString();
    const comment: ResearchComment = { id: crypto.randomUUID(), project_id: "preview-general", resource_type: input.resourceType, resource_id: input.resourceId, parent_id: input.parentId || null, anchor_json: JSON.stringify(input.anchor || {}), anchor: input.anchor || {}, body: input.body, author_id: previewLocalIdentity.userId, author_name: previewLocalIdentity.displayName, resolved_at: null, created_at: now, updated_at: now };
    previewComments.push(comment);
    return structuredClone(comment);
  },
  resolveComment: async (input: { id: string; resolved?: boolean }) => {
    const comment = previewComments.find((candidate) => candidate.id === input.id);
    if (!comment) return null;
    comment.resolved_at = input.resolved === false ? null : new Date().toISOString();
    return structuredClone(comment);
  },
  deleteComment: async (input: { id: string }) => {
    const index = previewComments.findIndex((comment) => comment.id === input.id);
    if (index >= 0) previewComments.splice(index, 1);
    return { deleted: index >= 0 };
  },
  setResearchThreadVisibility: async (threadId: string, visibility: "project" | "private") => {
    const thread = previewThreads.find((candidate) => candidate.id === threadId) || previewArchivedThreads.find((candidate) => candidate.id === threadId);
    if (!thread) throw new Error("Research session not found.");
    thread.visibility = visibility === "private" ? "private" : "project";
    return { visibility: thread.visibility };
  },
  createResearchThreadSnapshot: async (threadId: string) => {
    const thread = previewThreads.find((candidate) => candidate.id === threadId);
    if (!thread) throw new Error("Research session not found.");
    const snapshot = { id: crypto.randomUUID(), thread_id: thread.id, project_id: thread.project_id, sequence: thread.events?.length || 0, created_at: new Date().toISOString(), manifest: { version: 1, thread: { id: thread.id, title: thread.title, visibility: thread.visibility }, sequence: thread.events?.length || 0, turns: thread.turns, events: thread.events ?? [], references: [], artifacts: [] } };
    previewThreadSnapshots.unshift(snapshot);
    return structuredClone(snapshot);
  },
  listResearchThreadSnapshots: async (threadId: string) => structuredClone(previewThreadSnapshots.filter((snapshot) => snapshot.thread_id === threadId)),
  getResearchThreadSnapshot: async (snapshotId: string) => structuredClone(previewThreadSnapshots.find((snapshot) => snapshot.id === snapshotId) || null),
  createResearchThread: async (input: { projectId?: string; workspacePath?: string; mode?: ResearchMode; visibility?: "project" | "private"; title?: string }): Promise<ResearchThreadDetail> => {
    const now = new Date().toISOString();
    const thread: ResearchThreadDetail = { id: crypto.randomUUID(), project_id: input.projectId || "preview-general", owner_id: previewLocalIdentity.userId, visibility: input.visibility || "project", title: input.title || "New conversation", mode: input.mode || "free-chat", status: "idle", context_summary: "", workspace_path: input.workspacePath || previewWorkspace, turn_count: 0, created_at: now, updated_at: now, last_turn_at: now, archived_at: null, turns: [], messages: [], changeSets: [], events: [] };
    previewThreads.unshift(thread);
    return structuredClone(thread);
  },
  forkResearchThread: async (threadId: string, _workspace?: string, side = false) => {
    const source = previewThreads.find((thread) => thread.id === threadId);
    if (!source) throw new Error("Research session not found.");
    const copy = structuredClone(source);
    const ids = new Map(copy.turns.map((turn) => [turn.id, crypto.randomUUID()]));
    copy.id = crypto.randomUUID();
    copy.title = `${side ? "Side" : "Fork"}: ${source.title}`;
    copy.created_at = copy.updated_at = new Date().toISOString();
    copy.turns = copy.turns.map((turn) => ({ ...turn, id: ids.get(turn.id)!, thread_id: copy.id, task_id: null }));
    copy.messages = copy.messages.map((message) => ({ ...message, id: `${ids.get(message.turn_id)}:${message.role}`, turn_id: ids.get(message.turn_id)! }));
    copy.events = copy.events?.map((event) => ({ ...event, id: crypto.randomUUID(), turn_id: ids.get(event.turn_id)! }));
    copy.context_summary_through_turn_id = ids.get(source.context_summary_through_turn_id || "") || null;
    copy.changeSets = [];
    copy.pending_actions = 0;
    previewThreads.unshift(copy);
    return structuredClone(copy);
  },
  undoResearchTurn: async (threadId: string) => {
    const thread = previewThreads.find((item) => item.id === threadId);
    const last = thread?.turns.at(-1);
    if (!thread || !last) throw new Error("There is no turn to undo.");
    const backup = await previewBridge.forkResearchThread(threadId);
    await previewBridge.setResearchThreadVisibility(backup.id, "private");
    const storedBackup = previewThreads.find((item) => item.id === backup.id)!;
    storedBackup.title = `Before undo: ${thread.title}`;
    await previewBridge.archiveResearchThread(backup.id);
    thread.turns.pop();
    thread.messages = thread.messages.filter((item) => item.turn_id !== last.id);
    thread.events = thread.events?.filter((event) => event.turn_id !== last.id);
    thread.changeSets = thread.changeSets.filter((item) => item.turnId !== last.id);
    thread.turn_count = thread.turns.length;
    thread.context_summary = "";
    thread.context_summary_through_turn_id = null;
    return { thread: structuredClone(thread), prompt: last.user_message, backupThreadId: backup.id };
  },
  compactResearchThread: async () => { throw new Error("Context compaction requires a configured model in the desktop app."); },
  exportResearchThread: async (threadId: string) => {
    const thread = previewThreads.find((item) => item.id === threadId);
    if (!thread) throw new Error("Research session not found.");
    const url = URL.createObjectURL(new Blob([JSON.stringify(thread, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "conversation.json";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return { canceled: false };
  },
  archiveResearchThread: async (id: string, archived = true) => {
    const source = archived ? previewThreads : previewArchivedThreads;
    const target = archived ? previewArchivedThreads : previewThreads;
    const index = source.findIndex((thread) => thread.id === id);
    if (index < 0) throw new Error("Research session not found.");
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
  getAgentBackendConfig: async () => ({ backend: "api", binary: "codex", model: "" }),
  saveAgentBackendConfig: async () => { throw new Error("External Agent backends require the desktop app."); },
  checkAgentBackend: async () => { throw new Error("Codex detection requires the desktop app."); },
  listCodexModelCatalog: async () => { throw new Error("Codex detection requires the desktop app."); },
  steerNativeAgent: async () => { throw new Error("Native steering requires the desktop app."); },
  answerNativeAgentQuestion: async () => { throw new Error("Native questions require the desktop app."); },
  getModelCapabilities: async () => previewModelCapabilities,
  listProviderModels: async () => ({ models: [], source: "live" as const }),
  saveModelConfig: async ({ provider, baseUrl, model }: ModelConfigInput) => ({ provider, baseUrl, model, hasApiKey: true, source: "saved" as const }),
  testModelConfig: async ({ model }: ModelConfigInput) => ({ ok: true, latencyMs: 184, resolvedModel: model }),
  transcribeSpeech: async () => ({ text: "Voice input transcription preview." }),
  requestMicrophoneAccess: async () => true,
  getWebSearchConfig: async () => ({ provider: "brave" as const, hasApiKey: false }),
  saveWebSearchConfig: async () => ({ provider: "brave" as const, hasApiKey: true }),
  readClipboardText: async () => "",
  writeClipboardText: async () => undefined,
  readClipboardImage: async () => null,
  runAgent: async ({ prompt, workspace, threadId, projectId, visibility = "project", mode, reasoningEffort = "medium", contextLength = "standard", contextItems, clientRunId, capabilities, origin, title, backend }: { prompt: string; workspace: string; threadId?: string; projectId?: string; visibility?: "project" | "private"; mode: ResearchMode; reasoningEffort?: ReasoningEffort; contextLength?: ContextLength; contextItems?: ContextAttachment[]; clientRunId?: string; capabilities?: { write: "ask" | "deny"; command: "ask" | "deny" }; origin?: "research" | "paper"; title?: string; backend?: AgentBackendConfig["backend"] }) => {
    const emit = (event: AgentEvent) => emitPreviewAgentEvent({ ...event, clientRunId });
    const now = new Date().toISOString();
    let thread = previewThreads.find((candidate) => candidate.id === threadId);
    if (!thread) {
      const resolvedProjectId = projectId || previewProjects[0]?.id || "preview-general";
      const projectWorkspace = previewProjects.find((candidate) => candidate.id === resolvedProjectId)?.workspace_path;
      thread = { id: crypto.randomUUID(), project_id: resolvedProjectId, owner_id: previewLocalIdentity.userId, visibility: visibility === "private" ? "private" : "project", kind: origin === "paper" ? "paper" : "research", harness: origin === "paper" ? null : backend || "api", title: title || prompt.slice(0, 72), mode, status: "running", context_summary: "", workspace_path: workspace || projectWorkspace || previewWorkspace, pending_actions: 0, turn_count: 0, created_at: now, updated_at: now, last_turn_at: now, archived_at: null, turns: [], messages: [], changeSets: [], events: [] };
      previewThreads.unshift(thread);
    }
    const turnId = crypto.randomUUID();
    const taskId = crypto.randomUUID();
    thread.messages.push({ id: `${turnId}:user`, turn_id: turnId, role: "user", text: prompt, attachments: (contextItems ?? []).map((item, position) => ({ type: item.type, name: item.name, path: item.path, detail: item.detail, size: item.image?.sizeBytes ?? item.size, position, threadId: thread!.id, imageData: item.image?.dataUrl })), created_at: now });
    thread.events ??= [];
    const appendPreviewEvent = (type: string, payload: unknown) => {
      thread!.events!.push({ id: crypto.randomUUID(), turn_id: turnId, sequence: thread!.events!.length + 1, type, payload, created_at: new Date().toISOString() });
    };
    appendPreviewEvent("user_message", { text: prompt, mode, reasoningEffort, contextLength });
    emit({ type: "status", threadId: thread.id, turnId, title: "Research turn started", detail: `Browser preview Agent · thinking: ${reasoningEffort} · context: ${contextLength}` });
    const actions: AgentAction[] = [];
    if (capabilities?.write !== "deny" && /(write|draft|note|生成|写入)/i.test(prompt)) {
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
      emit({ type: "tool", threadId: thread.id, turnId, title: "write artifact", detail: "Prepared a draft for approval" });
    }
    const selectedMode = researchModes.find((candidate) => candidate.id === mode)?.label ?? "Research";
    const contextNote = contextItems?.length ? ` I received ${contextItems.length} attached context item${contextItems.length === 1 ? "" : "s"}.` : "";
    const response = `Preview Agent (${selectedMode}): I reviewed the active research workspace and framed the request as an evidence-backed next step.${contextNote} In the desktop app, this same request will use your configured model and restricted workspace tools.`;
    appendPreviewEvent("assistant_step", { content: "Reviewing the research request and available workspace context.", protocol: "preview", tool_calls: actions.length ? [{ id: actions[0].id, function: { name: "write_file", arguments: JSON.stringify(actions[0].payload) } }] : [] });
    emit({ type: "assistant_delta", threadId: thread.id, turnId, title: "Writing response", detail: "Streaming model output", delta: response });
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
    emit({ type: "complete", threadId: thread.id, turnId, title: "Research turn complete", detail: `${actions.length} approval item${actions.length === 1 ? "" : "s"}` });
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
      if (action.payload.path && action.payload.content) {
        previewFileContents.set(action.payload.path, action.payload.content);
        for (const listener of previewWorkspaceListeners) listener({ path: action.payload.path });
      }
      const turnId = thread?.turns.find((turn) => turn.task_id === action.task_id)?.id;
      const changeSet: WorkspaceChangeSet = { id: action.id, actionId: action.id, taskId: action.task_id, threadId: thread?.id, turnId, kind: action.kind, changes: [action.payload.change], createdAt: action.created_at };
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
  getWorkbenchSettings: async () => {
    try {
      const saved = JSON.parse(window.localStorage.getItem("archimedes-workbench-settings") || "null");
      return saved && typeof saved === "object" ? saved : { version: DEFAULT_WORKBENCH_PREFERENCES.version, order: [...DEFAULT_WORKBENCH_PREFERENCES.order], hidden: [...DEFAULT_WORKBENCH_PREFERENCES.hidden] };
    } catch {
      return { version: DEFAULT_WORKBENCH_PREFERENCES.version, order: [...DEFAULT_WORKBENCH_PREFERENCES.order], hidden: [...DEFAULT_WORKBENCH_PREFERENCES.hidden] };
    }
  },
  saveWorkbenchSettings: async (input: { version?: number; order: string[]; hidden: string[] }) => {
    const next = normalizeWorkbenchPreferences(input);
    window.localStorage.setItem("archimedes-workbench-settings", JSON.stringify(next));
    return next;
  },
  resetWorkbenchSettings: async () => {
    window.localStorage.removeItem("archimedes-workbench-settings");
    return { version: DEFAULT_WORKBENCH_PREFERENCES.version, order: [...DEFAULT_WORKBENCH_PREFERENCES.order], hidden: [...DEFAULT_WORKBENCH_PREFERENCES.hidden] };
  },
  openExternalUrl: async (url: string) => {
    if (typeof window !== "undefined") window.open(url, "_blank", "noopener,noreferrer");
    return { opened: true };
  },
  getWorkbenchNote: async (key: string) => ({ content: window.localStorage.getItem(`archimedes-workbench-note:${key}`) || "", updatedAt: null }),
  saveWorkbenchNote: async (key: string, content: string) => {
    if (content.trim()) window.localStorage.setItem(`archimedes-workbench-note:${key}`, content);
    else window.localStorage.removeItem(`archimedes-workbench-note:${key}`);
    return { content, updatedAt: content.trim() ? new Date().toISOString() : null };
  },
  deleteWorkbenchNote: async (key: string) => {
    const existed = window.localStorage.getItem(`archimedes-workbench-note:${key}`) !== null;
    window.localStorage.removeItem(`archimedes-workbench-note:${key}`);
    return { deleted: existed };
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
  onPaperReviewEvent: () => () => undefined,
  onPaperPresentationEvent: () => () => undefined,
  cancelPaperDeepReading: async () => ({ cancelled: true }),
  exportPaperDeepReading: async () => { throw new Error("Reading export is available in the desktop app."); },
  getPaperReview: async () => null,
  runPaperReview: async () => { throw new Error("Paper review runs in the desktop app."); },
  cleanupPaperReviewRuns: async () => ({ threadIds: [] }),
  getPaperPresentation: async () => null,
  runPaperPresentation: async () => { throw new Error("Paper presentations run in the desktop app."); },
  revealPaperPresentation: async () => undefined,
  listReproductions: async () => [],
  getSidebarSettings: async () => readPreviewSidebarSettings(),
  setCoreModuleEnabled: async (id: string, enabled: boolean) => {
    if (!Object.hasOwn(researchAppMetadata, id)) throw new Error(`Unknown research app: ${id}`);
    const current = readPreviewSidebarSettings();
    const disabled = new Set(current.disabledCore);
    if (enabled) disabled.delete(id); else disabled.add(id);
    const next = { ...current, disabledCore: [...disabled] };
    localStorage.setItem("archimedes-research-apps", JSON.stringify(next));
    return next;
  },
  setSidebarLayout: async () => readPreviewSidebarSettings(),
  listSidebarPlugins: async () => [],
  setSidebarPluginEnabled: async () => [],
  removeSidebarPlugin: async () => [],
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

const FileCodeEditor = lazy(() => import("./FileCodeEditor"));

// Sidebar modules are the built-in plugins: they load as separate chunks, but
// the registry in sidebar-registry.tsx stays the single source of truth.
const LibraryView = lazy(() => import("./LibraryView"));
const DataChartsView = lazy(() => import("./DataChartsView"));
const DataAnalysisView = lazy(() => import("./DataAnalysisView"));
const PaperToSlidesView = lazy(() => import("./PaperToSlidesView"));
const ImageCreationView = lazy(() => import("./ImageCreationView"));
const BenchmarkRadarView = lazy(() => import("./BenchmarkRadarView"));
const NewsView = lazy(() => import("./NewsView"));
const PaperReviewView = lazy(() => import("./PaperReviewView"));
const ReproduceView = lazy(() => import("./ReproduceView"));
const ExtensionsView = lazy(() => import("./ExtensionsView"));
const PaperWritingView = lazy(() => import("./PaperWritingView"));

const ACTIVE_PROJECT_STORAGE_PREFIX = "archimedes-active-project:";

function preferredProjectKey(workspacePath: string) {
  return `${ACTIVE_PROJECT_STORAGE_PREFIX}${workspacePath}`;
}

function readPreferredProject(workspacePath: string) {
  try { return window.localStorage.getItem(preferredProjectKey(workspacePath)) || null; } catch { return null; }
}

function rememberPreferredProject(workspacePath: string, projectId: string) {
  try { window.localStorage.setItem(preferredProjectKey(workspacePath), projectId); } catch { /* storage is optional */ }
}

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

function readResearchPanelOpen() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem("archimedes-research-panel-open") === "true";
}

function readPinnedPathThreadId() {
  if (typeof window === "undefined") return null;
  const stored = window.localStorage.getItem("archimedes-research-path-pin");
  return stored && stored.trim() ? stored : null;
}

function systemTheme(): AppTheme {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return "charcoal";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "charcoal" : "paper";
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
  const confirm = useConfirm();
  const { t } = useUISettings();
  const [appearance, setAppearance] = useState<AppearanceSettings>(readAppearance);
  const [systemAppearance, setSystemAppearance] = useState<AppTheme>(systemTheme);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsSection, setSettingsSection] = useState<SettingsSection>("general");
  const [sessionTools, setSessionTools] = useState<SessionToolPreferences>(readSessionToolPreferences);
  const [localIdentity, setLocalIdentity] = useState<LocalIdentity | null>(null);
  const [authState, setAuthState] = useState<AuthState | null>(null);
  const [availableAppUpdate, setAvailableAppUpdate] = useState<{ version: string; url?: string } | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"choice" | "password" | "signup" | "reset" | "recovery">("choice");
  const [presenceMembers, setPresenceMembers] = useState<PresenceMember[]>([]);
  const theme = resolveTheme(appearance.preset, systemAppearance);
  const themePreference = appearance.preset;
  const setThemePreference = (preset: ThemePreset) => setAppearance((current) => ({ ...current, preset }));
  const [sidebarWidth, setSidebarWidth] = useState(readSidebarWidth);
  const [sidebarOrder, setSidebarOrder] = useState(readSidebarOrder);
  const [sidebarOrderAnnouncement, setSidebarOrderAnnouncement] = useState("");
  const sidebarItemDragRef = useRef<{ group: "apps"; id: string } | null>(null);
  const suppressSidebarAppClickUntil = useRef(0);
  const [sidebarAppDragging, setSidebarAppDragging] = useState<string | null>(null);
  const [sidebarAppDropTarget, setSidebarAppDropTarget] = useState<string | null>(null);
  const [sidebarHidden, setSidebarHidden] = useState(readSidebarHidden);
  const sidebarDragRef = useRef<{ startX: number; startWidth: number } | null>(null);
  const [mainSection, setMainSection] = useState<MainSection>("chat");
  const [pluginEntries, setPluginEntries] = useState<SidebarEntry[]>([]);
  const [reproduceId, setReproduceId] = useState<string | null>(null);
  const [extensionsTab, setExtensionsTab] = useState<ExtensionsTab>("installed");
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [imageCreationOpened, setImageCreationOpened] = useState(false);
  const [dataChartsOpened, setDataChartsOpened] = useState(false);
  const [dataAnalysisOpened, setDataAnalysisOpened] = useState(false);
  const [dailyStartMode, setDailyStartMode] = useState<DailyDiscoveryMode | "conference">("latest");
  const [libraryRefreshVersion, setLibraryRefreshVersion] = useState(0);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [sideThread, setSideThread] = useState<ResearchThreadDetail | null>(null);
  const [sideBusy, setSideBusy] = useState(false);
  const commandLockRef = useRef(false);
  const [events, setEvents] = useState<TimelineEvent[]>(initialEvents);
  const [trajectoryEvents, setTrajectoryEvents] = useState<ResearchEvent[]>([]);
  const [workspace, setWorkspace] = useState(DEFAULT_WORKSPACE);
  const [workspaceReady, setWorkspaceReady] = useState(false);
  const [projects, setProjects] = useState<ResearchProject[]>([]);
  const [archivedProjects, setArchivedProjects] = useState<ResearchProject[]>([]);
  const [threads, setThreads] = useState<ResearchThread[]>([]);
  const [archivedThreads, setArchivedThreads] = useState<ResearchThread[]>([]);
  const [workspaces, setWorkspaces] = useState<ProjectWorkspace[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);
  const [creatingWorkspace, setCreatingWorkspace] = useState(false);
  const [workspaceDialog, setWorkspaceDialog] = useState<
    | { mode: "create"; projectId: string; kind: ProjectWorkspaceKind }
    | { mode: "rename"; workspace: ProjectWorkspace }
    | null
  >(null);
  const [workspaceSuggestion, setWorkspaceSuggestion] = useState("");
  const [workspaceDialogError, setWorkspaceDialogError] = useState("");
  const [sessionSwitcherSignal, setSessionSwitcherSignal] = useState(0);
  const [threadVisibility, setThreadVisibility] = useState<"project" | "private">("project");
  const [shareSnapshot, setShareSnapshot] = useState<Awaited<ReturnType<ResearchDeskBridge["createResearchThreadSnapshot"]>> | null>(null);
  useEffect(() => { setShareSnapshot(null); }, [activeThreadId]);
  const [commentsOpen, setCommentsOpen] = useState(false);
  useEffect(() => { setCommentsOpen(false); }, [activeThreadId]);
  const [runningThreadId, setRunningThreadId] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<PendingAction | null>(null);
  const [workbenchOpen, setWorkbenchOpen] = useState(false);
  const [workbenchPreferences, setWorkbenchPreferences] = useState<WorkbenchTabPreferences>(DEFAULT_WORKBENCH_PREFERENCES);
  const workbenchLayout = workbenchPreferences.layout;
  /** A tab can stay selected in a second pane while another pane is focused. */
  const workbenchActiveTabs = useMemo(() => activeWorkbenchPaneTabs(workbenchLayout), [workbenchLayout]);
  const [noteValues, setNoteValues] = useState<Record<string, string>>({});
  const [noteLoadedKey, setNoteLoadedKey] = useState<string | null>(null);
  const [noteSaveState, setNoteSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [seenChangeSetIds, setSeenChangeSetIds] = useState<Set<string>>(new Set());
  const [artifactsBadge, setArtifactsBadge] = useState(0);
  const [artifactsVersion, setArtifactsVersion] = useState(0);
  const [trajectoryFocusOrdinal, setTrajectoryFocusOrdinal] = useState<number | null>(null);
  const [journeySettings, setJourneySettings] = useState<JourneySettings>(defaultJourneySettings);
  const [terminalSettings, setTerminalSettings] = useState<TerminalSettings | null>(null);
  const [terminalSettingsOpen, setTerminalSettingsOpen] = useState(false);
  const [terminalSettingsMode, setTerminalSettingsMode] = useState<"settings" | "onboarding">("settings");
  const [workbenchWidth, setWorkbenchWidth] = useState(() => {
    const saved = Number(localStorage.getItem("archimedes-workbench-width"));
    return Number.isFinite(saved) && saved > 0 ? clampWorkbenchWidth(saved) : defaultWorkbenchWidth();
  });
  const workbenchFilesPaneWidth = useMemo(() => {
    const pane = workbenchLayout.panes.find((entry) => entry.tabs.includes("files"));
    if (!pane || workbenchLayout.orientation === "column") return workbenchWidth;
    return Math.max(240, Math.round(workbenchWidth * pane.size / 100));
  }, [workbenchLayout, workbenchWidth]);
  const [runningSession, setRunningSession] = useState<string | null>(null);
  const [agentBusy, setAgentBusy] = useState(false);
  const [interrupting, setInterrupting] = useState(false);
  const [chatViewNonce, setChatViewNonce] = useState(0);
  const [researchMode, setResearchMode] = useState<ResearchMode>("standard");
  const [acceptedStages, setAcceptedStages] = useState<ResearchStageId[]>(() => {
    const activeIndex = Math.max(0, researchStages.findIndex((stage) => stage.mode === researchMode));
    return researchStages.slice(0, activeIndex).map((stage) => stage.id);
  });
  const [staleStages, setStaleStages] = useState<ResearchStageId[]>([]);
  const [selectedStage, setSelectedStage] = useState<ResearchStageId | null>(null);
  const [branchCount, setBranchCount] = useState(1);
  const [journeyNotice, setJourneyNotice] = useState("");
  const [researchPanelOpen, setResearchPanelOpen] = useState(readResearchPanelOpen);
  const [pinnedPathThreadId, setPinnedPathThreadId] = useState<string | null>(readPinnedPathThreadId);
  const [proactiveNotice, setProactiveNotice] = useState("");
  const [reasoningEffort, setReasoningEffort] = useState<ReasoningEffort>(readReasoningEffort);
  const [contextLength, setContextLength] = useState<ContextLength>(readContextLength);
  const [modelCapabilities, setModelCapabilities] = useState<ModelCapabilities>(previewModelCapabilities);
  const [nativeBackend, setNativeBackend] = useState<AgentBackendConfig | null>(null);
  const [boundHarness, setBoundHarness] = useState<AgentBackendConfig["backend"] | null>(null);
  const selectedHarness = boundHarness || nativeBackend?.backend || "api";
  const selectedNativeBackend = selectedHarness !== "api"
    ? { binary: selectedHarness, model: "", ...nativeBackend, ...nativeBackend?.profiles?.[selectedHarness], backend: selectedHarness }
    : null;
  const [nativeStream, setNativeStream] = useState<{ threadId: string; events: ResearchEvent[] }>({ threadId: "", events: [] });
  const [nativeQuestions, setNativeQuestions] = useState<Array<{ threadId: string; question: NativeAgentQuestion }>>([]);
  const combinedTrajectoryEvents = useMemo(() => nativeStream.threadId === activeThreadId ? [...trajectoryEvents, ...nativeStream.events] : trajectoryEvents, [trajectoryEvents, nativeStream, activeThreadId]);
  useEffect(() => {
    if (settingsOpen) return;
    let active = true;
    void desktopBridge.getAgentBackendConfig().then((config) => { if (active) setNativeBackend(config); }).catch(() => { if (active) setNativeBackend(null); });
    return () => { active = false; };
  }, [settingsOpen]);
  const [contextItems, setContextItems] = useState<ContextAttachment[]>([]);
  const [fileTree, setFileTree] = useState<WorkspaceFileTree>({ entries: [], count: 0, truncated: false });
  const [loadingDirectories, setLoadingDirectories] = useState<Set<string>>(new Set());
  const [openFiles, setOpenFiles] = useState<WorkspaceFilePreview[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState<string | null>(null);
  const [directoryRequest, setDirectoryRequest] = useState<{ path: string; workspace: string; id: number } | null>(null);
  const pathOpenRequestRef = useRef(0);
  const [selectedFile, setSelectedFile] = useState<WorkspaceFilePreview | null>(null);
  const [fileSelection, setFileSelection] = useState<{ file: WorkspaceFilePreview; selection: FileSelection } | null>(null);
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
  const [fileName, setFileName] = useState("");
  const [fileDrafts, setFileDrafts] = useState<Record<string, FileDraft>>({});
  const [fileSaving, setFileSaving] = useState<Set<string>>(new Set());
  const [fileConflicts, setFileConflicts] = useState<Record<string, string>>({});
  const [fileErrors, setFileErrors] = useState<Record<string, string>>({});
  const [composerRequest, setComposerRequest] = useState<{ id: string; text: string; mode?: "append" | "replace" } | null>(null);
  const activeThreadIdRef = useRef<string | null>(null);
  const threadOpenRequestRef = useRef(0);
  const openFilesRef = useRef<WorkspaceFilePreview[]>([]);
  const fileDraftsRef = useRef<Record<string, FileDraft>>({});
  const fileSavingRef = useRef<Set<string>>(new Set());
  const noteValuesRef = useRef<Record<string, string>>({});
  const noteKeyRef = useRef("draft");
  const pendingAssistantDeltasRef = useRef(new Map<string, { delta: string; threadId?: string }>());
  const assistantDeltaFrameRef = useRef<number | null>(null);
  const mainWorkspaceRef = useRef<HTMLDivElement | null>(null);
  const conversationScrollPositionsRef = useRef(new Map<string, number>());
  const threadsRef = useRef<ResearchThread[]>([]);
  const refreshingThreadsRef = useRef(false);
  const activeProject = projects.find((project) => project.id === activeProjectId) ?? null;
  const activeThread = threads.find((thread) => thread.id === activeThreadId) ?? null;
  const projectWorkspaces = useMemo(
    () => workspaces.filter((entry) => entry.project_id === activeProjectId),
    [activeProjectId, workspaces],
  );
  const activeWorkspace = projectWorkspaces.find((entry) => entry.id === activeWorkspaceId)
    ?? projectWorkspaces.find((entry) => entry.is_default)
    ?? projectWorkspaces[0]
    ?? null;
  const workspaceSessions = useMemo(
    () => activeWorkspace ? threads.filter((thread) => thread.workspace_id === activeWorkspace.id) : threads,
    [activeWorkspace, threads],
  );
  const archivedWorkspaceSessions = useMemo(
    () => activeWorkspace ? archivedThreads.filter((thread) => thread.workspace_id === activeWorkspace.id) : archivedThreads,
    [activeWorkspace, archivedThreads],
  );
  useEffect(() => {
    if (!projectWorkspaces.length) {
      setActiveWorkspaceId(null);
      return;
    }
    if (activeThread?.workspace_id && projectWorkspaces.some((entry) => entry.id === activeThread.workspace_id)) {
      if (activeWorkspaceId !== activeThread.workspace_id) setActiveWorkspaceId(activeThread.workspace_id);
      return;
    }
    if (!activeWorkspaceId || !projectWorkspaces.some((entry) => entry.id === activeWorkspaceId)) {
      setActiveWorkspaceId((projectWorkspaces.find((entry) => entry.is_default) ?? projectWorkspaces[0]).id);
    }
  }, [activeProjectId, activeThread?.workspace_id, activeWorkspaceId, projectWorkspaces]);
  useEffect(() => {
    if (activeThread?.visibility === "private" || activeThread?.visibility === "project") setThreadVisibility(activeThread.visibility);
    if (!activeThreadId) setCommentsOpen(false);
  }, [activeThread?.visibility, activeThreadId]);
  // Approvals are rendered inside the conversation view, so the open thread is
  // the only one whose prompts can actually be answered. Claiming it here lets
  // the agent veto a write instead of waiting for a prompt nobody can see.
  useEffect(() => {
    if (!activeThreadId || typeof desktopBridge?.claimApprovals !== "function") return;
    void desktopBridge.claimApprovals(activeThreadId, true).catch(() => {});
    return () => { void desktopBridge.claimApprovals(activeThreadId, false).catch(() => {}); };
  }, [activeThreadId]);
  useEffect(() => {
    if (!activeProjectId || !authState?.user || typeof desktopBridge?.joinProjectPresence !== "function") {
      setPresenceMembers([]);
      return;
    }
    const dispose = desktopBridge.onPresenceUpdate?.(setPresenceMembers);
    void desktopBridge.joinProjectPresence(activeProjectId, activeThreadId).catch(() => setPresenceMembers([]));
    return () => {
      dispose?.();
      void desktopBridge.leaveProjectPresence?.();
    };
  }, [activeProjectId, authState?.user?.id]);
  useEffect(() => {
    if (activeProjectId && authState?.user) void desktopBridge.updateProjectPresence?.(activeThreadId);
  }, [activeProjectId, activeThreadId, authState?.user?.id]);
  // Research data lives in the primary workspace. Agent tools, files, terminal,
  // and paper writing operate inside the session folder: session snapshot →
  // project folder → primary workspace.
  const executionWorkspace = activeThread?.workspace_path || activeWorkspace?.root || activeProject?.workspace_path || workspace;
  const executionWorkspaceRef = useRef(executionWorkspace);
  executionWorkspaceRef.current = executionWorkspace;
  const draftNoteKey = `draft:${workspace || "workspace"}`;
  const noteKey = activeThreadId ?? draftNoteKey;
  const noteValue = noteLoadedKey === noteKey ? noteValues[noteKey] ?? "" : "";
  noteKeyRef.current = noteKey;
  noteValuesRef.current = noteValues;
  threadsRef.current = threads;

  const activeStage = stageForMode(researchMode as ResearchMode);
  const pinnedPathThread = pinnedPathThreadId ? threads.find((thread) => thread.id === pinnedPathThreadId) ?? null : null;
  const pathThread = pinnedPathThread ?? activeThread;
  const pathThreadIsActive = Boolean(pathThread && pathThread.id === activeThreadId);
  const pathStage = stageForMode((pathThreadIsActive || !pathThread ? researchMode : pathThread.mode) as ResearchMode);
  const pathStageIndex = Math.max(0, researchStages.findIndex((stage) => stage.id === pathStage.id));
  const pathAcceptedStages = pathThreadIsActive ? acceptedStages : researchStages.slice(0, pathStageIndex).map((stage) => stage.id);
  const pathStaleStages = pathThreadIsActive ? staleStages : [];
  const pathProject = projects.find((project) => project.id === (pathThread?.project_id ?? activeProjectId)) ?? null;
  const pathIsPinned = Boolean(pinnedPathThreadId);
  const pathThreadInactive = Boolean(pinnedPathThreadId && !pathThreadIsActive);
  const proactive = useProactiveAgent({
    messages,
    thread: activeThread ? { id: activeThread.id, title: activeThread.title, status: activeThread.status } : null,
    threadId: activeThreadId,
    projectId: activeProjectId,
    workspace: executionWorkspace,
    section: mainSection,
    bridge: desktopBridge,
    onRun: runProactiveSuggestion,
    onNotice: (text) => setProactiveNotice(t(text)),
  });

  useEffect(() => {
    if (!proactiveNotice) return;
    const timer = window.setTimeout(() => setProactiveNotice(""), 4200);
    return () => window.clearTimeout(timer);
  }, [proactiveNotice]);

  useEffect(() => {
    const activeIndex = Math.max(0, researchStages.findIndex((stage) => stage.mode === researchMode));
    setAcceptedStages(researchStages.slice(0, activeIndex).map((stage) => stage.id));
    setStaleStages([]);
    setSelectedStage(null);
    setJourneyNotice("");
    setBranchCount(1);
    // A thread owns its research path. The UI state resets when the thread
    // changes, matching the previous conversation-local behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeThreadId, chatViewNonce]);

  useEffect(() => {
    applyAppearance(document.documentElement, appearance, theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "paper" ? "#fbfaf8" : "#20211F");
    const applyTitleBar = desktopBridge.setTitleBarTheme;
    if (applyTitleBar) void applyTitleBar(theme).catch(() => undefined);
  }, [appearance, theme]);

  useEffect(() => {
    const platform = desktopBridge.platform ?? "web";
    document.documentElement.dataset.platform = platform;
    document.documentElement.dataset.titlebar = platform === "win32" ? "overlay" : platform === "darwin" ? "inset" : "default";
  }, []);

  useEffect(() => {
    // The current application does not bundle an updater. A future updater can
    // publish a detected release on this event; until then the action stays hidden.
    const onUpdateAvailable = (event: Event) => {
      const detail = (event as CustomEvent<{ version?: unknown; url?: unknown }>).detail;
      if (typeof detail?.version !== "string" || !detail.version.trim()) return;
      setAvailableAppUpdate({ version: detail.version.trim(), url: typeof detail.url === "string" ? detail.url : undefined });
    };
    const onUpdateCleared = () => setAvailableAppUpdate(null);
    window.addEventListener("archimedes:update-available", onUpdateAvailable);
    window.addEventListener("archimedes:update-cleared", onUpdateCleared);
    return () => {
      window.removeEventListener("archimedes:update-available", onUpdateAvailable);
      window.removeEventListener("archimedes:update-cleared", onUpdateCleared);
    };
  }, []);

  useEffect(() => {
    writeAppearance(appearance);
  }, [appearance]);

  useEffect(() => {
    writeSessionToolPreferences(sessionTools);
  }, [sessionTools]);

  useEffect(() => {
    if (!workspace || !activeProjectId) return;
    rememberPreferredProject(workspace, activeProjectId);
  }, [activeProjectId, workspace]);

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
    window.localStorage.setItem("archimedes-research-panel-open", String(researchPanelOpen));
  }, [researchPanelOpen]);

  useEffect(() => {
    if (pinnedPathThreadId) window.localStorage.setItem("archimedes-research-path-pin", pinnedPathThreadId);
    else window.localStorage.removeItem("archimedes-research-path-pin");
  }, [pinnedPathThreadId]);

  useEffect(() => {
    if (!pinnedPathThreadId || threads.length === 0) return;
    if (!threads.some((thread) => thread.id === pinnedPathThreadId)) setPinnedPathThreadId(null);
  }, [pinnedPathThreadId, threads]);

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

  useEffect(() => {
    let cancelled = false;
    void desktopBridge.getWorkbenchSettings()
      .then((settings) => { if (!cancelled) setWorkbenchPreferences(normalizeWorkbenchPreferences(settings)); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void desktopBridge.getLocalIdentity()
      .then((identity) => { if (!cancelled) setLocalIdentity(identity); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void desktopBridge.getAuthState()
      .then((state) => { if (!cancelled) setAuthState(state); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  async function signIn(email: string, password: string) {
    const next = await desktopBridge.signIn(email, password);
    setAuthState(next);
    return next;
  }

  async function signUp(email: string, password: string, displayName?: string) {
    const next = await desktopBridge.signUp(email, password, displayName);
    setAuthState(next);
    return next;
  }

  async function signOut() {
    const next = await desktopBridge.signOut();
    setAuthState(next);
    return next;
  }

  function openAuth(mode: "choice" | "password" | "signup" | "reset" | "recovery" = "choice") {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  }

  async function signUpAndConfirm(email: string, password: string, displayName?: string) {
    const next = await desktopBridge.signUpAndConfirm(email, password, displayName);
    setAuthState(next);
    return next;
  }

  async function signInWithMagicLink(email: string) {
    const next = await desktopBridge.signInWithMagicLink(email);
    setAuthState(next);
    return next;
  }

  async function signInWithOAuth(provider: "google") {
    const next = await desktopBridge.signInWithOAuth(provider);
    setAuthState(next);
    return next;
  }

  async function requestPasswordReset(email: string) {
    const next = await desktopBridge.requestPasswordReset(email);
    setAuthState(next);
    return next;
  }

  async function updateCloudPassword(password: string) {
    const next = await desktopBridge.updateCloudPassword(password);
    setAuthState(next);
    return next;
  }

  async function saveLocalIdentity(displayName: string) {
    const identity = await desktopBridge.updateLocalIdentity({ displayName });
    setLocalIdentity(identity);
    return identity;
  }

  useEffect(() => {
    let cancelled = false;
    setNoteLoadedKey(null);
    setNoteSaveState("idle");
    void desktopBridge.getWorkbenchNote(noteKey)
      .then((note) => {
        if (cancelled) return;
        setNoteValues((current) => ({ ...current, [noteKey]: note.content }));
        setNoteLoadedKey(noteKey);
      })
      .catch(() => {
        if (cancelled) return;
        setNoteValues((current) => ({ ...current, [noteKey]: "" }));
        setNoteLoadedKey(noteKey);
      });
    return () => { cancelled = true; };
  }, [noteKey]);

  useEffect(() => {
    if (noteLoadedKey !== noteKey) return;
    const content = noteValues[noteKey] ?? "";
    setNoteSaveState("saving");
    const timer = window.setTimeout(() => {
      void desktopBridge.saveWorkbenchNote(noteKey, content)
        .then(() => { if (noteKeyRef.current === noteKey) setNoteSaveState("saved"); })
        .catch(() => { if (noteKeyRef.current === noteKey) setNoteSaveState("idle"); });
    }, 600);
    return () => window.clearTimeout(timer);
  }, [noteKey, noteLoadedKey, noteValues]);

  useEffect(() => {
    if (!workbenchActiveTabs.has("changes")) return;
    setSeenChangeSetIds(new Set(changeSets.map((changeSet) => changeSet.id)));
  }, [changeSets, workbenchActiveTabs]);

  useEffect(() => {
    if (!activeThreadId || (workbenchOpen && workbenchActiveTabs.has("artifacts"))) { setArtifactsBadge(0); return; }
    let cancelled = false;
    void desktopBridge.countUnseenArtifacts(activeThreadId).then((count) => { if (!cancelled) setArtifactsBadge(count); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [activeThreadId, artifactsVersion, workbenchOpen, workbenchActiveTabs]);

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

  function updateWorkbenchPreferences(next: WorkbenchTabPreferences) {
    const normalized = normalizeWorkbenchPreferences(next);
    setWorkbenchPreferences(normalized);
    void desktopBridge.saveWorkbenchSettings(normalized).catch(() => undefined);
  }

  function chooseWorkbenchTab(tab: WorkbenchTabId) {
    updateWorkbenchPreferences(selectWorkbenchTab(workbenchPreferences, tab));
  }

  async function resetWorkbenchPreferences() {
    try {
      const next = await desktopBridge.resetWorkbenchSettings();
      setWorkbenchPreferences(normalizeWorkbenchPreferences(next));
    } catch {
      setWorkbenchPreferences(DEFAULT_WORKBENCH_PREFERENCES);
    }
  }

  function sendNoteToChat(text: string, mode: "append" | "replace") {
    const content = text.trim();
    if (!content) return;
    setComposerRequest({ id: crypto.randomUUID(), text: content, mode });
    if (mainSection !== "chat") setMainSection("chat");
  }

  useEffect(() => {
    let cancelled = false;
    void desktopBridge.getTerminalSettings()
      .then((settings) => { if (!cancelled) setTerminalSettings(settings); })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!terminalSettings || terminalSettings.onboarded || !workbenchOpen || !workbenchActiveTabs.has("terminal")) return;
    setTerminalSettingsMode("onboarding");
    setTerminalSettingsOpen(true);
  }, [terminalSettings, workbenchOpen, workbenchActiveTabs]);

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

  const refreshSidebarPlugins = useCallback(() => {
    loadSidebarPlugins(desktopBridge).then((entries) => {
      setPluginEntries(entries);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshSidebarPlugins();
  }, [refreshSidebarPlugins]);

  const [disabledCoreModules, setDisabledCoreModules] = useState<string[]>(defaultDisabledResearchApps);
  const refreshSidebarSettings = useCallback(() => {
    desktopBridge.getSidebarSettings().then((settings) => {
      setDisabledCoreModules(settings.disabledCore);
    }).catch(() => undefined);
  }, []);

  useEffect(() => {
    refreshSidebarSettings();
  }, [refreshSidebarSettings]);

  // Core modules hidden in Settings disappear from the nav, palette, and view
  // host; the chat section is not a module and can never be hidden.
  const hiddenCoreModules = useMemo(() => new Set(disabledCoreModules), [disabledCoreModules]);
  useEffect(() => {
    if (mainSection !== "chat" && mainSection !== "files" && hiddenCoreModules.has(mainSection)) setMainSection("chat");
  }, [hiddenCoreModules, mainSection]);

  async function setCoreModuleEnabled(id: string, enabled: boolean) {
    const settings = await desktopBridge.setCoreModuleEnabled(id, enabled);
    setDisabledCoreModules(settings.disabledCore);
  }

  function openWorkbench(tab: WorkbenchTabId) {
    chooseWorkbenchTab(tab);
    setWorkbenchOpen(true);
  }

  function activateSidebarEntry(entry: SidebarEntry) {
    if (entry.disabled) return;
    const section = entry.destination.section;
    if (section === "daily") setDailyStartMode("latest");
    if (section === "image-creation") setImageCreationOpened(true);
    if (section === "data-charts") setDataChartsOpened(true);
    if (section === "data-analysis") setDataAnalysisOpened(true);
    setMainSection(section);
  }

  function openTrajectoryAt(ordinal?: number) {
    setTrajectoryFocusOrdinal(typeof ordinal === "number" ? ordinal : null);
    chooseWorkbenchTab("trajectory");
  }

  async function closeWorkbench() {
    if (Object.values(fileDraftsRef.current).some(isDraftDirty) && !(await confirm({ title: "Hide the workbench?", description: "Unsaved file changes stay in the editor.", confirmLabel: "Hide workbench" }))) return;
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
      if (!Object.values(fileDraftsRef.current).some(isDraftDirty)) return;
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
      if (event.clientRunId?.startsWith("side-chat:") || event.clientRunId?.startsWith("paper-chat:")) return;
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
            setWorkspaces(snapshot.workspaces ?? []);
            const runningThread = snapshot.threads.find((thread) => thread.id === event.threadId);
            if (runningThread && activeThreadIdRef.current === runningThread.id) setBoundHarness(runningThread.harness ?? null);
            if (runningThread?.workspace_path) void desktopBridge.watchWorkspace?.(runningThread.workspace_path).catch(() => undefined);
          }).catch(() => undefined).finally(() => {
            refreshingThreadsRef.current = false;
          });
        }
      }
      if (event.type === "artifact") setArtifactsVersion((current) => current + 1);
      if (event.type === "workspace_change" && event.changeSet) {
        if (!event.threadId || activeThreadIdRef.current === event.threadId) setChangeSets((current) => upsertChangeSet(current, event.changeSet!));
        return;
      }
      if (event.type.startsWith("native_")) {
        if (event.type === "native_question" || event.type === "native_question_resolved") setNativeQuestions((current) => updateNativeQuestions(current, event));
        else if (event.type === "native_approval_resolved" && event.action) setPendingAction((current) => current?.id === event.action!.id ? null : current);
        else if (event.threadId) setNativeStream((current) => ({ threadId: event.threadId!, events: mergeNativeEvent(current.threadId === event.threadId ? current.events : [], event) }));
        return;
      }
      if (event.type === "assistant_delta" && event.turnId && event.delta) {
        if (event.threadId && activeThreadIdRef.current !== event.threadId) return;
        queueAssistantDelta(event);
        return;
      }
      if (event.type === "complete" || event.type === "failed" || event.type === "interrupted") {
        flushAssistantDeltas();
        setInterrupting(false);
        setNativeQuestions((current) => current.filter((item) => Boolean(event.threadId) && item.threadId !== event.threadId));
        setPendingAction((current) => current && (!event.threadId || activeThreadIdRef.current === event.threadId) ? null : current);
      }
      if (event.type === "approval" && event.action && (!event.threadId || activeThreadIdRef.current === event.threadId)) {
        setPendingAction({ ...event.action, source: "agent" });
        if (event.threadId) setThreads((current) => current.map((thread) => thread.id === event.threadId ? { ...thread, pending_actions: (thread.pending_actions ?? 0) + 1 } : thread));
      }
      const state = event.type === "complete" || event.type === "artifact" || event.toolCall?.status === "completed" ? "done" : event.type === "configuration" || event.type === "failed" || event.type === "interrupted" || event.toolCall?.status === "failed" || event.toolCall?.status === "interrupted" ? "waiting" : "active";
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
    if (agentBusy || sideBusy || commandLockRef.current) return;
    const selected = await desktopBridge.chooseWorkspace();
    if (selected) await loadWorkspace(selected);
  }

  async function loadWorkspace(workspacePath: string) {
    if (agentBusy || sideBusy || commandLockRef.current) return;
    if (Object.values(fileDraftsRef.current).some(isDraftDirty) && !(await confirm({ title: "Discard unsaved changes?", description: "Artifact changes that have not been saved will be lost.", confirmLabel: "Discard changes", destructive: true }))) return;
    clearPendingAssistantDeltas();
    setWorkspaceReady(false);
    const snapshot = await desktopBridge.openWorkspace(workspacePath);
    setSideThread(null);
    setWorkspace(snapshot.workspace);
    setProjects(snapshot.projects ?? []);
    setArchivedProjects(snapshot.archivedProjects ?? []);
    setThreads(snapshot.threads);
    setArchivedThreads(snapshot.archivedThreads ?? []);
    setWorkspaces(snapshot.workspaces ?? []);
    const nextTree = await desktopBridge.listWorkspaceFiles(snapshot.workspace);
    setFileTree(nextTree);
    setLoadingDirectories(new Set());
    openFilesRef.current = [];
    setOpenFiles([]);
    setSelectedFilePath(null);
    setSelectedFile(null);
    setFileError("");
    setDrafts({});
    fileSavingRef.current = new Set();
    setFileSaving(new Set());
    setFileConflicts({});
    setFileErrors({});
    setWorkspaceReady(true);

    // Reopen the project the user was last looking at. Falling back to the most
    // recent thread alone lands people in whichever project they last chatted
    // in, which can be a project with no libraries at all.
    const knownProjects = new Set((snapshot.projects ?? []).map((project) => project.id));
    const rememberedProject = readPreferredProject(snapshot.workspace);
    let restoreProjectId = rememberedProject && knownProjects.has(rememberedProject) ? rememberedProject : null;

    // First launch after this change: if the most recent thread sits in a
    // project with no papers, start in the project that actually holds them
    // instead of opening an empty library.
    if (!restoreProjectId && snapshot.threads.length && typeof desktopBridge.listLibraryProjects === "function") {
      const recentProject = snapshot.threads[0].project_id;
      const summary = await desktopBridge.listLibraryProjects().catch(() => []);
      const recentHasPapers = summary.some((entry) => entry.project_id === recentProject && entry.paper_count > 0);
      if (!recentHasPapers) {
        const populated = summary.find((entry) => entry.paper_count > 0 && knownProjects.has(entry.project_id));
        if (populated) restoreProjectId = populated.project_id;
      }
    }

    const restoreThread = restoreProjectId
      ? snapshot.threads.find((candidate) => candidate.project_id === restoreProjectId) ?? null
      : snapshot.threads[0] ?? null;

    if (restoreThread) {
      const thread = await desktopBridge.getResearchThread(restoreThread.id, snapshot.workspace);
      setMessages(thread.messages.length ? thread.messages : initialMessages);
      setTrajectoryEvents(thread.events ?? []);
      setEvents([]);
      setActiveThreadId(thread.id);
      setBoundHarness(thread.harness ?? null);
      setActiveProjectId(thread.project_id);
      if (thread.workspace_id) setActiveWorkspaceId(thread.workspace_id);
      setResearchMode(chatModeFromThread(thread.mode, thread.events));
      setChangeSets(thread.changeSets ?? []);
    } else {
      setMessages(initialMessages);
      setTrajectoryEvents([]);
      setEvents([]);
      setActiveThreadId(null);
      setBoundHarness(null);
      const nextProjectId = restoreProjectId ?? snapshot.projects?.[0]?.id ?? null;
      setActiveProjectId(nextProjectId);
      const nextWorkspace = (snapshot.workspaces ?? []).find((entry) => entry.project_id === nextProjectId && entry.is_default)
        ?? (snapshot.workspaces ?? []).find((entry) => entry.project_id === nextProjectId);
      setActiveWorkspaceId(nextWorkspace?.id ?? null);
      setChangeSets([]);
    }

    const action = snapshot.actions.find((candidate) => candidate.status === "pending");
    setPendingAction(action ? { ...action, source: "agent" } : null);

  }

  function setDrafts(next: Record<string, FileDraft>) {
    fileDraftsRef.current = next;
    setFileDrafts(next);
  }

  function setFileSavingPath(filePath: string, saving: boolean) {
    const next = new Set(fileSavingRef.current);
    if (saving) next.add(filePath); else next.delete(filePath);
    fileSavingRef.current = next;
    setFileSaving(next);
  }

  function ensureFileDraft(file: WorkspaceFilePreview) {
    if (!isEditableFile(file)) return;
    const current = fileDraftsRef.current[file.path];
    const draft = createFileDraft(file);
    if (!draft || (current && isDraftDirty(current))) return;
    setDrafts({ ...fileDraftsRef.current, [file.path]: draft });
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
        const merged = mergeRefreshedFiles(currentOpenFiles, refreshedFiles, fileDraftsRef.current, fileSavingRef.current);
        openFilesRef.current = merged.files;
        setOpenFiles(merged.files);
        setFileConflicts(merged.conflicts);
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

  async function openThreadShare() {
    if (!activeThreadId) return;
    const sessionId = activeThreadId;
    try {
      const snapshot = await desktopBridge.createResearchThreadSnapshot(sessionId);
      if (activeThreadIdRef.current === sessionId) setShareSnapshot(snapshot);
    } catch (error) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: `Could not create a snapshot: ${String(error)}` }]);
    }
  }

  function startNewTask(projectId = activeProjectId, workspaceId = activeWorkspaceId) {
    if (agentBusy) return;
    writeComposerDraft(`new:${projectId ?? "none"}:${executionWorkspace}`, null);
    setMainSection("chat");
    clearPendingAssistantDeltas();
    setChatViewNonce((current) => current + 1);
    if (projectId) setActiveProjectId(projectId);
    const targetWorkspace = workspaces.find((entry) => entry.id === workspaceId && entry.project_id === projectId)
      ?? workspaces.find((entry) => entry.project_id === projectId && entry.is_default)
      ?? workspaces.find((entry) => entry.project_id === projectId);
    setActiveWorkspaceId(targetWorkspace?.id ?? null);
    threadOpenRequestRef.current += 1;
    activeThreadIdRef.current = null;
    setActiveThreadId(null);
    setBoundHarness(null);
    setThreadVisibility("project");
    setMessages(initialMessages);
    setTrajectoryEvents([]);
    setPendingAction(null);
    setContextItems([]);
    setChangeSets([]);
  }

  async function runConversationCommand(command: ConversationCommand): Promise<ConversationCommandResult> {
    if (command === "model") {
      setSettingsSection("models");
      setSettingsOpen(true);
      return;
    }
    if (commandLockRef.current) throw new Error(t("Wait for the current command to finish."));
    if (agentBusy) throw new Error(t("Stop the running turn before using this command."));
    if (command === "init") {
      if (!executionWorkspace) throw new Error(t("Select a workspace first."));
      if (!(await submitPrompt(INIT_PROMPT, "free-chat"))) throw new Error(t("Project initialization could not start."));
      return;
    }
    if (command === "new") { startNewTask(); return; }
    if (command === "side" && sideThread) return { notice: t("The side conversation is already open.") };
    const threadId = activeThreadIdRef.current;
    if (!threadId && command !== "side") throw new Error(t("Start a conversation before using this command."));
    commandLockRef.current = true;
    try {
      if (command === "export") {
        const result = await desktopBridge.exportResearchThread(threadId!, workspace);
        return result.canceled ? undefined : { notice: t("Conversation exported.") };
      }
      if (command === "fork" || command === "side") {
        const copy = threadId
          ? await desktopBridge.forkResearchThread(threadId, workspace, command === "side")
          : await desktopBridge.createResearchThread({ projectId: activeProjectId || undefined, workspacePath: executionWorkspace, mode: researchMode, visibility: threadVisibility, title: t("Side conversation") });
        setThreads((current) => [copy, ...current.filter((item) => item.id !== copy.id)]);
        if (command === "side") { setSideThread(copy); setWorkbenchOpen(false); }
        else await openResearchThread(copy);
        return;
      }
      if (command === "undo") {
        const result = await desktopBridge.undoResearchTurn(threadId!, workspace);
        if (activeThreadIdRef.current === threadId) {
          clearPendingAssistantDeltas();
          setMessages(result.thread.messages.length ? result.thread.messages : initialMessages);
          setTrajectoryEvents(result.thread.events ?? []);
          setChangeSets(result.thread.changeSets);
          setPendingAction(null);
          setEvents([]);
        }
        const snapshot = await desktopBridge.getResearchSnapshot();
        setThreads(snapshot.threads);
        setArchivedThreads(snapshot.archivedThreads ?? []);
        setWorkspaces(snapshot.workspaces ?? []);
        await desktopBridge.clearJourneySummary(threadId!).catch(() => undefined);
        return { draft: result.prompt, notice: t("Last turn undone. Files are unchanged. A backup is available in archived chats.") };
      }
      if (command === "compact") {
        const thread = await desktopBridge.compactResearchThread(threadId!, workspace);
        setThreads((current) => current.map((item) => item.id === thread.id ? thread : item));
        if (activeThreadIdRef.current === thread.id) { setTrajectoryEvents(thread.events ?? []); setNativeStream({ threadId: "", events: [] }); }
        return { notice: t(selectedHarness === "codex" ? "Codex context compacted. Original messages are preserved." : "Context compacted. Original messages are preserved.") };
      }
    } finally { commandLockRef.current = false; }
  }

  async function openResearchThread(threadSummary: ResearchThread) {
    if (sideThread?.id === threadSummary.id) {
      if (sideBusy) return;
      setSideThread(null);
    }
    clearPendingAssistantDeltas();
    setMainSection("chat");
    activeThreadIdRef.current = threadSummary.id;
    setActiveThreadId(threadSummary.id);
    setBoundHarness(threadSummary.harness ?? null);
    setActiveProjectId(threadSummary.project_id);
    if (threadSummary.workspace_id) setActiveWorkspaceId(threadSummary.workspace_id);
    void desktopBridge.markResearchThreadViewed?.(threadSummary.id).catch(() => undefined);
    setThreads((current) => current.map((item) => item.id === threadSummary.id ? { ...item, unread_count: 0 } : item));
    const requestId = ++threadOpenRequestRef.current;
    try {
      const thread = await desktopBridge.getResearchThread(threadSummary.id, workspace);
      if (requestId !== threadOpenRequestRef.current) return;
      activeThreadIdRef.current = thread.id;
      setActiveThreadId(thread.id);
      setBoundHarness(thread.harness ?? null);
      setActiveProjectId(thread.project_id);
      if (thread.workspace_id) setActiveWorkspaceId(thread.workspace_id);
      setMessages(thread.messages.length ? thread.messages : initialMessages);
      setTrajectoryEvents(thread.events ?? []);
      setEvents([]);
      setResearchMode(chatModeFromThread(thread.mode, thread.events));
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
      const projectSpaces = await desktopBridge.listResearchWorkspaces(project.id).catch(() => []);
      setWorkspaces((current) => [...current.filter((entry) => entry.project_id !== project.id), ...projectSpaces]);
      setNewProjectName("");
      setNewProjectError("");
      setNewProjectOpen(false);
      startNewTask(project.id, projectSpaces.find((entry) => entry.is_default)?.id);
    } catch (error) {
      setNewProjectError(error instanceof Error ? error.message : String(error));
    }
  }

  async function refreshWorkspaceProjects() {
    const snapshot = await desktopBridge.openWorkspace(workspace);
    setProjects(snapshot.projects);
    setArchivedProjects(snapshot.archivedProjects ?? []);
    setThreads(snapshot.threads);
    setArchivedThreads(snapshot.archivedThreads);
    setWorkspaces(snapshot.workspaces ?? []);
  }

  async function selectWorkspace(workspaceToOpen: ProjectWorkspace) {
    if (workspaceToOpen.id === activeWorkspace?.id) return;
    setActiveWorkspaceId(workspaceToOpen.id);
    if (workspaceToOpen.project_id !== activeProjectId) setActiveProjectId(workspaceToOpen.project_id);
    const next = threads.find((thread) => thread.workspace_id === workspaceToOpen.id);
    if (next) await openResearchThread(next);
    else {
      startNewTask(workspaceToOpen.project_id, workspaceToOpen.id);
      // The new workspace may not be in the state snapshot yet, so make the
      // explicit choice win over startNewTask's default-workspace fallback.
      setActiveWorkspaceId(workspaceToOpen.id);
      setActiveProjectId(workspaceToOpen.project_id);
    }
  }

  function openWorkspaceCreator(projectId: string, kind?: ProjectWorkspaceKind) {
    if (!projectId) return;
    const project = projects.find((entry) => entry.id === projectId) ?? null;
    const resolvedKind = kind ?? (project?.git_state === "ready" ? "worktree" : "sandbox");
    setWorkspaceDialogError("");
    setWorkspaceSuggestion("");
    setWorkspaceDialog({ mode: "create", projectId, kind: resolvedKind });
    void desktopBridge.suggestResearchWorkspaceName?.()
      .then((name) => setWorkspaceSuggestion(name || ""))
      .catch(() => setWorkspaceSuggestion(""));
  }

  function createWorkspace(kind: ProjectWorkspaceKind) {
    if (activeProjectId) openWorkspaceCreator(activeProjectId, kind);
  }

  function openWorkspaceRename(workspaceToRename: ProjectWorkspace) {
    setWorkspaceDialogError("");
    setWorkspaceSuggestion("");
    setWorkspaceDialog({ mode: "rename", workspace: workspaceToRename });
  }

  async function submitWorkspaceDialog({ name, kind }: { name: string; kind: ProjectWorkspaceKind }) {
    if (!workspaceDialog || creatingWorkspace) return;
    setCreatingWorkspace(true);
    setWorkspaceDialogError("");
    try {
      if (workspaceDialog.mode === "create") {
        const created = await desktopBridge.createResearchWorkspace(workspaceDialog.projectId, kind, name);
        setWorkspaces((current) => [...current.filter((entry) => entry.id !== created.id), created]);
        setWorkspaceDialog(null);
        await selectWorkspace(created);
      } else {
        const updated = await desktopBridge.renameResearchWorkspace(workspaceDialog.workspace.id, name);
        setWorkspaces((current) => current.map((entry) => entry.id === updated.id ? updated : entry));
        setWorkspaceDialog(null);
      }
    } catch (error) {
      setWorkspaceDialogError(error instanceof Error ? error.message : String(error));
    } finally {
      setCreatingWorkspace(false);
    }
  }

  async function deleteWorkspace(workspaceToDelete: ProjectWorkspace) {
    if (workspaceToDelete.is_default) return;
    if (!(await confirm({
      title: t("Delete this workspace?"),
      description: t("Its sessions move back to the main workspace. Its files stay on disk until you remove them, except for a Git worktree created here."),
      confirmLabel: t("Delete workspace"),
      destructive: true,
    }))) return;
    try {
      await desktopBridge.deleteResearchWorkspace(workspaceToDelete.id);
      const snapshot = await desktopBridge.openWorkspace(workspace);
      setProjects(snapshot.projects);
      setArchivedProjects(snapshot.archivedProjects ?? []);
      setThreads(snapshot.threads);
      setArchivedThreads(snapshot.archivedThreads ?? []);
      setWorkspaces(snapshot.workspaces ?? []);
      if (activeWorkspace?.id === workspaceToDelete.id) {
        const fallback = (snapshot.workspaces ?? []).find((entry) => entry.project_id === workspaceToDelete.project_id && entry.is_default);
        const next = snapshot.threads.find((thread) => thread.workspace_id === fallback?.id);
        if (next) await openResearchThread(next);
        else startNewTask(workspaceToDelete.project_id, fallback?.id);
      }
    } catch (error) {
      setProjectFolderError(error instanceof Error ? error.message : String(error));
    }
  }

  async function pinSession(session: ResearchThread, pinned: boolean) {
    const apply = (items: ResearchThread[]) => items.map((item) => item.id === session.id ? { ...item, pinned: pinned ? 1 : 0 } : item);
    setThreads(apply);
    setArchivedThreads(apply);
    try {
      await desktopBridge.pinResearchThread(session.id, pinned);
    } catch {
      setThreads((items) => items.map((item) => item.id === session.id ? { ...item, pinned: session.pinned } : item));
    }
  }

  useEffect(() => {
    function isTypingTarget(target: EventTarget | null) {
      const element = target as HTMLElement | null;
      if (!element || typeof element.matches !== "function") return false;
      return element.matches("input, textarea, select") || element.isContentEditable;
    }
    function handleSessionShortcut(event: KeyboardEvent) {
      const modifier = event.metaKey || event.ctrlKey;
      if (modifier && event.shiftKey && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSessionSwitcherSignal((value) => value + 1);
        return;
      }
      if (isTypingTarget(event.target)) return;
      const bracket = modifier && event.shiftKey && (event.code === "BracketLeft" || event.code === "BracketRight");
      const altArrow = event.altKey && !modifier && (event.key === "ArrowUp" || event.key === "ArrowDown");
      if (!bracket && !altArrow) return;
      if (!workspaceSessions.length) return;
      event.preventDefault();
      const direction = bracket ? (event.code === "BracketLeft" ? -1 : 1) : (event.key === "ArrowUp" ? -1 : 1);
      const index = workspaceSessions.findIndex((session) => session.id === activeThreadId);
      const nextIndex = index < 0
        ? (direction > 0 ? 0 : workspaceSessions.length - 1)
        : (index + direction + workspaceSessions.length) % workspaceSessions.length;
      void openResearchThread(workspaceSessions[nextIndex]);
    }
    window.addEventListener("keydown", handleSessionShortcut);
    return () => window.removeEventListener("keydown", handleSessionShortcut);
  }, [activeThreadId, workspaceSessions]);

  async function changeProjectWorkspace(project: ResearchProject) {
    if (agentBusy) return;
    const selected = await desktopBridge.chooseWorkspace();
    if (!selected) return;
    try {
      const updated = await desktopBridge.setResearchProjectWorkspace(project.id, selected);
      setProjects((current) => current.map((candidate) => candidate.id === updated.id ? updated : candidate));
      setWorkspaces((current) => current.map((entry) => entry.project_id === updated.id && entry.is_default
        ? { ...entry, root: updated.workspace_path || entry.root }
        : entry));
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
    setWorkspaces(snapshot.workspaces ?? []);
    if (archived && activeThreadId === thread.id) {
      const next = snapshot.threads.find((candidate) => candidate.workspace_id === thread.workspace_id)
        ?? snapshot.threads.find((candidate) => candidate.project_id === thread.project_id);
      if (next) await openResearchThread(next); else startNewTask(thread.project_id, thread.workspace_id);
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
    setWorkspaces(snapshot.workspaces ?? []);
    if (archived && activeProjectId === project.id) {
      const nextThread = snapshot.threads[0];
      if (nextThread) await openResearchThread(nextThread);
      else {
        activeThreadIdRef.current = null;
        setActiveThreadId(null);
        setBoundHarness(null);
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
    setWorkspaces(snapshot.workspaces ?? []);
    if (activeProjectId === project.id) {
      const nextThread = snapshot.threads[0];
      if (nextThread) await openResearchThread(nextThread);
      else {
        activeThreadIdRef.current = null;
        setActiveThreadId(null);
        setBoundHarness(null);
        setActiveProjectId(snapshot.projects[0]?.id ?? null);
        setMessages(initialMessages);
        setChangeSets([]);
      }
    }
  }

  async function submitPrompt(draft: string, requestedMode: ResearchMode = researchMode, requestedReasoningEffort: ReasoningEffort = reasoningEffort, requestedContextLength: ContextLength = contextLength, submittedContextOverride?: ContextAttachment[], researchSkill?: "idea-spark" | "paper-to-slides", backendOverride?: "codex" | "claude", forceNew = false, mineruToken?: string): Promise<boolean> {
    const question = draft.trim();
    const submittedContext = submittedContextOverride ?? contextItems;
    const hasPastedImage = submittedContext.some((item) => item.type === "image");
    if ((!question && !hasPastedImage) || agentBusy || commandLockRef.current) return false;
    const requestPrompt = question || "Please analyze the attached image.";
    const submittedThreadId = forceNew ? null : activeThreadIdRef.current;

    setResearchMode(requestedMode);

    clearPendingAssistantDeltas();
    setAgentBusy(true);
    setInterrupting(false);
    setMessages((current) => [...current, { id: crypto.randomUUID(), role: "user", text: requestPrompt, attachments: submittedContext.map((item, position) => ({ type: item.type, name: item.name, path: item.path, detail: item.detail, size: item.image?.sizeBytes ?? item.size, position, imageData: item.image?.dataUrl })), created_at: new Date().toISOString() }]);
    // A new turn must not reuse the previous turn's native activity while the
    // backend is starting (including when switching from Codex back to API).
    setNativeStream({ threadId: activeThreadId || "", events: [{ id: "pending-turn", turn_id: "pending-turn", sequence: 0, type: "user_message", payload: {}, created_at: new Date().toISOString() }] });
    setNativeQuestions([]);
    setEvents(selectedNativeBackend ? [] : [{ title: "Evidence synthesis", detail: "Reading workspace and knowledge context", state: "active" }]);

    try {
      const result = await desktopBridge.runAgent({ prompt: requestPrompt, workspace: executionWorkspace, threadId: forceNew ? undefined : activeThreadId || undefined, projectId: activeProjectId || undefined, workspaceId: activeWorkspace?.id, visibility: threadVisibility, mode: requestedMode, researchSkill, mineruToken, reasoningEffort: requestedReasoningEffort, contextLength: requestedContextLength, contextItems: submittedContext, capabilities: { write: "ask", command: "ask" }, origin: "research", backend: backendOverride || selectedHarness });
      setThreads((current) => [result.thread, ...current.filter((thread) => thread.id !== result.threadId)]);
      setNativeStream((current) => current.threadId === result.threadId ? { threadId: "", events: [] } : current);
      setNativeQuestions((current) => current.filter((item) => item.threadId !== result.threadId));
      if (submittedThreadId === null) {
        const draftNote = noteValuesRef.current[draftNoteKey] ?? "";
        if (draftNote.trim()) {
          try {
            await desktopBridge.saveWorkbenchNote(result.threadId, draftNote);
            await desktopBridge.deleteWorkbenchNote(draftNoteKey);
            setNoteValues((current) => ({ ...current, [result.threadId]: draftNote, [draftNoteKey]: "" }));
          } catch { /* Keep the draft so it can be recovered. */ }
        }
      }
      const stillViewingSubmittedThread = activeThreadIdRef.current === result.threadId
        || (submittedThreadId === null && activeThreadIdRef.current === null);
      if (stillViewingSubmittedThread) {
        clearPendingAssistantDeltas();
        activeThreadIdRef.current = result.threadId;
        setMessages(result.thread.messages.length ? result.thread.messages : initialMessages);
        setTrajectoryEvents(result.thread.events ?? []);
        setEvents([]);
        setActiveThreadId(result.threadId);
        setBoundHarness(result.thread.harness ?? backendOverride ?? selectedHarness);
        setActiveProjectId(result.thread.project_id);
        if (result.thread.workspace_id) setActiveWorkspaceId(result.thread.workspace_id);
        setChangeSets(result.thread.changeSets ?? []);
        setEvents((current) => current.map((event) => event.title === "Evidence synthesis" ? { ...event, detail: "Turn saved to this research session", state: "done" } : event));
        const proposedAction = result.actions.find((action) => action.status === "pending");
        if (proposedAction) setPendingAction({ ...proposedAction, source: "agent" });
      }
      setContextItems((current) => current.filter((item) => !submittedContext.some((submitted) => submitted.id === item.id)));
      return true;
    } catch (error) {
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: `Archimedes could not start this task: ${String(error)}` }]);
      return false;
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

  async function openFilePane(filePath: string, surface: "workbench" | "page" = "workbench") {
    const request = ++pathOpenRequestRef.current;
    const requestWorkspace = executionWorkspace;
    const isCurrent = () => request === pathOpenRequestRef.current && requestWorkspace === executionWorkspaceRef.current;
    setDirectoryRequest(null);
    if (surface === "page") setMainSection("files");
    else openWorkbench("files");
    setSelectedFilePath(filePath);
    setFileLoading(true);
    setFileError("");
    try {
      const file = await desktopBridge.readWorkspaceFile(requestWorkspace, filePath);
      if (!isCurrent()) return;
      ensureFileDraft(file);
      setSelectedFile(file);
      setOpenFiles((current) => {
        const existingIndex = current.findIndex((candidate) => candidate.path === file.path);
        const next = existingIndex < 0
          ? [...current, file]
          : current.map((candidate, index) => index === existingIndex ? file : candidate);
        openFilesRef.current = next;
        return next;
      });
      setFileConflicts((current) => withoutKey(current, filePath));
      setFileErrors((current) => withoutKey(current, filePath));
    } catch (error) {
      if (!isCurrent()) return;
      setSelectedFile(null);
      setFileError(error instanceof Error ? error.message : String(error));
    } finally {
      if (isCurrent()) setFileLoading(false);
    }
  }

  const clearDirectoryRequest = useCallback((id: number) => {
    setDirectoryRequest((current) => current?.id === id ? null : current);
  }, []);

  async function openChangedFile(filePath: string) {
    const request = ++pathOpenRequestRef.current;
    const requestWorkspace = executionWorkspace;
    const isCurrent = () => request === pathOpenRequestRef.current && requestWorkspace === executionWorkspaceRef.current;
    try {
      const entry = await desktopBridge.inspectWorkspacePath(requestWorkspace, filePath);
      if (!isCurrent()) return;
      if (entry.type === "directory") {
        let tree = await desktopBridge.listWorkspaceFiles(requestWorkspace);
        if (!isCurrent()) return;
        const parts = entry.path.split("/").filter(Boolean);
        for (let index = 1; index <= parts.length; index += 1) {
          const directory = parts.slice(0, index).join("/");
          const listing = await desktopBridge.listWorkspaceFiles(requestWorkspace, directory);
          if (!isCurrent()) return;
          tree = { ...tree, entries: setDirectoryChildren(ensureDirectoryPath(tree.entries, directory), directory, listing.entries) };
        }
        setFileTree(tree);
        setFileError("");
        setFileLoading(false);
        setDirectoryRequest({ path: entry.path, workspace: requestWorkspace, id: request });
        openWorkbench("files");
      } else if (/\.(?:tex|bib|bst|cls|sty|cfg)$/i.test(entry.path)) {
        setDirectoryRequest(null);
        setFileLoading(false);
        setPaperOpenRequest({ path: entry.path, token: Date.now() });
        setMainSection("writing");
      } else {
        void openFilePane(entry.path);
      }
    } catch (error) {
      if (!isCurrent()) return;
      setDirectoryRequest(null);
      openWorkbench("files");
      setSelectedFilePath(filePath);
      setSelectedFile(null);
      setFileLoading(false);
      setFileError(error instanceof Error ? error.message : String(error));
    }
  }

  function askAIAboutPaper(filePath: string) {
    const absolutePath = `${executionWorkspace.replace(/[\\/]$/, "")}/${filePath.replace(/^\/+/, "")}`;
    const attachment: ContextAttachment = { id: `file:${absolutePath}`, type: "file", name: filePath.split("/").at(-1) || filePath, path: absolutePath, detail: `LaTeX paper source · ${filePath}` };
    setContextItems((current) => current.some((item) => item.id === attachment.id) ? current : [...current, attachment].slice(0, 12));
    setResearchMode("paper-generation");
    setMainSection("chat");
  }

  function selectOpenFilePane(file: WorkspaceFilePreview, surface: "workbench" | "page" = "workbench") {
    pathOpenRequestRef.current += 1;
    setDirectoryRequest(null);
    if (surface === "page") setMainSection("files");
    else openWorkbench("files");
    setSelectedFilePath(file.path);
    setSelectedFile(file);
    setFileError("");
    setFileLoading(false);
    ensureFileDraft(file);
  }

  async function closeFilePane(filePath: string) {
    if (isDraftDirty(fileDraftsRef.current[filePath]) && !(await confirm({ title: "Discard unsaved changes?", description: `${filePath} has changes that have not been saved.`, confirmLabel: "Discard changes", destructive: true }))) return;
    const current = openFilesRef.current;
    const closedIndex = current.findIndex((file) => file.path === filePath);
    if (closedIndex < 0) return;
    const next = current.filter((file) => file.path !== filePath);
    openFilesRef.current = next;
    setOpenFiles(next);
    const nextDrafts = { ...fileDraftsRef.current };
    delete nextDrafts[filePath];
    setDrafts(nextDrafts);
    setFileConflicts((current) => withoutKey(current, filePath));
    setFileErrors((current) => withoutKey(current, filePath));
    if (selectedFilePath !== filePath) return;
    const replacement = next[Math.min(closedIndex, next.length - 1)] ?? null;
    setSelectedFilePath(replacement?.path ?? null);
    setSelectedFile(replacement);
    setFileError("");
  }

  async function closeOtherFilePanes(keepPath: string) {
    const current = openFilesRef.current;
    const closing = current.filter((file) => file.path !== keepPath);
    if (closing.length === 0) return;
    const dirtyCount = closing.filter((file) => isDraftDirty(fileDraftsRef.current[file.path])).length;
    if (dirtyCount > 0 && !(await confirm({ title: "Close other files?", description: `${dirtyCount} other file${dirtyCount === 1 ? "" : "s"} have unsaved changes.`, confirmLabel: "Close others", destructive: true }))) return;
    const keep = current.find((file) => file.path === keepPath) ?? null;
    const next = keep ? [keep] : [];
    openFilesRef.current = next;
    setOpenFiles(next);
    const nextDrafts = { ...fileDraftsRef.current };
    for (const file of closing) delete nextDrafts[file.path];
    setDrafts(nextDrafts);
    setFileConflicts((records) => closing.reduce((acc, file) => withoutKey(acc, file.path), records));
    setFileErrors((records) => closing.reduce((acc, file) => withoutKey(acc, file.path), records));
    setSelectedFilePath(keep?.path ?? null);
    setSelectedFile(keep);
    setFileSelection(null);
    setFileError("");
  }

  async function closeAllFilePanes() {
    const current = openFilesRef.current;
    if (current.length === 0) return;
    const dirtyCount = current.filter((file) => isDraftDirty(fileDraftsRef.current[file.path])).length;
    if (dirtyCount > 0 && !(await confirm({ title: "Close all files?", description: `${dirtyCount} file${dirtyCount === 1 ? "" : "s"} have unsaved changes.`, confirmLabel: "Close all", destructive: true }))) return;
    openFilesRef.current = [];
    setOpenFiles([]);
    setDrafts({});
    setFileConflicts({});
    setFileErrors({});
    setSelectedFilePath(null);
    setSelectedFile(null);
    setFileSelection(null);
    setFileError("");
  }

  function updateFileDraft(filePath: string, content: string) {
    const draft = fileDraftsRef.current[filePath];
    if (!draft || draft.content === content) return;
    setDrafts({ ...fileDraftsRef.current, [filePath]: { ...draft, content } });
    setFileErrors((current) => withoutKey(current, filePath));
  }

  async function saveFile(filePath: string) {
    const draft = fileDraftsRef.current[filePath];
    if (!draft || !isDraftDirty(draft)) return;
    const contentAtSave = draft.content;
    setFileSavingPath(filePath, true);
    setFileErrors((current) => withoutKey(current, filePath));
    try {
      const saved = await desktopBridge.writeWorkspaceFile(executionWorkspace, filePath, prepareFileContent(draft));
      const savedContent = toEditorText(saved.content ?? contentAtSave);
      const latest = fileDraftsRef.current[filePath];
      if (latest) {
        setDrafts({
          ...fileDraftsRef.current,
          [filePath]: markDraftSaved({ ...latest, savedContent }, savedContent, saved.modifiedAt),
        });
      }
      const updateFile = (file: WorkspaceFilePreview) => file.path === filePath
        ? { ...file, ...saved, content: saved.content ?? file.content }
        : file;
      openFilesRef.current = openFilesRef.current.map(updateFile);
      setOpenFiles(openFilesRef.current);
      setSelectedFile((current) => current ? updateFile(current) : current);
      setFileConflicts((current) => withoutKey(current, filePath));
    } catch (error) {
      setFileErrors((current) => ({ ...current, [filePath]: error instanceof Error ? error.message : String(error) }));
    } finally {
      setFileSavingPath(filePath, false);
    }
  }

  async function reloadFile(filePath: string) {
    try {
      const file = await desktopBridge.readWorkspaceFile(executionWorkspace, filePath);
      const draft = createFileDraft(file);
      const nextDrafts = { ...fileDraftsRef.current };
      if (draft) nextDrafts[filePath] = draft;
      else delete nextDrafts[filePath];
      setDrafts(nextDrafts);
      openFilesRef.current = openFilesRef.current.map((candidate) => candidate.path === filePath ? file : candidate);
      setOpenFiles(openFilesRef.current);
      setSelectedFile((current) => current?.path === filePath ? file : current);
      setFileConflicts((current) => withoutKey(current, filePath));
      setFileErrors((current) => withoutKey(current, filePath));
    } catch (error) {
      setFileErrors((current) => ({ ...current, [filePath]: error instanceof Error ? error.message : String(error) }));
    }
  }

  function dismissFileConflict(filePath: string) {
    const onDisk = fileConflicts[filePath];
    const draft = fileDraftsRef.current[filePath];
    if (draft && onDisk !== undefined) {
      setDrafts({ ...fileDraftsRef.current, [filePath]: { ...draft, savedContent: onDisk } });
    }
    setFileConflicts((current) => withoutKey(current, filePath));
  }

  function addFileComment(comment: FileComment) {
    setComposerRequest({ id: crypto.randomUUID(), text: formatFileComment(comment) });
    setMainSection("chat");
  }

  async function createFile() {
    const name = fileName.trim();
    if (!name) return;
    const normalizedName = name.endsWith(".md") ? name : `${name}.md`;
    await desktopBridge.writeWorkspaceFile(executionWorkspace, normalizedName, `# ${normalizedName.split("/").at(-1)?.replace(/\.md$/, "")}\n\n`);
    setFileName("");
    setModal(null);
    await refreshWorkspaceFiles();
    await openFilePane(normalizedName);
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
      if (action.kind === "command" && action.payload.command && !action.payload.externalAgent && !action.payload.managedByAgent) {
        await runCommand(action.payload.command, action.id);
      } else if (action.kind === "write" && action.payload.path) {
        await refreshWorkspaceFiles();
      }
    } catch (error) {
      if (String(error).includes("file changed while awaiting approval")) { setPendingAction(null); clearThreadPendingAction(); }
      setMessages((current) => [...current, { id: crypto.randomUUID(), role: "assistant", text: `Could not approve this action: ${String(error)}` }]);
    }
  }

  function reviewPendingAction() {
    requestAnimationFrame(() => {
      document.querySelector(".conversation-approval")?.scrollIntoView({ block: "center", behavior: "smooth" });
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

  async function runProactiveSuggestion(suggestion: ProactiveSuggestion) {
    const action = suggestion.action;
    if (action.kind === "copy") {
      await desktopBridge.writeClipboardText(action.text).catch(() => undefined);
      setProactiveNotice(t("Copied to clipboard."));
      return;
    }
    if (action.kind === "open") {
      setMainSection(action.target);
      return;
    }
    setMainSection("chat");
    setComposerRequest({ id: `proactive-${suggestion.id}`, text: action.text });
    setProactiveNotice(t("Draft added to the composer. Nothing runs until you send it."));
  }

  function togglePathPin() {
    if (pinnedPathThreadId) {
      setPinnedPathThreadId(null);
      return;
    }
    if (activeThreadId) setPinnedPathThreadId(activeThreadId);
  }

  function openPathThread() {
    const target = pinnedPathThread ?? activeThread;
    if (target) void openResearchThread(target);
  }

  function acceptCurrentCheckpoint() {
    const currentIndex = researchStages.findIndex((stage) => stage.id === activeStage.id);
    const nextStage = researchStages[currentIndex + 1];
    setAcceptedStages((current) => current.includes(activeStage.id) ? current : [...current, activeStage.id]);
    setStaleStages((current) => current.filter((id) => id !== activeStage.id));
    setJourneyNotice(`${activeStage.checkpoint} accepted${nextStage ? `. Archimedes will route new work toward ${nextStage.label}.` : ". Research cycle complete."}`);
    setSelectedStage(null);
    if (nextStage) setResearchMode(nextStage.mode);
  }

  function requestCheckpointChanges() {
    setMainSection("chat");
    setComposerRequest({
      id: `checkpoint-${Date.now()}`,
      text: `Revise the current ${activeStage.checkpoint.toLowerCase()}. Preserve the accepted evidence, explain what changed, and prepare a new checkpoint for review.`,
    });
    setSelectedStage(null);
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
    setResearchMode(stage.mode);
  }

  function toggleProactiveDock() {
    if (proactive.settings.mode === "off") {
      // A configured model is enough to start; avoid forcing a trip to Settings.
      if (proactive.modelReady) {
        proactive.setSettings({ mode: "auto" });
        proactive.setOpen(true);
        return;
      }
      setSettingsSection("proactive");
      setSettingsOpen(true);
      return;
    }
    proactive.setOpen(!proactive.open);
  }

  const dirtyFilePaths = useMemo(() => new Set(Object.values(fileDrafts).filter(isDraftDirty).map((draft) => draft.path)), [fileDrafts]);
  const changesBadge = useMemo(() => changeSets.reduce((total, changeSet) => seenChangeSetIds.has(changeSet.id) ? total : total + changeSet.changes.length, 0), [changeSets, seenChangeSetIds]);
  const composerDraftKey = activeThreadId ?? `new:${activeProjectId ?? "none"}:${executionWorkspace}`;
  const conversationScrollKey = activeThreadId ?? `new:${activeProjectId ?? "none"}:${activeWorkspace?.id ?? executionWorkspace}`;
  const sessionCommentsScope = useMemo<SessionCommentsScope | null>(() => activeThreadId && activeProjectId ? {
    bridge: desktopBridge, workspace, projectId: activeProjectId, sessionId: activeThreadId, shared: Boolean(activeProject?.cloud_project_id),
  } : null, [activeThreadId, activeProjectId, activeProject?.cloud_project_id, workspace]);
  const exitSessionComments = useCallback(() => setCommentsOpen(false), []);
  const workspaceDialogProjectId = workspaceDialog
    ? workspaceDialog.mode === "create" ? workspaceDialog.projectId : workspaceDialog.workspace.project_id
    : null;
  const workspaceDialogProject = projects.find((project) => project.id === workspaceDialogProjectId) ?? null;
  const activeModule = mainSection === "chat" || mainSection === "files" ? null : sidebarModule(mainSection);
  const registeredSidebarEntries = useMemo(() => sidebarEntries().filter((entry) => !entry.disabled), [pluginEntries]);
  const availableModuleEntries = useMemo(() => sidebarEntries().filter((entry) => !entry.disabled && !hiddenCoreModules.has(entry.id)), [hiddenCoreModules, pluginEntries]);
  const flatModuleEntries = useMemo(() => orderSidebarIds(availableModuleEntries, sidebarOrder.apps), [availableModuleEntries, sidebarOrder.apps]);
  const availableSidebarWorkspaces = useMemo(() => Object.fromEntries([...projects, ...archivedProjects].map((project) => {
    const current = workspaces.filter((entry) => entry.project_id === project.id).map((entry) => entry.id);
    // An archived project may not contribute workspaces to the active snapshot.
    // Preserve their local order until that project is restored and refreshed.
    return [project.id, archivedProjects.some((archived) => archived.id === project.id) && !current.length ? sidebarOrder.workspaces[project.id] ?? [] : current];
  })), [projects, archivedProjects, workspaces, sidebarOrder.workspaces]);
  const availableSidebarOrder = useMemo(() => ({ apps: registeredSidebarEntries.map((entry) => entry.id), projects: projects.map((entry) => entry.id), archivedProjects: archivedProjects.map((entry) => entry.id), workspaces: availableSidebarWorkspaces }), [registeredSidebarEntries, projects, archivedProjects, availableSidebarWorkspaces]);
  useEffect(() => { writeSidebarOrder(sidebarOrder); }, [sidebarOrder]);
  useEffect(() => {
    if (!workspaceReady) return;
    setSidebarOrder((current) => {
      const next = reconcileSidebarOrder(current, { ...availableSidebarOrder, workspaces: { ...availableSidebarWorkspaces } });
      return JSON.stringify(next) === JSON.stringify(current) ? current : next;
    });
  }, [workspaceReady, availableSidebarOrder, availableSidebarWorkspaces]);
  const reorderSidebar = useCallback((group: SidebarOrderGroup, sourceId: string, targetId: string, after: boolean, parentId?: string) => {
    setSidebarOrder((current) => moveSidebarOrder(reconcileSidebarOrder(current, { ...availableSidebarOrder, workspaces: { ...availableSidebarWorkspaces } }), group, sourceId, targetId, after, parentId));
  }, [availableSidebarOrder, availableSidebarWorkspaces]);
  const moduleCommands: PaletteCommand[] = flatModuleEntries.map((entry) => ({
    id: entry.commandId,
    group: t("Research Apps"),
    label: t(entry.labelKey),
    icon: <entry.icon size={15} />,
    run: () => activateSidebarEntry(entry),
  }));
  const moduleButton = (entry: SidebarEntry) => {
    const ids = flatModuleEntries.map((item) => item.id);
    const reorderByKeyboard = (event: React.KeyboardEvent<HTMLButtonElement>) => {
      if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
      const index = ids.indexOf(entry.id);
      const target = ids[index + (event.key === "ArrowUp" ? -1 : 1)];
      if (!target) return;
      event.preventDefault();
      reorderSidebar("apps", entry.id, target, event.key === "ArrowDown");
      setSidebarOrderAnnouncement(t("Moved {name} to position {position} of {count}.", { name: t(entry.labelKey), position: index + (event.key === "ArrowUp" ? 0 : 2), count: ids.length }));
    };
    return <button className={`codex-nav-item${mainSection === entry.destination.section ? " active" : ""}${sidebarAppDragging === entry.id ? " sidebar-dragging" : ""}${sidebarAppDropTarget === entry.id ? " sidebar-drop-target" : ""}`} key={entry.id}
      draggable
      aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
      onKeyDown={reorderByKeyboard}
      onDragStart={(event) => { sidebarItemDragRef.current = { group: "apps", id: entry.id }; setSidebarAppDragging(entry.id); suppressSidebarAppClickUntil.current = Date.now() + 500; event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", entry.id); }}
      onDragOver={(event) => { const drag = sidebarItemDragRef.current; if (!drag || drag.group !== "apps" || drag.id === entry.id) return; event.preventDefault(); event.dataTransfer.dropEffect = "move"; setSidebarAppDropTarget(entry.id); }}
      onDrop={(event) => { const drag = sidebarItemDragRef.current; if (!drag || drag.group !== "apps" || drag.id === entry.id) return; event.preventDefault(); const rect = event.currentTarget.getBoundingClientRect(); reorderSidebar("apps", drag.id, entry.id, event.clientY >= rect.top + rect.height / 2); sidebarItemDragRef.current = null; setSidebarAppDragging(null); suppressSidebarAppClickUntil.current = Date.now() + 500; setSidebarAppDropTarget(null); }}
      onDragEnd={() => { sidebarItemDragRef.current = null; setSidebarAppDragging(null); setSidebarAppDropTarget(null); suppressSidebarAppClickUntil.current = Date.now() + 500; }}
      onClick={() => { if (Date.now() >= suppressSidebarAppClickUntil.current) activateSidebarEntry(entry); }}
      title={`${t(entry.labelKey)} · ${t("Drag to reorder. Use Alt+ArrowUp or Alt+ArrowDown.")}`} disabled={entry.disabled}>
      <entry.icon size={15} /><span>{t(entry.labelKey)}</span>{entry.badge && <span className="nav-tail">{t(entry.badge)}</span>}
    </button>;
  };
  const paletteCommands: PaletteCommand[] = [
    { id: "new-research", group: t("Work"), label: t("New research task"), detail: t("Start a chat in the current project"), shortcut: "Ctrl N", icon: <Plus size={15} />, run: () => startNewTask() },
    { id: "new-project", group: t("Work"), label: t("New project"), detail: t("Bind a folder for related chats"), icon: <FolderOpen size={15} />, run: openNewProject },
    { id: "open-chat", group: t("Work"), label: t("Open current chat"), icon: <MessageCircle size={15} />, run: () => setMainSection("chat") },
    { id: "research-path", group: t("Panels"), label: t("Research path"), detail: researchPanelOpen ? t("Hide the Research path panel") : t("Show the Research path panel"), icon: <Route size={15} />, run: () => setResearchPanelOpen((open) => !open) },
    { id: "proactive-agent", group: t("Panels"), label: t("Proactive agent"), detail: proactive.settings.mode === "off" ? (proactive.modelReady ? t("Start proactive suggestions") : t("Set up proactive suggestions")) : t("Review suggestions"), icon: <Sparkle size={15} />, run: toggleProactiveDock },
    { id: "proactive-settings", group: t("System"), label: t("Proactive settings"), icon: <Shield size={15} />, run: () => { setSettingsSection("proactive"); setSettingsOpen(true); } },
    ...moduleCommands,
    { id: "extensions-installed", group: t("Extensions"), label: t("Installed extensions"), icon: <Puzzle size={15} />, run: () => { setExtensionsTab("installed"); setMainSection("extensions"); } },
    { id: "extensions-available", group: t("Extensions"), label: t("Browse extensions"), icon: <Puzzle size={15} />, run: () => { setExtensionsTab("available"); setMainSection("extensions"); } },
    { id: "extensions-updates", group: t("Extensions"), label: t("Extension updates"), icon: <Puzzle size={15} />, run: () => { setExtensionsTab("updates"); setMainSection("extensions"); } },
    { id: "files", group: t("Panels"), label: t("Files"), detail: t("Open the workbench file browser"), icon: <FolderOpen size={15} />, run: () => openWorkbench("files") },
    { id: "terminal", group: t("Panels"), label: t("Terminal"), detail: executionWorkspace, icon: <SquareTerminal size={15} />, run: () => openWorkbench("terminal") },
    { id: "journey", group: t("Panels"), label: t("Journey"), icon: <Flag size={15} />, run: () => openWorkbench("journey") },
    { id: "changes", group: t("Panels"), label: t("Changes"), icon: <GitCompareArrows size={15} />, run: () => openWorkbench("changes") },
    { id: "notes", group: t("Panels"), label: t("Notes"), icon: <NotebookPen size={15} />, run: () => openWorkbench("notes") },
    { id: "reveal-folder", group: t("System"), label: t("Show working folder"), detail: executionWorkspace, icon: <FolderOpen size={15} />, run: () => void desktopBridge.revealWorkspace?.(executionWorkspace).catch(() => undefined) },
    { id: "settings", group: t("System"), label: t("Settings"), shortcut: "Ctrl ,", icon: <Settings size={15} />, run: () => { setSettingsSection("general"); setSettingsOpen(true); } },
    { id: "toggle-sidebar", group: t("System"), label: sidebarHidden ? t("Show sidebar") : t("Hide sidebar"), icon: <PanelLeftOpen size={15} />, run: () => setSidebarHidden((hidden) => !hidden) },
  ];

  // Declarative view host for sidebar modules: the JSX per module is declared
  // once here and projected by the host loop in the render below. Activate /
  // mount gating (keepMounted · cacheClass · requiresWorkspace · open gate)
  // comes from the module registry, not from scattered conditions.
  const sidebarModuleContent: Record<string, ReactNode> = {
    library: <LibraryView key={workspace} bridge={desktopBridge} mode="library" active={mainSection === "library"} workspace={workspace} projectId={activeProjectId} libraryRefreshVersion={libraryRefreshVersion} onInternalReviewThreadsDeleted={(threadIds) => setThreads((current) => current.filter((thread) => !threadIds.includes(thread.id)))} onReproduceOpened={(id) => { setReproduceId(id); setMainSection("reproduce"); }} onOpenProject={(id) => setActiveProjectId(id)} />,
    daily: <LibraryView key={dailyStartMode} bridge={desktopBridge} mode="daily" active={mainSection === "daily"} initialDailyMode={dailyStartMode} workspace={workspace} projectId={activeProjectId} onLibraryImported={() => setLibraryRefreshVersion((version) => version + 1)} onInternalReviewThreadsDeleted={(threadIds) => setThreads((current) => current.filter((thread) => !threadIds.includes(thread.id)))} onReproduceOpened={(id) => { setReproduceId(id); setMainSection("reproduce"); }} onOpenProject={(id) => setActiveProjectId(id)} />,
    "benchmark-radar": <BenchmarkRadarView />,
    news: <NewsView bridge={desktopBridge} projectId={activeProjectId} active={mainSection === "news"} onSendToChat={sendNoteToChat} />,
    "paper-review": <PaperReviewView bridge={desktopBridge} workspace={executionWorkspace} projectId={activeProjectId} active={mainSection === "paper-review"} />,
    extensions: <ExtensionsView bridge={desktopBridge} workspace={executionWorkspace} tab={extensionsTab} onTabChange={setExtensionsTab} attachedIds={new Set(contextItems.map((item) => item.id))} onAttach={(item) => setContextItems((current) => current.some((candidate) => candidate.id === item.id) ? current : [...current, item].slice(0, 12))} />,
    reproduce: <ReproduceView bridge={desktopBridge} selectedId={reproduceId} onSelect={setReproduceId} />,
    "image-creation": <ImageCreationView active={mainSection === "image-creation"} onBrowseProceedings={() => { setDailyStartMode("conference"); setMainSection("daily"); }} />,
    "data-charts": <DataChartsView active={mainSection === "data-charts"} />,
    "data-analysis": <DataAnalysisView onAskAI={(text) => sendNoteToChat(text, "replace")} />,
    "paper-to-slides": <PaperToSlidesView bridge={desktopBridge} workspace={executionWorkspace} busy={agentBusy} onStart={async ({ pdfPath, backend, language, length, instructions, mineruToken }) => {
      const staged = await desktopBridge.stagePaperToSlidesPdf(executionWorkspace, pdfPath);
      startNewTask();
      const prompt = [`Create a paper presentation using the bundled paper2slides skill.`, `Input PDF: ${JSON.stringify(staged)}`, `Slide and speaker-note language: ${language}.`, `Length: ${length}.`, `Use relevant original figures and tables; check visual quality and factual accuracy. Save an editable PPTX and report the output path.`, instructions ? `Additional user instructions: ${instructions}` : ""].filter(Boolean).join("\n");
      await submitPrompt(prompt, "free-chat", reasoningEffort, contextLength, [], "paper-to-slides", backend, true, mineruToken || undefined);
    }} />,

    writing: <PaperWritingView bridge={desktopBridge} workspace={executionWorkspace} projectId={activeProjectId} openRequest={paperOpenRequest} onRefresh={refreshWorkspaceFiles} onAskAI={askAIAboutPaper} active={mainSection === "writing"} />,
  };
  for (const entry of pluginEntries) {
    sidebarModuleContent[entry.id] = <PluginModuleView key={entry.id} entry={entry} />;
  }
  const sidebarModuleOpen: Partial<Record<string, boolean>> = { "image-creation": imageCreationOpened, "data-charts": dataChartsOpened, "data-analysis": dataAnalysisOpened };

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
          <div className="sidebar-section-label">
            <span>{t("Research Apps")}</span>
            <button className="sidebar-apps-manage" title={t("Manage Research Apps")} aria-label={t("Manage Research Apps")} onClick={() => { setSettingsSection("plugins"); setSettingsOpen(true); }}><Plus size={13} /></button>
          </div>
          <div className="sidebar-module-list">{flatModuleEntries.map(moduleButton)}</div>
        </nav>

        <ProjectSidebar
          projects={projects}
          archivedProjects={archivedProjects}
          workspaces={workspaces}
          order={sidebarOrder}
          onReorder={reorderSidebar}
          activeProjectId={activeProjectId}
          activeWorkspaceId={activeWorkspace?.id ?? null}
          disabled={agentBusy}
          onNewProject={openNewProject}
          onNewWorkspace={(projectId, kind) => openWorkspaceCreator(projectId, kind)}
          onRenameProject={(projectId, name) => renameProject(projectId, name)}
          onArchiveProject={(project, archived) => void archiveProject(project, archived)}
          onRemoveProject={setProjectToRemove}
          onChangeProjectWorkspace={(project) => void changeProjectWorkspace(project)}
          onOpenWorkspace={(workspaceToOpen) => void selectWorkspace(workspaceToOpen)}
          onRenameWorkspace={openWorkspaceRename}
          onDeleteWorkspace={(workspaceToDelete) => void deleteWorkspace(workspaceToDelete)}
          filterError={projectFolderError}
        />
        <span className="sidebar-order-live" aria-live="polite">{sidebarOrderAnnouncement}</span>

        <div className="sidebar-runtime">
          <AccountChip compact authState={authState} identity={localIdentity} onOpenAuth={() => openAuth("choice")} onOpenAccountSettings={() => { setSettingsSection("account"); setSettingsOpen(true); }} onSignOut={signOut} />
          {availableAppUpdate && <button className="sidebar-footer-update" onClick={() => {
            const requested = availableAppUpdate.url;
            let url = "https://github.com/Johanson-colab/Archimedes/releases/latest";
            if (requested) {
              try {
                const parsed = new URL(requested);
                if (parsed.protocol === "https:" && parsed.hostname === "github.com" && parsed.pathname.startsWith("/Johanson-colab/Archimedes/releases")) url = parsed.toString();
              } catch { /* Use the canonical releases page. */ }
            }
            void desktopBridge.openExternalUrl(url).catch(() => undefined);
          }} title={t("Update available: {version}", { version: availableAppUpdate.version })} aria-label={t("Update available: {version}", { version: availableAppUpdate.version })}>
            <span>{t("Update")}</span>
          </button>}
          <span className="sidebar-footer-version" title={t("Application version {version}", { version: packageMetadata.version })}>v{packageMetadata.version}</span>
          <button className="sidebar-footer-settings" onClick={() => { setSettingsSection("general"); setSettingsOpen(true); }} title={t("Settings")} aria-label={t("Settings")}>
            <Settings size={16} strokeWidth={1.7} aria-hidden="true" />
          </button>
        </div>
        <div className="sidebar-resizer" role="separator" aria-orientation="vertical" aria-label="Resize sidebar" aria-valuemin={SIDEBAR_MIN_WIDTH} aria-valuemax={SIDEBAR_MAX_WIDTH} aria-valuenow={sidebarWidth} tabIndex={0} onPointerDown={beginSidebarResize} onPointerMove={moveSidebarResize} onPointerUp={endSidebarResize} onPointerCancel={endSidebarResize} onDoubleClick={() => setSidebarWidth(SIDEBAR_DEFAULT_WIDTH)} onKeyDown={handleSidebarResizeKey} />
      </aside>

      <section className={workbenchOpen ? "codex-main workbench-open" : "codex-main"} style={{ "--workbench-width": workbenchOpen ? `${workbenchWidth}px` : "0px" } as React.CSSProperties}>
        <header className="main-toolbar" data-ui="application-toolbar">
          {sidebarHidden && <button className="quiet-icon-button sidebar-restore-button" onClick={() => setSidebarHidden(false)} title={t("Show sidebar")} aria-label={t("Show sidebar")} aria-pressed={sidebarHidden}><PanelLeftOpen size={17} /></button>}
          <SessionSwitcher
            project={activeProject}
            workspace={activeWorkspace}
            workspaces={projectWorkspaces}
            sessions={workspaceSessions}
            archivedSessions={archivedWorkspaceSessions}
            activeSessionId={activeThreadId}
            runningThreadId={runningThreadId}
            currentUserId={localIdentity?.userId ?? "local-user"}
            creatingWorkspace={creatingWorkspace}
            onOpenSession={(session) => void openResearchThread(session)}
            onNewSession={() => startNewTask()}
            onPinSession={(session, pinned) => void pinSession(session, pinned)}
            onArchiveSession={(session, archived) => void archiveThread(session, archived)}
            onSelectWorkspace={(workspaceToOpen) => void selectWorkspace(workspaceToOpen)}
            onCreateWorkspace={(kind) => void createWorkspace(kind)}
            onRenameWorkspace={openWorkspaceRename}
            onDeleteWorkspace={(workspaceToDelete) => void deleteWorkspace(workspaceToDelete)}
            openSignal={sessionSwitcherSignal}
          />
          <div className="main-toolbar-actions">
            <div id="module-toolbar-actions" className="module-toolbar-actions" />
            {presenceMembers.length > 0 && <div className="presence-stack" title={presenceMembers.map((member) => member.displayName).join(", ")} aria-label={`${presenceMembers.length} collaborators online`}>
              {presenceMembers.slice(0, 4).map((member) => <span className="presence-avatar" key={member.key} title={member.displayName}>{member.displayName.slice(0, 1).toUpperCase()}</span>)}
              {presenceMembers.length > 4 && <span className="presence-avatar more">+{presenceMembers.length - 4}</span>}
            </div>}
            {activeThreadId && sessionTools.showSnapshots && <button className="quiet-icon-button" onClick={() => void openThreadShare()} title={t("Share session snapshot")} aria-label={t("Share session snapshot")}><Share2 size={15} /></button>}
            {activeThreadId && sessionTools.showComments && <button className={commentsOpen ? "quiet-icon-button active" : "quiet-icon-button"} onClick={() => { setMainSection("chat"); setCommentsOpen((open) => !open); }} aria-pressed={commentsOpen} title={t("Session comments")} aria-label={t("Session comments")}><MessageCircleReply size={15} /></button>}
            <button
              className={researchPanelOpen ? "quiet-icon-button dock-toggle open" : "quiet-icon-button dock-toggle"}
              onClick={() => setResearchPanelOpen((open) => !open)}
              title={researchPanelOpen ? t("Hide Research path") : t("Show Research path")}
              aria-label={researchPanelOpen ? t("Hide Research path") : t("Show Research path")}
              aria-pressed={researchPanelOpen}
            >
              <Route size={16} />
            </button>
            <button
              className={proactive.open ? "quiet-icon-button dock-toggle open" : "quiet-icon-button dock-toggle"}
              onClick={toggleProactiveDock}
              title={proactive.settings.mode === "off" ? (proactive.modelReady ? t("Start Proactive agent") : t("Set up Proactive agent")) : proactive.open ? t("Hide Proactive agent") : t("Show Proactive agent")}
              aria-label={proactive.open ? t("Hide Proactive agent") : t("Show Proactive agent")}
              aria-pressed={proactive.open}
            >
              <Sparkle size={16} />
              {proactive.queuedCount > 0 && <span className="dock-badge" aria-label={`${proactive.queuedCount} queued suggestions`}>{proactive.queuedCount > 9 ? "9+" : proactive.queuedCount}</span>}
            </button>
            <button className={workbenchOpen ? "quiet-icon-button workbench-toggle open" : "quiet-icon-button workbench-toggle"} onClick={toggleWorkbench} title={workbenchOpen ? `${t("Hide workbench")} (Ctrl+\`)` : `${t("Show workbench")} (Ctrl+\`)`} aria-label={workbenchOpen ? t("Hide workbench") : t("Show workbench")} aria-pressed={workbenchOpen}>
              <PanelRight size={17} />
            </button>
          </div>
        </header>

        <div className="main-workspace" ref={mainWorkspaceRef}>
        <div className={mainSection === "chat" ? `main-view chat-main${sideThread ? " has-side-chat" : ""}` : "main-view knowledge-main"}>
          {mainSection === "chat" && (
            <ConversationView
              key={activeThreadId ?? `new:${chatViewNonce}`}
              commentScope={sessionCommentsScope}
              addingComment={commentsOpen}
              commentsShowResolved={sessionTools.commentsShowResolved}
              onExitComments={exitSessionComments}
              messages={messages}
              events={events}
              trajectoryEvents={combinedTrajectoryEvents}
              nativeBackend={selectedNativeBackend}
              harnessBound={Boolean(boundHarness)}
              onHarnessChange={async (backend) => {
                if (agentBusy) throw new Error(t("Stop the running turn before using this command."));
                const current = await desktopBridge.getAgentBackendConfig();
                const target = backend === "api" ? "codex" : backend;
                const profile = current.profiles?.[target] || (current.backend === backend ? current : { binary: target, model: "", effort: "", permissionMode: target === "codex" ? "read-only" as const : "ask" as const });
                const saved = await desktopBridge.saveAgentBackendConfig({ ...profile, backend });
                setNativeBackend(saved);
                if (boundHarness && backend !== boundHarness) startNewTask();
              }}
              nativeQuestions={agentBusy ? nativeQuestions.filter((item) => item.threadId === activeThreadId).map((item) => item.question) : []}
              onNativeAnswer={(id, answers) => desktopBridge.answerNativeAgentQuestion(activeThreadId!, id, answers, workspace)}
              onNativeSteer={(text) => desktopBridge.steerNativeAgent(activeThreadId!, text, workspace)}
              workspace={executionWorkspace}
              projectId={activeProjectId}
              onOpenWorkspaceSettings={() => { setSettingsSection("workspace"); setSettingsOpen(true); }}
              onCommand={runConversationCommand}
              contextSummary={threads.find((thread) => thread.id === activeThreadId)?.context_summary}
              compactedThroughTurnId={threads.find((thread) => thread.id === activeThreadId)?.context_summary_through_turn_id}
              agentBusy={agentBusy}
              interrupting={interrupting}
              pendingAction={pendingAction}
              changeSets={changeSets}
              onSubmit={submitPrompt}
              onInterrupt={() => void interruptResearchTurn()}
              canInterrupt={Boolean(runningThreadId) && !interrupting}
              researchMode={researchMode}
              onResearchMode={setResearchMode}
              reasoningEffort={reasoningEffort}
              contextLength={contextLength}
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
              draftKey={composerDraftKey}
              initialScrollTop={conversationScrollPositionsRef.current.get(conversationScrollKey) ?? null}
              onScrollTop={(top) => conversationScrollPositionsRef.current.set(conversationScrollKey, top)}
              currentFile={selectedFile}
              currentSelection={fileSelection}
              onComposerRequestApplied={(id) => setComposerRequest((current) => current?.id === id ? null : current)}
            />
          )}
          {sideThread && <div className={mainSection === "chat" ? "side-chat-host" : "side-chat-host hidden"}><SideConversation key={sideThread.id} bridge={desktopBridge} initialThread={sideThread} dataWorkspace={workspace} reasoningEffort={reasoningEffort} contextLength={contextLength} onBusyChange={setSideBusy} onClose={() => setSideThread(null)} onOpenMain={(thread) => { setSideThread(null); void openResearchThread(thread); }} onUpdated={(thread) => { setSideThread((current) => current?.id === thread.id ? thread : current); setThreads((current) => [thread, ...current.filter((item) => item.id !== thread.id)]); }} /></div>}
          <Suspense fallback={null}>
            {/* View host sidebar-modules: one looping projection, semantics derived from the module registry (keepMounted/cacheClass/requiresWorkspace/open gate). */}
            {(Object.entries(sidebarModuleContent) as [string, ReactNode][]).map(([id, content]) => {
              const entry = sidebarModule(id);
              if (!entry || hiddenCoreModules.has(id)) return null;
              const active = mainSection === id;
              const opened = sidebarModuleOpen[id] !== false;
              const ready = !entry.requiresWorkspace || workspaceReady;
              if (entry.keepMounted) {
                if (!opened || !entry.cacheClass) return null;
                return (
                  <div key={id} className={active ? entry.cacheClass : `${entry.cacheClass} hidden`} aria-hidden={!active}>
                    {ready ? content : null}
                  </div>
                );
              }
              return active && opened && ready ? <Fragment key={id}>{content}</Fragment> : null;
            })}
          </Suspense>
          {mainSection === "files" && (
            <FilesView workspace={executionWorkspace} tree={fileTree} openFiles={openFiles} selectedPath={selectedFilePath} directoryRequest={directoryRequest} onDirectoryRequestHandled={clearDirectoryRequest} file={selectedFile} loading={fileLoading} error={fileError} loadingDirectories={loadingDirectories} drafts={fileDrafts} dirtyFiles={dirtyFilePaths} savingFiles={fileSaving} conflicts={fileConflicts} saveErrors={fileErrors} onOpenFile={(filePath) => void openFilePane(filePath, "page")} onSelectOpenFile={(file) => selectOpenFilePane(file, "page")} onCloseFile={closeFilePane} onCloseOtherFiles={(filePath) => void closeOtherFilePanes(filePath)} onCloseAllFiles={() => void closeAllFilePanes()} onLoadDirectory={(directory) => void loadWorkspaceDirectory(directory)} onRefresh={() => void refreshWorkspaceFiles()} onNewFile={() => setModal("file")} onDraftChange={updateFileDraft} onSave={(filePath) => void saveFile(filePath)} onReload={(filePath) => void reloadFile(filePath)} onDismissConflict={dismissFileConflict} onAddComment={addFileComment} onFileSelectionChange={(path, selection) => setFileSelection(selection ? { file: selectedFile ?? { name: path.split("/").at(-1) ?? path, path, kind: "text", size: 0, modifiedAt: "" }, selection } : null)}
              onRestore={() => { setMainSection("chat"); openWorkbench("files"); }} />
          )}
        </div>
        <AgentLayer
          proactiveOpen={proactive.open}
          researchOpen={researchPanelOpen}
          proactive={<ProactiveAgentPanel
            controller={proactive}
            onOpenSettings={() => { setSettingsSection("proactive"); setSettingsOpen(true); }}
            onCollapse={() => proactive.setOpen(false)}
          />}
          research={<ResearchPathPanel
            stages={researchStages}
            activeStage={pathStage}
            acceptedStages={pathAcceptedStages}
            staleStages={pathStaleStages}
            selectedStage={selectedStage}
            agentBusy={agentBusy && Boolean(pathThread) && runningThreadId === pathThread?.id}
            notice={pathThreadIsActive ? journeyNotice : ""}
            projectName={pathProject?.name ?? t("No project")}
            threadTitle={pathThread?.title ?? t("No active session")}
            pinned={pathIsPinned}
            threadInactive={pathThreadInactive}
            hasThread={Boolean(pathThread)}
            onSelectStage={setSelectedStage}
            onAccept={acceptCurrentCheckpoint}
            onRequestChanges={requestCheckpointChanges}
            onBranch={branchFromCheckpoint}
            onReturn={returnToStage}
            onTogglePin={togglePathPin}
            onOpenThread={openPathThread}
            onCollapse={() => setResearchPanelOpen(false)}
          />}
        />
        </div>
        <RightWorkbench
          open={workbenchOpen}
          width={workbenchWidth}
          preferences={workbenchPreferences}
          badges={{ changes: changesBadge, files: dirtyFilePaths.size, artifacts: artifactsBadge }}
          onTabChange={chooseWorkbenchTab}
          onPreferencesChange={updateWorkbenchPreferences}
          onOpenSettings={() => { setSettingsSection("workbench"); setSettingsOpen(true); }}
          onWidthChange={(width) => setWorkbenchWidth(clampWorkbenchWidth(width))}
          panels={{
            journey: <JourneyView
              bridge={desktopBridge}
              thread={activeThread ?? null}
              events={trajectoryEvents}
              modeLabel={researchModes.find((mode) => mode.id === researchMode)?.label ?? researchMode}
              settings={journeySettings}
              pendingAction={pendingAction}
              agentBusy={agentBusy && Boolean(activeThreadId) && runningThreadId === activeThreadId}
              active={workbenchOpen && workbenchActiveTabs.has("journey")}
              onOpenTrajectory={() => openTrajectoryAt()}
              onOpenTrajectoryAt={openTrajectoryAt}
              onOpenSettings={() => { setSettingsSection("journey"); setSettingsOpen(true); }}
              onReviewPending={reviewPendingAction}
              onStartResearch={() => startNewTask()}
            />,
            trajectory: <TrajectoryView
              thread={activeThread ?? null}
              events={trajectoryEvents}
              provider={activeModelConfig?.provider}
              model={activeModelConfig?.model}
              modeLabel={researchModes.find((mode) => mode.id === researchMode)?.label ?? researchMode}
              onCopy={(text) => desktopBridge.writeClipboardText(text)}
              onOpenJourney={() => chooseWorkbenchTab("journey")}
              focusOrdinal={trajectoryFocusOrdinal}
              onFocusApplied={() => setTrajectoryFocusOrdinal(null)}
            />,
            files: <FilesView
              compact
              compactWidth={workbenchFilesPaneWidth}
              workspace={executionWorkspace}
              tree={fileTree}
              openFiles={openFiles}
              selectedPath={selectedFilePath}
              directoryRequest={directoryRequest}
              onDirectoryRequestHandled={clearDirectoryRequest}
              file={selectedFile}
              loading={fileLoading}
              error={fileError}
              loadingDirectories={loadingDirectories}
              drafts={fileDrafts}
              dirtyFiles={dirtyFilePaths}
              savingFiles={fileSaving}
              conflicts={fileConflicts}
              saveErrors={fileErrors}
              onOpenFile={(filePath) => void openFilePane(filePath)}
              onSelectOpenFile={(file) => selectOpenFilePane(file)}
              onCloseFile={closeFilePane}
              onCloseOtherFiles={(filePath) => void closeOtherFilePanes(filePath)}
              onCloseAllFiles={() => void closeAllFilePanes()}
              onLoadDirectory={(directory) => void loadWorkspaceDirectory(directory)}
              onRefresh={() => void refreshWorkspaceFiles()}
              onNewFile={() => setModal("file")}
              onDraftChange={updateFileDraft}
              onSave={(filePath) => void saveFile(filePath)}
              onReload={(filePath) => void reloadFile(filePath)}
              onDismissConflict={dismissFileConflict}
              onAddComment={addFileComment}
              onFileSelectionChange={(path, selection) => setFileSelection(selection ? { file: selectedFile ?? { name: path.split("/").at(-1) ?? path, path, kind: "text", size: 0, modifiedAt: "" }, selection } : null)}
              onOpenFull={() => { setMainSection("files"); setWorkbenchOpen(false); }}
            />,
            artifacts: <ArtifactsPanel
              bridge={desktopBridge}
              workspace={executionWorkspace}
              threadId={activeThreadId}
              currentTurnId={trajectoryEvents.at(-1)?.turn_id ?? null}
              changeSets={changeSets}
              active={workbenchOpen && workbenchActiveTabs.has("artifacts")}
              version={artifactsVersion}
              onOpenFile={(filePath) => void openFilePane(filePath)}
              onSeen={() => setArtifactsBadge(0)}
            />,
            changes: <ChangesView changeSets={changeSets} hasThread={Boolean(activeThreadId)} onOpenFile={openChangedFile} />,
            notes: <NotesView
              value={noteValue}
              loading={noteLoadedKey !== noteKey}
              saveState={noteSaveState}
              contextLabel={activeThreadId ? t("Conversation notes") : t("New conversation notes")}
              onChange={(content) => setNoteValues((current) => ({ ...current, [noteKey]: content }))}
              onSend={sendNoteToChat}
            />,
            browser: <BrowserView active={workbenchOpen && workbenchActiveTabs.has("browser")} onOpenExternal={(url) => desktopBridge.openExternalUrl(url)} />,
            terminal: <TerminalPanel
              bridge={desktopBridge}
              open={workbenchOpen && workbenchActiveTabs.has("terminal")}
              theme={theme}
              workspace={executionWorkspace}
              settings={terminalSettings}
              orientation="right"
              onClose={() => chooseWorkbenchTab("journey")}
              onOpenSettings={() => { setSettingsSection("terminal"); setSettingsOpen(true); }}
            />,
          }}
        />
      </section>

      {proactiveNotice && <div className="proactive-toast" role="status">
        <Sparkle size={14} />
        <span>{proactiveNotice}</span>
        <button onClick={() => setProactiveNotice("")} aria-label={t("Dismiss")}><X size={12} /></button>
      </div>}

      <WorkspaceModal
        modal={modal}
        fileName={fileName}
        onFileName={setFileName}
        onClose={() => setModal(null)}
        onCreateFile={() => void createFile()}
      />
      <TerminalSettingsModal open={terminalSettingsOpen && terminalSettingsMode === "onboarding"} mode="onboarding" settings={terminalSettings} workspace={executionWorkspace} onClose={closeTerminalSettings} onSave={saveTerminalSettings} onOpenExternal={openExternalTerminal} />
      <AuthModal
        open={authModalOpen}
        authState={authState}
        initialMode={authModalMode}
        onClose={() => setAuthModalOpen(false)}
        onSignIn={signIn}
        onSignUp={signUpAndConfirm}
        onMagicLink={signInWithMagicLink}
        onOAuth={signInWithOAuth}
        onResetPassword={requestPasswordReset}
        onUpdatePassword={updateCloudPassword}
        onOpenExternal={(url) => { void desktopBridge.openExternalUrl?.(url); }}
      />
      <SettingsModal
        open={settingsOpen}
        section={settingsSection}
        onSectionChange={setSettingsSection}
        onClose={() => setSettingsOpen(false)}
        themePreference={themePreference}
        theme={theme}
        systemAppearance={systemAppearance}
        onThemePreferenceChange={setThemePreference}
        appearance={appearance}
        onAppearanceChange={setAppearance}
        bridge={desktopBridge}
        onModelSaved={setActiveModelConfig}
        executionPreferences={{ reasoningEffort, contextLength, capabilities: modelCapabilities, onReasoningEffort: setReasoningEffort, onContextLength: setContextLength }}
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
        workbenchPreferences={workbenchPreferences}
        onChangeWorkbenchPreferences={updateWorkbenchPreferences}
        onResetWorkbenchPreferences={() => void resetWorkbenchPreferences()}
        proactiveSettings={proactive.settings}
        onChangeProactiveSettings={(patch) => {
          proactive.setSettings(patch);
          if (proactive.settings.mode === "off" && patch.mode && patch.mode !== "off" && patch.mode !== "random") proactive.setOpen(true);
        }}
        onResetProactiveHistory={proactive.resetHistory}
        proactiveHistoryCount={proactive.state.suggestions.length}
        onObserveProactive={proactive.observeOnce}
        sessionTools={sessionTools}
        onSessionToolsChange={(patch) => setSessionTools((current) => ({ ...current, ...patch }))}
        identity={localIdentity}
        onSaveIdentity={saveLocalIdentity}
        activeProject={activeProject}
        activeThreadId={activeThreadId}
        onProjectsChanged={refreshWorkspaceProjects}
        authState={authState}
        onSignIn={signIn}
        onSignUp={signUp}
        onSignOut={signOut}
        onOpenAuth={(mode) => { setSettingsOpen(false); openAuth(mode || "choice"); }}
        onPluginsChanged={refreshSidebarPlugins}
        disabledCoreModules={disabledCoreModules}
        onCoreModuleEnabled={setCoreModuleEnabled}
      />
      <ThreadShareModal
        signedIn={Boolean(authState?.user)}
        key={`${shareSnapshot?.id ?? "none"}:${authState?.user?.id ?? "signed-out"}`}
        snapshot={shareSnapshot}
        bridge={desktopBridge}
        projectId={activeThread?.project_id || activeProjectId || ""}
        threadId={activeThreadId || ""}
        threadTitle={activeThread?.title ?? t("Research session")}
        privateThread={threadVisibility === "private"}
        defaults={{ format: sessionTools.snapshotFormat, sources: sessionTools.snapshotSources, diagnostics: sessionTools.snapshotDiagnostics }}
        onClose={() => setShareSnapshot(null)}
        onCopy={(text) => desktopBridge.writeClipboardText(text)}
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
      <WorkspaceDialog
        open={Boolean(workspaceDialog)}
        mode={workspaceDialog?.mode ?? "create"}
        projectName={workspaceDialogProject?.name}
        workspace={workspaceDialog?.mode === "rename" ? workspaceDialog.workspace : null}
        suggestedName={workspaceSuggestion}
        initialKind={workspaceDialog?.mode === "create" ? workspaceDialog.kind : "sandbox"}
        canWorktree={workspaceDialogProject?.git_state === "ready"}
        busy={creatingWorkspace}
        error={workspaceDialogError}
        onClose={() => { if (!creatingWorkspace) { setWorkspaceDialog(null); setWorkspaceDialogError(""); } }}
        onSubmit={(input) => void submitWorkspaceDialog(input)}
      />
      <CommandPalette open={paletteOpen} commands={paletteCommands} onClose={() => setPaletteOpen(false)} />
      <ProjectRemoveModal project={projectToRemove} onClose={() => setProjectToRemove(null)} onRemove={() => projectToRemove && void removeProject(projectToRemove)} />
    </main>
  );
}

const ConversationHistory = memo(function ConversationHistory({ messages, events, trajectoryEvents, agentBusy, interrupting, pendingAction, changeSets, welcomeVisible, onWelcomeAction, onApprove, onReject, onOpenFile, initialScrollTop, onScrollTop, commentScope, addingComment, commentsShowResolved, onExitComments }: {
  commentScope: SessionCommentsScope | null;
  addingComment: boolean;
  commentsShowResolved: boolean;
  onExitComments: () => void;
  messages: Message[];
  events: TimelineEvent[];
  trajectoryEvents: ResearchEvent[];
  agentBusy: boolean;
  interrupting: boolean;
  pendingAction: PendingAction | null;
  changeSets: WorkspaceChangeSet[];
  welcomeVisible: boolean;
  onWelcomeAction: (action: ResearchWelcomeAction) => void;
  onApprove: () => void;
  onReject: () => void;
  onOpenFile: (filePath: string) => void;
  initialScrollTop: number | null;
  onScrollTop: (top: number) => void;
}) {
  const { t } = useUISettings();
  const [autoRunIn, setAutoRunIn] = useState<number | null>(null);
  const approveRef = useRef(onApprove);
  useEffect(() => { approveRef.current = onApprove; }, [onApprove]);
  const autoRunId = pendingAction?.kind === "command" && pendingAction.payload.managedByAgent ? pendingAction.id : null;
  useEffect(() => {
    if (!autoRunId) {
      setAutoRunIn(null);
      return;
    }
    const started = Date.now();
    setAutoRunIn(10);
    const timer = window.setInterval(() => {
      const remaining = Math.max(0, 10 - Math.floor((Date.now() - started) / 1000));
      setAutoRunIn(remaining);
      if (remaining <= 0) {
        window.clearInterval(timer);
        approveRef.current();
      }
    }, 200);
    return () => window.clearInterval(timer);
  }, [autoRunId]);
  const [historyStart, setHistoryStart] = useState(() => Math.max(0, messages.length - INITIAL_VISIBLE_MESSAGE_COUNT));
  const historyExpandedRef = useRef(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followOutputRef = useRef(true);
  const [followingOutput, setFollowingOutput] = useState(true);
  const visibleMessages = useMemo(() => messages.slice(historyStart), [messages, historyStart]);
  const requireCommentHistory = useCallback(() => {
    historyExpandedRef.current = true;
    setHistoryStart(0);
  }, []);
  const lastUserIndex = useMemo(() => visibleMessages.reduce((last, message, index) => message.role === "user" ? index : last, -1), [visibleMessages]);
  const nativeEvents = useMemo(() => nativeTurnEvents(trajectoryEvents), [trajectoryEvents]);
  const hasStreamingText = messages.some((message) => message.role === "assistant" && message.id.endsWith(":stream") && Boolean(message.text.trim()));
  const lastNativeActivity = [...nativeEvents].reverse()
    .map((event) => (event.payload as { activity?: NativeAgentActivity } | null)?.activity)
    .find(Boolean);
  const hasRunningNativeTool = nativeEvents.some((event) => {
    const activity = (event.payload as { activity?: NativeAgentActivity } | null)?.activity;
    return activity?.status === "running";
  });
  const hasCommentaryAtTail = lastNativeActivity?.kind === "commentary" && Boolean(lastNativeActivity.output || lastNativeActivity.detail);
  const thinking = agentBusy && !hasStreamingText && !hasRunningNativeTool && !hasCommentaryAtTail && !pendingAction;
  const nativeEventsByTurn = useMemo(() => {
    const grouped = new Map<string, ResearchEvent[]>();
    for (const event of trajectoryEvents) {
      if (!event.type.startsWith("native_")) continue;
      const turn = grouped.get(event.turn_id) ?? [];
      turn.push(event); grouped.set(event.turn_id, turn);
    }
    return grouped;
  }, [trajectoryEvents]);
  const changeSetsByTurn = useMemo(() => {
    const grouped = new Map<string, WorkspaceChangeSet[]>();
    for (const changeSet of changeSets) {
      if (!changeSet.turnId) continue;
      const turn = grouped.get(changeSet.turnId) ?? [];
      turn.push(changeSet); grouped.set(changeSet.turnId, turn);
    }
    return grouped;
  }, [changeSets]);
  const lastTurnMessageIndex = useMemo(() => {
    const last = new Map<string, number>();
    visibleMessages.forEach((message, index) => {
      if (message.turn_id) last.set(message.turn_id, index);
    });
    return last;
  }, [visibleMessages]);
  const currentTurnId = visibleMessages[lastUserIndex]?.turn_id;

  const scrollToLatest = useCallback(() => {
    const container = scrollRef.current;
    if (container) container.scrollTo({ top: container.scrollHeight, behavior: "auto" });
  }, []);

  const updateFollowState = useCallback(() => {
    const container = scrollRef.current;
    if (!container) return;
    const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 56;
    if (followOutputRef.current !== isNearBottom) {
      followOutputRef.current = isNearBottom;
      setFollowingOutput(isNearBottom);
    }
  }, []);

  const handleScroll = useCallback(() => {
    updateFollowState();
    const container = scrollRef.current;
    if (container) onScrollTop(container.scrollTop);
  }, [onScrollTop, updateFollowState]);

  useLayoutEffect(() => {
    const container = scrollRef.current;
    if (!container || initialScrollTop == null) return;
    container.scrollTop = initialScrollTop;
    followOutputRef.current = false;
    setFollowingOutput(false);
    // Restore once when this session mounts; later message updates keep their
    // normal follow-output behaviour.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
  }, [messages, agentBusy, pendingAction, changeSets, welcomeVisible, scrollToLatest]);

  useEffect(() => {
    const tailStart = Math.max(0, messages.length - INITIAL_VISIBLE_MESSAGE_COUNT);
    setHistoryStart((current) => historyExpandedRef.current ? Math.min(current, tailStart) : tailStart);
  }, [messages.length]);

  const historyContent = welcomeVisible ? <ResearchWelcome onSelect={onWelcomeAction} /> : <div className="conversation-thread">
        {historyStart > 0 && <button className="conversation-load-history" onClick={() => {
          historyExpandedRef.current = true;
          setHistoryStart((current) => Math.max(0, current - HISTORY_MESSAGE_PAGE_SIZE));
        }}>
          Show {Math.min(HISTORY_MESSAGE_PAGE_SIZE, historyStart)} earlier {Math.min(HISTORY_MESSAGE_PAGE_SIZE, historyStart) === 1 ? "message" : "messages"}
        </button>}
        {visibleMessages.slice(0, lastUserIndex + 1).map((message, index) => <div key={message.id}>
          <ConversationMessage message={message} streaming={agentBusy && message.id.endsWith(":stream")} />
          {message.role === "user" && index < lastUserIndex && message.turn_id && nativeEventsByTurn.has(message.turn_id) && <NativeAgentPanel events={nativeEventsByTurn.get(message.turn_id)!} busy={false} />}
          {message.turn_id && message.turn_id !== currentTurnId && lastTurnMessageIndex.get(message.turn_id) === index && (changeSetsByTurn.get(message.turn_id) ?? []).map((changeSet) => <WorkspaceChangesCard key={changeSet.id} changeSet={changeSet} onOpenFile={onOpenFile} />)}
        </div>)}
        {lastUserIndex >= 0 && (nativeEvents.length ? <NativeAgentPanel events={trajectoryEvents} busy={agentBusy} thinking={thinking} /> : <ChatActivityTimeline events={events} rawEvents={trajectoryEvents} busy={agentBusy} interrupting={interrupting} />)}
        {visibleMessages.slice(lastUserIndex + 1).map((message, offset) => {
          const index = lastUserIndex + 1 + offset;
          return <div key={message.id}>
            <ConversationMessage message={message} streaming={agentBusy && message.id.endsWith(":stream")} />
            {message.turn_id && message.turn_id !== currentTurnId && lastTurnMessageIndex.get(message.turn_id) === index && (changeSetsByTurn.get(message.turn_id) ?? []).map((changeSet) => <WorkspaceChangesCard key={changeSet.id} changeSet={changeSet} onOpenFile={onOpenFile} />)}
          </div>;
        })}
        {changeSets.filter((changeSet) => !changeSet.turnId || changeSet.turnId === currentTurnId).map((changeSet) => <WorkspaceChangesCard key={changeSet.id} changeSet={changeSet} onOpenFile={onOpenFile} />)}
        {pendingAction && <section className="conversation-approval">
          <div className="approval-content">
            <div className="approval-head">
              <span className="approval-kind">{pendingAction.payload.externalAgent ? ({ codex: "Codex", claude: "Claude Code", opencode: "OpenCode" }[pendingAction.payload.externalAgent]) : pendingAction.kind === "write" ? "Write file" : "Run command"}</span>
              {pendingAction.payload.change && <div className="approval-diff-stats"><span>+{pendingAction.payload.change.additions}</span><span>-{pendingAction.payload.change.deletions}</span></div>}
            </div>
            <code>{pendingAction.kind === "write" ? pendingAction.payload.path : pendingAction.payload.command}</code>
            {pendingAction.payload.editPreview && <details className="approval-edit-preview">
              <summary>{t("Review change")}</summary>
              <strong>{t("Before")}</strong><pre>{pendingAction.payload.editPreview.before}</pre>
              <strong>{t("After")}</strong><pre>{pendingAction.payload.editPreview.after}</pre>
            </details>}
            <div className="approval-actions">
              {autoRunIn !== null && <span className="approval-countdown">{t("Auto-run in {seconds}s", { seconds: autoRunIn })}</span>}
              <button className="approval-dismiss" onClick={onReject}>Dismiss</button>
              <button className="approval-apply" onClick={onApprove}>{pendingAction.kind === "write" ? "Apply" : "Run"}</button>
            </div>
          </div>
        </section>}
      </div>;
  return <div className="conversation-scroll-area">
    <div className="conversation-scroll" ref={scrollRef} onScroll={handleScroll}>
      {commentScope ? <SessionComments key={`${commentScope.workspace}:${commentScope.projectId}:${commentScope.sessionId}`} scope={commentScope} adding={addingComment} showResolvedByDefault={commentsShowResolved} onExit={onExitComments} onRequireHistory={requireCommentHistory} historyComplete={historyStart === 0} scrollRef={scrollRef}>{historyContent}</SessionComments> : historyContent}
    </div>
    <TurnRail messages={visibleMessages} scrollRef={scrollRef} />
    {!followingOutput && <button className="conversation-jump-latest" onClick={() => {
      followOutputRef.current = true;
      setFollowingOutput(true);
      scrollToLatest();
    }} title="Jump to latest message"><ArrowDown size={15} /><span>Latest</span></button>}
  </div>;
});

function ConversationView({ messages, events, trajectoryEvents, nativeBackend, harnessBound, onHarnessChange, nativeQuestions, onNativeAnswer, onNativeSteer, workspace, projectId, agentBusy, interrupting, canInterrupt, pendingAction, changeSets, researchMode, reasoningEffort, contextLength, modelCapabilities, contextItems, onOpenWorkspaceSettings, onCommand, contextSummary, compactedThroughTurnId, onSubmit, onInterrupt, onResearchMode, onAddContext, onRemoveContext, onApprove, onReject, onOpenFile, showWelcome, onWelcomeAction, composerRequest, draftKey, currentFile, currentSelection, onComposerRequestApplied, initialScrollTop, onScrollTop, commentScope, addingComment, commentsShowResolved, onExitComments }: {
  commentScope: SessionCommentsScope | null;
  addingComment: boolean;
  commentsShowResolved: boolean;
  onExitComments: () => void;
  messages: Message[];
  events: TimelineEvent[];
  trajectoryEvents: ResearchEvent[];
  nativeBackend: AgentBackendConfig | null;
  harnessBound: boolean;
  onHarnessChange: (backend: AgentBackendConfig["backend"]) => Promise<void>;
  nativeQuestions: NativeAgentQuestion[];
  onNativeAnswer: (id: string, answers: Record<string, string[]>) => Promise<unknown>;
  onNativeSteer: (text: string) => Promise<unknown>;
  workspace: string;
  projectId?: string | null;
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
  onOpenWorkspaceSettings: () => void;
  onCommand: (command: ConversationCommand) => Promise<ConversationCommandResult>;
  contextSummary?: string;
  compactedThroughTurnId?: string | null;
  onSubmit: (draft: string, mode: ResearchMode, reasoningEffort: ReasoningEffort, contextLength: ContextLength, contextItems?: ContextAttachment[], researchSkill?: "idea-spark") => Promise<boolean>;
  onInterrupt: () => void;
  onResearchMode: (mode: ResearchMode) => void;
  onAddContext: (items: ContextAttachment[]) => void;
  onRemoveContext: (id: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onOpenFile: (filePath: string) => void;
  showWelcome: boolean;
  onWelcomeAction: (action: ResearchWelcomeAction) => void;
  composerRequest: { id: string; text: string; mode?: "append" | "replace" } | null;
  draftKey: string;
  initialScrollTop: number | null;
  onScrollTop: (top: number) => void;
  currentFile?: WorkspaceFilePreview | null;
  currentSelection?: { file: WorkspaceFilePreview; selection: FileSelection } | null;
  onComposerRequestApplied: (id: string) => void;
}) {
  const { t } = useUISettings();
  const activeMode = researchModes.find((mode) => mode.id === researchMode) ?? researchModes[0];
  const shortcutModifier = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform) ? "⌘" : "Ctrl+";
  const [contextUsageOpen, setContextUsageOpen] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const [composerMenu, setComposerMenu] = useState<{ x: number; y: number } | null>(null);
  const [composerError, setComposerError] = useState("");
  const [commandRunning, setCommandRunning] = useState(false);
  const [commandNotice, setCommandNotice] = useState("");
  const [steering, setSteering] = useState(false);
  const reportedNativeUsage = useMemo(() => nativeUsage(trajectoryEvents), [trajectoryEvents]);
  const slashRunningRef = useRef(false);
  const storedDraftRef = useRef<ComposerDraft | null>(readComposerDraft(draftKey));
  const [prompt, setPrompt] = useState(storedDraftRef.current?.text ?? "");
  const [promptHistory, setPromptHistory] = useState<string[]>(readComposerHistory);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [queuedPrompts, setQueuedPrompts] = useState<QueuedPrompt[]>([]);
  const [slashQuery, setSlashQuery] = useState<string | null>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [contextPickerRequest, setContextPickerRequest] = useState(0);
  const previousBusyRef = useRef(agentBusy);
  const contextUsageTriggerRef = useRef<HTMLButtonElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const composerBoxRef = useRef<HTMLDivElement>(null);
  const appliedComposerRequestRef = useRef<string | null>(null);
  // Parent activity updates can occur every second. Keep the history's event
  // handlers stable without retaining stale closures from the parent render.
  const historyHandlersRef = useRef({ onApprove, onReject, onOpenFile, onWelcomeAction });
  historyHandlersRef.current = { onApprove, onReject, onOpenFile, onWelcomeAction };
  const approveHistoryAction = useCallback(() => historyHandlersRef.current.onApprove(), []);
  const rejectHistoryAction = useCallback(() => historyHandlersRef.current.onReject(), []);
  const openHistoryFile = useCallback((path: string) => historyHandlersRef.current.onOpenFile(path), []);
  const [welcomeDismissed, setWelcomeDismissed] = useState(false);
  const [newChatMode, setNewChatMode] = useState<NewChatMode>(storedDraftRef.current?.newChatMode ?? "standard");
  const welcomeVisible = showWelcome && !welcomeDismissed;

  useEffect(() => {
    if (!composerRequest || appliedComposerRequestRef.current === composerRequest.id) return;
    appliedComposerRequestRef.current = composerRequest.id;
    setPrompt((current) => composerRequest.mode === "replace" ? composerRequest.text : current.trim() ? `${current.trim()}\n\n${composerRequest.text}` : composerRequest.text);
    onComposerRequestApplied(composerRequest.id);
    requestAnimationFrame(() => composerRef.current?.focus());
  }, [composerRequest, onComposerRequestApplied]);

  useEffect(() => {
    // A queued composer request wins over the stored draft on first mount:
    // "Ask AI" from another module switches sections and sets both in the same
    // commit, so restoring the empty draft here would erase the prompt.
    if (composerRequest && appliedComposerRequestRef.current === composerRequest.id) return;
    const stored = readComposerDraft(draftKey);
    storedDraftRef.current = stored;
    setNewChatMode(stored?.newChatMode ?? "standard");
    setPrompt(stored?.text ?? "");
    setHistoryIndex(-1);
    if (!stored) return;
    const frame = requestAnimationFrame(() => {
      const textarea = composerRef.current;
      if (!textarea) return;
      const start = Math.min(stored.selectionStart, stored.text.length);
      const end = Math.min(stored.selectionEnd, stored.text.length);
      textarea.setSelectionRange(start, end);
    });
    return () => cancelAnimationFrame(frame);
  }, [draftKey]);

  useEffect(() => {
    const textarea = composerRef.current;
    const start = textarea?.selectionStart ?? prompt.length;
    const end = textarea?.selectionEnd ?? prompt.length;
    writeComposerDraft(draftKey, prompt || newChatMode !== "standard" ? { text: prompt, selectionStart: start, selectionEnd: end, newChatMode } : null);
  }, [draftKey, prompt, newChatMode]);

  useEffect(() => {
    const onFocusComposer = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "l") return;
      const target = event.target as HTMLElement | null;
      if (target && target !== composerRef.current && target.matches("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      composerRef.current?.focus();
    };
    window.addEventListener("keydown", onFocusComposer);
    return () => window.removeEventListener("keydown", onFocusComposer);
  }, []);

  useEffect(() => {
    const textarea = composerRef.current;
    if (!textarea) return;
    textarea.style.height = "auto";
    const maxHeight = 220;
    textarea.style.height = `${Math.min(textarea.scrollHeight, maxHeight)}px`;
    textarea.style.overflowY = textarea.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [prompt]);

  const predictedMode: NewChatMode = showWelcome ? newChatMode : chatModeFromThread(researchMode, trajectoryEvents);
  const messageContextCharacters = useMemo(
    () => {
      const checkpoint = compactedThroughTurnId ? messages.findIndex((message) => message.id === `${compactedThroughTurnId}:assistant`) : -1;
      return (contextSummary?.length || 0) + messages.slice(checkpoint + 1).reduce((total, message) => total + message.text.length, 0);
    },
    [messages, contextSummary, compactedThroughTurnId],
  );
  const attachedContextCharacters = useMemo(
    () => contextItems.reduce((total, item) => total + estimateAttachmentContextCharacters(item), 0),
    [contextItems],
  );
  const contextCharacterLimit = modelCapabilities.contextCharacterLimits[contextLength] || 500_000;
  const estimatedContextCharacters = Math.min(
    contextCharacterLimit,
    CONTEXT_INSTRUCTION_OVERHEAD_CHARS + messageContextCharacters + attachedContextCharacters + prompt.length,
  );
  const contextUsage = estimatedContextCharacters / contextCharacterLimit;
  const contextUsageState = contextUsage >= 0.9 ? "critical" : contextUsage >= 0.7 ? "warning" : "normal";
  const contextUsageTitle = `Estimated context usage: ${estimatedContextCharacters.toLocaleString()} of ${contextCharacterLimit.toLocaleString()} characters (${Math.round(contextUsage * 100)}%). Includes chat, draft, and attachment metadata; the final request can differ after automatic context compaction.`;
  const contextUsageLabel = `${Math.round(contextUsage * 100)}%`;
  const contextUsagePercent = Math.round(contextUsage * 100);
  const formatContextCharacters = (value: number) => value >= 10_000 ? `${Math.round(value / 1_000)}k` : value >= 1_000 ? `${(value / 1_000).toFixed(1)}k` : String(value);
  const slashCommands = [
    { id: "init", icon: FileCog, label: t("Init"), detail: t("Set up project instructions"), run: () => onCommand("init") },
    { id: "new", icon: Plus, label: t("New"), detail: t("Start a new conversation"), run: () => onCommand("new") },
    { id: "undo", icon: Undo2, label: t("Undo"), detail: t("Undo the last message"), run: () => onCommand("undo") },
    { id: "compact", icon: Minimize2, label: t("Compact"), detail: t("Summarize conversation context"), run: () => onCommand("compact") },
    { id: "fork", icon: GitFork, label: t("Fork"), detail: t("Branch from this conversation"), run: () => onCommand("fork") },
    { id: "side", icon: PanelRight, label: t("Side"), detail: t("Open a side conversation"), run: () => onCommand("side") },
    { id: "export", icon: Download, label: t("Export"), detail: t("Export this conversation"), run: () => onCommand("export") },
    { id: "model", icon: Cpu, label: t("Model"), detail: t("Choose a model"), run: () => onCommand("model") },
  ];
  const filteredSlashCommands = slashQuery === null ? [] : slashCommands.filter((command) => command.id.startsWith(slashQuery) || command.label.toLowerCase().includes(slashQuery));
  const slashOpen = filteredSlashCommands.length > 0 && slashQuery !== null;
  useEffect(() => {
    if (slashOpen) document.querySelector<HTMLElement>(".composer-slash-menu .menu-item.active")?.scrollIntoView({ block: "nearest" });
  }, [slashOpen, slashIndex, slashQuery]);

  async function attachPastedImage(blob: Blob) {
    if (contextItems.filter((item) => item.type === "image").length >= 4) {
      setComposerError("You can attach up to four pasted images in one message.");
      return;
    }
    try {
      const image = await contextImageFromBlob(blob);
      addContextItems([image]);
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
        addContextItems([contextImageFromData(image)]);
        setComposerError("");
        return;
      }
      insertClipboardText(await desktopBridge.readClipboardText());
      setComposerError("");
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "Nothing compatible was found on the clipboard.");
    }
  }

  function addContextItems(items: ContextAttachment[]) {
    if (!items.length) return;
    const available = Math.max(0, 12 - contextItems.length);
    if (!available) {
      setComposerError("You can attach up to 12 items in one message.");
      return;
    }
    const unique = items.filter((item, index) => !contextItems.some((current) => current.id === item.id) && items.findIndex((candidate) => candidate.id === item.id) === index).slice(0, available);
    if (unique.length) {
      onAddContext(unique);
      setComposerError(items.length > available ? "Only the first 12 attachments were added." : "");
    }
  }

  async function attachDroppedFiles(files: File[]) {
    if (!files.length) return;
    const available = Math.max(0, 12 - contextItems.length);
    if (!available) {
      setComposerError("You can attach up to 12 items in one message.");
      return;
    }
    try {
      const items = await desktopBridge.attachDroppedFiles(files.slice(0, available));
      addContextItems(items);
    } catch (error) {
      setComposerError(error instanceof Error ? error.message : "The dropped files could not be attached.");
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
    const imageItem = Array.from(event.clipboardData.items).find((candidate) => candidate.type.startsWith("image/"));
    const image = imageItem?.getAsFile();
    if (image) {
      event.preventDefault();
      void attachPastedImage(image);
      return;
    }
    const files = Array.from(event.clipboardData.files).filter((file) => !file.type.startsWith("image/"));
    if (files.length) {
      event.preventDefault();
      void attachDroppedFiles(files);
    }
  }

  function appendTranscript(text: string) {
    const value = text.trim();
    if (!value) return;
    const textarea = composerRef.current;
    const start = textarea?.selectionStart ?? prompt.length;
    const end = textarea?.selectionEnd ?? prompt.length;
    const before = prompt.slice(0, start);
    const after = prompt.slice(end);
    const leading = before && !/\s$/.test(before) ? " " : "";
    const trailing = after && !/^\s/.test(after) ? " " : "";
    const inserted = `${leading}${value}${trailing}`;
    setPrompt(`${before}${inserted}${after}`);
    setComposerError("");
    requestAnimationFrame(() => {
      if (!textarea) return;
      textarea.focus();
      const cursor = start + inserted.length;
      textarea.setSelectionRange(cursor, cursor);
    });
  }

  function updateSlashQuery(value: string, caret: number) {
    const before = value.slice(0, caret);
    const match = /(?:^|\s)\/([a-z-]*)$/i.exec(before);
    setSlashQuery(match ? match[1].toLowerCase() : null);
    setSlashIndex(0);
  }

  async function runSlashCommand(command: { id: string; run: () => void | Promise<ConversationCommandResult> }) {
    if (slashRunningRef.current) return;
    if (queuedPrompts.length) { setComposerError(t("Send or clear queued messages before using a command.")); return; }
    slashRunningRef.current = true;
    setCommandRunning(true);
    setComposerError("");
    setCommandNotice(t("Running command…"));
    const textarea = composerRef.current;
    const caret = textarea?.selectionStart ?? prompt.length;
    const before = prompt.slice(0, caret);
    const start = before.lastIndexOf("/");
    const next = start >= 0 ? `${prompt.slice(0, start)}${prompt.slice(caret)}` : prompt;
    setPrompt(next);
    setSlashQuery(null);
    try {
      const result = await command.run();
      if (result?.draft !== undefined) setPrompt(result.draft + (next.trim() ? `\n\n${next}` : ""));
      setCommandNotice(result?.notice || "");
    } catch (error) {
      setPrompt(prompt);
      setComposerError(String(error).replace(/^Error invoking remote method '[^']+': Error:\s*|^Error:\s*/, ""));
      setCommandNotice("");
    } finally { slashRunningRef.current = false; setCommandRunning(false); }
    if (command.id === "model") {
      requestAnimationFrame(() => document.querySelector<HTMLElement>(".settings-modal input:not([disabled]), .settings-modal button:not([disabled])")?.focus());
      return;
    }
    requestAnimationFrame(() => {
      const field = composerRef.current;
      if (!field) return;
      field.focus();
      const cursor = Math.max(0, start);
      field.setSelectionRange(cursor, cursor);
    });
  }

  function rememberPrompt(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    const next = [trimmed, ...promptHistory.filter((item) => item !== trimmed)].slice(0, COMPOSER_HISTORY_LIMIT);
    setPromptHistory(next);
    writeComposerHistory(next);
    setHistoryIndex(-1);
  }

  function recallPrompt(direction: -1 | 1) {
    if (!promptHistory.length) return false;
    if (direction === -1) {
      const nextIndex = historyIndex < 0 ? 0 : Math.min(historyIndex + 1, promptHistory.length - 1);
      setHistoryIndex(nextIndex);
      setPrompt(promptHistory[nextIndex]);
      requestAnimationFrame(() => {
        const textarea = composerRef.current;
        if (!textarea) return;
        textarea.focus();
        textarea.setSelectionRange(textarea.value.length, textarea.value.length);
      });
      return true;
    }
    if (historyIndex < 0) return false;
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    setPrompt(nextIndex < 0 ? "" : promptHistory[nextIndex]);
    requestAnimationFrame(() => {
      const textarea = composerRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(textarea.value.length, textarea.value.length);
    });
    return true;
  }

  function queueCurrentPrompt() {
    const draft = prompt;
    if (!draft.trim() && !contextItems.some((item) => item.type === "image")) return;
    if (queuedPrompts.length >= 5) {
      setComposerError("Up to five follow-ups can be queued at a time.");
      return;
    }
    setQueuedPrompts((current) => [...current, {
      id: crypto.randomUUID(),
      draft,
      mode: predictedMode,
      reasoningEffort,
      contextLength,
      contextItems,
    }]);
    rememberPrompt(draft);
    setPrompt("");
    setHistoryIndex(-1);
    setComposerError("");
  }

  async function submitCurrentPrompt() {
    if (slashRunningRef.current) return;
    const exactCommand = /^\/([a-z]+)$/i.exec(prompt.trim());
    const command = exactCommand && slashCommands.find((item) => item.id === exactCommand[1].toLowerCase());
    if (command) { await runSlashCommand(command); return; }
    if (!prompt.trim() && !contextItems.some((item) => item.type === "image")) return;
    if (agentBusy) {
      if (nativeBackend) {
        if (nativeBackend.backend !== "codex") { setComposerError(t("Stop the running turn before sending another native request.")); return; }
        if (steering) return;
        if (contextItems.length) { setComposerError(t("Send attachments after the current native turn finishes.")); return; }
        setSteering(true); setComposerError("");
        try { await onNativeSteer(prompt); rememberPrompt(prompt); setPrompt(""); }
        catch (error) { setComposerError(String(error)); }
        finally { setSteering(false); }
        return;
      }
      queueCurrentPrompt();
      return;
    }
    const draft = prompt;
    const submittedContext = contextItems;
    rememberPrompt(draft);
    setPrompt("");
    setComposerError("");
    onResearchMode(predictedMode);
    const sent = await onSubmit(draft, predictedMode, reasoningEffort, contextLength, submittedContext, predictedMode === "research" ? "idea-spark" : undefined);
    if (!sent) setPrompt((current) => current.trim() ? current : draft);
    requestAnimationFrame(() => {
      const textarea = composerRef.current;
      if (!textarea) return;
      textarea.focus();
      const end = textarea.value.length;
      textarea.setSelectionRange(end, end);
    });
  }

  useEffect(() => {
    const wasBusy = previousBusyRef.current;
    previousBusyRef.current = agentBusy;
    if (!wasBusy || agentBusy || !queuedPrompts.length) return;
    const [next, ...rest] = queuedPrompts;
    setQueuedPrompts(rest);
    void onSubmit(next.draft, next.mode, next.reasoningEffort, next.contextLength, next.contextItems).then((sent) => {
      if (sent) return;
      setComposerError("A queued follow-up could not be sent. It was restored below.");
      setPrompt((current) => current.trim() ? current : next.draft);
    });
  }, [agentBusy, queuedPrompts, onSubmit]);

  const selectWelcomeWorkflow = useCallback((action: ResearchWelcomeAction) => {
    historyHandlersRef.current.onWelcomeAction(action);
    if (action === "idea") {
      setNewChatMode("research");
      setPrompt((current) => draftForNewChatMode(current, "research"));
      setWelcomeDismissed(true);
      requestAnimationFrame(() => composerRef.current?.focus());
    }
  }, []);

  return <div className={welcomeVisible ? "conversation-layout has-welcome" : "conversation-layout"}>
    <WorkspaceMarkdownProvider workspace={workspace} onOpenFile={openHistoryFile}>
      <ConversationHistory messages={messages} events={events} trajectoryEvents={trajectoryEvents} agentBusy={agentBusy} interrupting={interrupting} pendingAction={pendingAction} changeSets={changeSets} welcomeVisible={welcomeVisible} onWelcomeAction={selectWelcomeWorkflow} onApprove={approveHistoryAction} onReject={rejectHistoryAction} onOpenFile={openHistoryFile} initialScrollTop={initialScrollTop} onScrollTop={onScrollTop} commentScope={commentScope} addingComment={addingComment} commentsShowResolved={commentsShowResolved} onExitComments={onExitComments} />
    </WorkspaceMarkdownProvider>

    <div className="conversation-composer-wrap" data-ui="research-composer">
      {showWelcome && <NewChatModePicker value={newChatMode} onChange={(mode) => {
        setNewChatMode(mode);
        setPrompt((current) => draftForNewChatMode(current, mode));
      }} />}
      {nativeQuestions.length > 0 && <div className="native-question-stack">{nativeQuestions.map((question) => <NativeQuestionCard key={question.id} question={question} onAnswer={onNativeAnswer} />)}</div>}
      <div
        ref={composerBoxRef}
        className={draggingFiles ? "conversation-composer drag-active" : "conversation-composer"}
        onDragEnter={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          setDraggingFiles(true);
        }}
        onDragOver={(event) => {
          if (!event.dataTransfer.types.includes("Files")) return;
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
          setDraggingFiles(true);
        }}
        onDragLeave={(event) => {
          const next = event.relatedTarget as Node | null;
          if (next && event.currentTarget.contains(next)) return;
          setDraggingFiles(false);
        }}
        onDrop={(event) => {
          if (!event.dataTransfer.files.length) return;
          event.preventDefault();
          setDraggingFiles(false);
          void attachDroppedFiles(Array.from(event.dataTransfer.files));
        }}
      >
        {draggingFiles && <div className="composer-drop-target">{t("Drop files or folders to attach")}</div>}
        {queuedPrompts.length > 0 && <div className="composer-queue" aria-label={t("Queued messages")}>
          {queuedPrompts.map((item, index) => <div className="composer-queue-item" key={item.id}>
            <span className="composer-queue-index">{index + 1}</span>
            <span>{item.draft || t("Image attachment")}</span>
            <button type="button" onClick={() => setQueuedPrompts((current) => current.filter((queued) => queued.id !== item.id))} aria-label={`${t("Remove queued message")} ${index + 1}`}><X size={12} /></button>
          </div>)}
          {queuedPrompts.length > 1 && <button type="button" className="composer-queue-clear" onClick={() => setQueuedPrompts([])}>{t("Clear queue")}</button>}
        </div>}
        <textarea ref={composerRef} className={newChatMode === "research" && prompt === RESEARCH_EXAMPLE ? "research-example" : undefined} value={prompt} disabled={commandRunning} onChange={(event) => { setPrompt(event.target.value); setHistoryIndex(-1); updateSlashQuery(event.target.value, event.target.selectionStart); }} onPaste={handleComposerPaste} onContextMenu={(event) => { event.preventDefault(); setComposerMenu({ x: event.clientX, y: event.clientY }); }} onKeyDown={(event) => {
          if (event.nativeEvent.isComposing || event.keyCode === 229) return;
          const textarea = event.currentTarget;
          if (slashOpen) {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              setSlashIndex((current) => Math.min(current + 1, filteredSlashCommands.length - 1));
              return;
            }
            if (event.key === "ArrowUp") {
              event.preventDefault();
              setSlashIndex((current) => Math.max(current - 1, 0));
              return;
            }
            if (event.key === "Enter" && !event.shiftKey) {
              event.preventDefault();
              const command = filteredSlashCommands[slashIndex];
              if (command) runSlashCommand(command);
              return;
            }
            if (event.key === "Escape") {
              event.preventDefault();
              setSlashQuery(null);
              return;
            }
          }
          if (event.key === "@" && !event.metaKey && !event.ctrlKey && !event.altKey && (prompt === "" || /\s$/.test(prompt.slice(0, textarea.selectionStart)))) {
            event.preventDefault();
            setContextPickerRequest((current) => current + 1);
            return;
          }
          const atStart = textarea.selectionStart === 0 && textarea.selectionEnd === 0;
          if (!event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey && event.key === "ArrowUp" && (prompt === "" || atStart) && recallPrompt(-1)) {
            event.preventDefault();
            return;
          }
          if (!event.shiftKey && !event.altKey && !event.metaKey && !event.ctrlKey && event.key === "ArrowDown" && historyIndex >= 0 && recallPrompt(1)) {
            event.preventDefault();
            return;
          }
          if (shouldSubmitPaperChatKey(event)) {
            event.preventDefault();
            void submitCurrentPrompt();
          }
        }} placeholder={showWelcome && newChatMode === "create" ? t("Describe a Research App you want to create.") : activeMode.placeholder} rows={3} aria-label={t("Message Archimedes")} aria-keyshortcuts="Control+L Meta+L" aria-describedby={composerError ? "composer-error" : undefined} />
        <MenuSurface open={slashOpen} onClose={() => setSlashQuery(null)} anchorRef={composerBoxRef} placement="top-start" width={560} minWidth={0} maxHeight={320} className="composer-slash-menu" ariaLabel={t("Composer commands")} focus="none">
          {filteredSlashCommands.map((command, index) => <MenuItem key={command.id} icon={<command.icon size={16} strokeWidth={1.7} />} className={index === slashIndex ? "active" : ""} onMouseEnter={() => setSlashIndex(index)} onMouseDown={(event) => event.preventDefault()} onClick={() => void runSlashCommand(command)}><span className="slash-command-label">{command.label}</span><span className="slash-command-detail">{command.detail}</span></MenuItem>)}
        </MenuSurface>
        <ContextChips items={contextItems} onRemove={onRemoveContext} onClear={() => contextItems.forEach((item) => onRemoveContext(item.id))} />
        <MenuSurface open={Boolean(composerMenu)} onClose={() => setComposerMenu(null)} cursor={composerMenu} placement="bottom-start" width={300} className="composer-context-menu" ariaLabel={t("Composer actions")}>
          <MenuItem icon={<Scissors size={18} strokeWidth={1.7} />} shortcut={`${shortcutModifier}X`} disabled={composerRef.current?.selectionStart === composerRef.current?.selectionEnd} onClick={() => { setComposerMenu(null); void copySelection(true); }}>{t("Cut")}</MenuItem>
          <MenuItem icon={<Copy size={18} strokeWidth={1.7} />} shortcut={`${shortcutModifier}C`} disabled={composerRef.current?.selectionStart === composerRef.current?.selectionEnd} onClick={() => { setComposerMenu(null); void copySelection(); }}>{t("Copy")}</MenuItem>
          <MenuItem icon={<Clipboard size={18} strokeWidth={1.7} />} shortcut={`${shortcutModifier}V`} onClick={() => { setComposerMenu(null); void pasteFromSystemClipboard(); }}>{t("Paste")}</MenuItem>
        </MenuSurface>
        {composerError && <div id="composer-error" className="composer-attachment-error" role="alert">{composerError}</div>}
        {commandNotice && <div className="composer-command-notice" role="status">{commandNotice}</div>}
        <div className="conversation-composer-footer">
          <ContextPicker bridge={desktopBridge} workspace={workspace} projectId={projectId} items={contextItems} openRequest={contextPickerRequest} currentFile={currentFile} currentSelection={currentSelection} onAdd={addContextItems} />
          <HarnessPicker backend={nativeBackend?.backend || "api"} bound={harnessBound} busy={agentBusy} onChange={onHarnessChange} onSettings={() => { void onCommand("model"); }} />
          <button
            type="button"
            className="composer-context"
            onClick={onOpenWorkspaceSettings}
            title={workspace ? `${t("Workspace")}: ${workspace}` : t("Open workspace settings")}
            aria-label={workspace ? `${t("Workspace")}: ${workspace}. ${t("Open workspace settings")}` : t("Open workspace settings")}
          >
            <Folder size={13} aria-hidden="true" /><span>{workspacePathName(workspace, t("No workspace"))}</span>
          </button>
          {nativeBackend ? (reportedNativeUsage?.modelContextWindow ? <NativeContextUsage usage={reportedNativeUsage} /> : null) : <div className="context-usage-control">
            <button
              ref={contextUsageTriggerRef}
              type="button"
              className={`context-usage ${contextUsageState}`}
              data-context-usage={contextUsageLabel}
              aria-label={contextUsageTitle}
              aria-haspopup="menu"
              aria-expanded={contextUsageOpen}
              title={contextUsageTitle}
              onClick={() => setContextUsageOpen((open) => !open)}
            >
              <span className="context-usage-value">{contextUsageLabel}</span>
              <span
                className="context-usage-ring"
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={contextUsagePercent}
                aria-valuetext={`${contextUsagePercent}% estimated context used`}
                style={{ "--context-usage-progress": `${Math.round(contextUsage * 1_000) / 10}%` } as React.CSSProperties}
              />
            </button>
            <MenuSurface open={contextUsageOpen} onClose={() => setContextUsageOpen(false)} anchorRef={contextUsageTriggerRef} placement="top-end" width={264} className="context-usage-menu" ariaLabel={t("Context usage")} role="group" focus="none">
              <MenuLabel>{t("Context usage")}</MenuLabel>
              <div className="context-usage-breakdown">
                <div><span>{t("Chat")}</span><strong>{formatContextCharacters(messageContextCharacters)}</strong></div>
                <div><span>{t("Draft")}</span><strong>{formatContextCharacters(prompt.length)}</strong></div>
                <div><span>{t("Attachments")}</span><strong>{formatContextCharacters(attachedContextCharacters)}</strong></div>
                <div><span>{t("Instructions")}</span><strong>{formatContextCharacters(CONTEXT_INSTRUCTION_OVERHEAD_CHARS)}</strong></div>
                <div className="total"><span>{t("Estimated total")}</span><strong>{estimatedContextCharacters.toLocaleString()} / {contextCharacterLimit.toLocaleString()}</strong></div>
              </div>
              <p className="context-usage-breakdown-note">{t("Approximate character estimate. The final request can differ after context compaction.")}</p>
            </MenuSurface>
          </div>}
          <div className="composer-send-cluster">
            {nativeBackend?.backend === "codex" && agentBusy && <button className="composer-tool" type="button" disabled={steering || !canInterrupt || !prompt.trim()} onClick={() => void submitCurrentPrompt()} title={t("Steer Codex")}>{t(steering ? "Sending" : "Steer Codex")}</button>}
            <VoiceInputButton
              onTranscript={appendTranscript}
              onError={setComposerError}
              onTranscribe={(audio, mimeType, language) => desktopBridge.transcribeSpeech(audio, mimeType, language)}
              onRequestPermission={() => desktopBridge.requestMicrophoneAccess()}
              language={document.documentElement.lang || "en"}
            />
            <button
              className="conversation-send"
              onClick={agentBusy ? onInterrupt : () => void submitCurrentPrompt()}
              disabled={agentBusy ? !canInterrupt : !prompt.trim() && !contextItems.some((item) => item.type === "image")}
              title={agentBusy ? (interrupting ? t("Stopping task") : t("Stop")) : (prompt.trim() || contextItems.some((item) => item.type === "image")) ? t("Send") : t("Add text or attach an image to send")}
              aria-label={agentBusy ? (interrupting ? t("Stopping task") : t("Stop")) : t("Send")}
            >
              {agentBusy ? <Square size={13} fill="currentColor" /> : <ArrowUp size={16} strokeWidth={2.4} />}
            </button>
          </div>
        </div>
      </div>
      <p className="composer-note">Archimedes can make mistakes. Review sources and workspace changes.</p>
    </div>
  </div>;
}

const ConversationMessage = memo(function ConversationMessage({ message, streaming }: { message: Message; streaming: boolean }) {
  return <article className={`conversation-message ${message.role}`} data-session-message-id={message.id} data-turn-id={message.role === "user" ? message.id : undefined}>
    <div className="conversation-message-content">
    {message.role === "user" && Boolean(message.attachments?.length) && <div className="message-attachments">{message.attachments?.map((attachment) => <MessageAttachmentView key={attachment.position} attachment={attachment} turnId={message.turn_id} />)}</div>}
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
    </div>
  </article>;
});

function MessageAttachmentView({ attachment, turnId }: { attachment: MessageAttachment; turnId?: string }) {
  const { t } = useUISettings();
  const [image, setImage] = useState<string | null>(attachment.imageData ?? null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const placeholder = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (attachment.type !== "image" || attachment.imageData || !attachment.threadId || !turnId) return;
    let cancelled = false;
    const load = () => { void desktopBridge.getResearchTurnImage(attachment.threadId!, turnId, attachment.position).then((value) => { if (!cancelled) { setImage(value); setFailed(!value); } }).catch(() => { if (!cancelled) setFailed(true); }); };
    const observer = typeof IntersectionObserver === "undefined" ? null : new IntersectionObserver((entries) => { if (entries.some((entry) => entry.isIntersecting)) { observer?.disconnect(); load(); } }, { rootMargin: "300px" });
    if (observer && placeholder.current) observer.observe(placeholder.current); else load();
    return () => { cancelled = true; observer?.disconnect(); };
  }, [attachment.type, attachment.imageData, attachment.threadId, attachment.position, turnId]);
  if (attachment.type !== "image") return <div className="message-attachment-file" title={attachment.detail || attachment.path || attachment.name}><FileText size={16} /><span>{attachment.name}</span></div>;
  return <div className="message-attachment-image" ref={placeholder}>
    {image ? <button type="button" onClick={() => setOpen(true)} aria-label={t("Preview image: {name}", { name: attachment.name })}><img src={image} alt={attachment.name} /></button> : <span>{failed ? t("Image unavailable") : t("Loading image…")}</span>}
    {image && open && <Dialog open onClose={() => setOpen(false)} size="lightbox" className="attached-image-dialog" ariaLabel={t("Preview image: {name}", { name: attachment.name })}><header><strong>{attachment.name}</strong><button type="button" onClick={() => setOpen(false)} aria-label={t("Close")} title={t("Close")}><X size={18} /></button></header><div className="attached-image-dialog-stage"><img src={image} alt={attachment.name} /></div></Dialog>}
  </div>;
}

const MarkdownContent = memo(function MarkdownContent({ content }: { content: string }) {
  return <ReactMarkdown
    remarkPlugins={[remarkGfm, remarkMath]}
    rehypePlugins={[rehypeKatex]}
    urlTransform={workspaceMarkdownUrlTransform}
    components={{
      a: WorkspaceMarkdownLink,
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

function workspaceFileGlyphLabel(entry: Pick<WorkspaceFileEntry, "type" | "kind" | "path">) {
  if (entry.type === "directory") return "";
  const name = entry.path.split("/").at(-1)?.toLowerCase() || "";
  const extension = name.includes(".") ? name.split(".").at(-1) || "" : "";
  const labels: Record<string, string> = {
    ts: "TS", tsx: "TS", js: "JS", jsx: "JS", mjs: "JS", cjs: "JS",
    json: "{}", jsonl: "{}", md: "MD", mdx: "MD", txt: "TXT", rst: "TXT",
    css: "CSS", scss: "CSS", less: "CSS", html: "<>", htm: "<>", xml: "<>",
    py: "PY", go: "GO", rs: "RS", java: "JV", c: "C", cc: "C", cpp: "C", h: "C", hpp: "C", ipynb: "IPY",
    sh: "SH", zsh: "SH", bash: "SH", fish: "SH",
    yml: "YML", yaml: "YML", toml: "TML", ini: "INI", cfg: "CFG", conf: "CFG", env: "ENV",
    tex: "TEX", latex: "TEX", bib: "BIB", cls: "TEX", sty: "TEX", bst: "TEX",
    pdf: "PDF", png: "IMG", jpg: "IMG", jpeg: "IMG", webp: "IMG", gif: "IMG", bmp: "IMG", ico: "IMG", svg: "SVG", avif: "IMG",
    zip: "ZIP", tar: "ZIP", gz: "ZIP", tgz: "ZIP", rar: "ZIP", "7z": "ZIP", bz2: "ZIP",
    csv: "CSV", tsv: "CSV", xls: "XLS", xlsx: "XLS",
    mp4: "VID", mov: "VID", webm: "VID", mkv: "VID", avi: "VID",
    mp3: "AUD", wav: "AUD", ogg: "AUD", flac: "AUD", m4a: "AUD",
    lock: "LCK",
  };
  if (labels[extension]) return labels[extension];
  if (name === "dockerfile") return "DK";
  if (name === "makefile") return "MK";
  if (entry.kind === "image") return "IMG";
  if (entry.kind === "pdf") return "PDF";
  if (entry.kind === "markdown") return "MD";
  return extension ? extension.slice(0, 3).toUpperCase() : "FILE";
}

function workspaceFileGlyphSvg(entry: Pick<WorkspaceFileEntry, "type" | "kind" | "path">) {
  if (entry.type === "directory") return <Folder size={14} />;
  const name = entry.path.split("/").at(-1)?.toLowerCase() || "";
  const extension = name.includes(".") ? name.split(".").at(-1) || "" : "";
  if (entry.kind === "image" || ["png", "jpg", "jpeg", "webp", "gif", "bmp", "ico", "svg", "avif"].includes(extension)) return <FileImage size={14} />;
  if (["mp4", "mov", "webm", "mkv", "avi"].includes(extension)) return <FileVideo size={14} />;
  if (["mp3", "wav", "ogg", "flac", "m4a"].includes(extension)) return <FileAudio size={14} />;
  if (["zip", "tar", "gz", "tgz", "rar", "7z", "bz2"].includes(extension)) return <Package size={14} />;
  if (["csv", "tsv", "xls", "xlsx"].includes(extension)) return <FileSpreadsheet size={14} />;
  if (["json", "jsonl"].includes(extension)) return <FileJson size={14} />;
  if (["yaml", "yml", "toml", "ini", "cfg", "conf", "env"].includes(extension) || /^(dockerfile|makefile)$/.test(name)) return <FileCog size={14} />;
  if (extension === "bib") return <BookOpen size={14} />;
  if (["tex", "latex", "cls", "sty", "bst"].includes(extension)) return <FileType size={14} />;
  if (["md", "mdx", "txt", "rst", "pdf"].includes(extension) || entry.kind === "pdf" || entry.kind === "markdown") return <FileText size={14} />;
  if (["sh", "zsh", "bash", "fish"].includes(extension)) return <FileTerminal size={14} />;
  if (["ts", "tsx"].includes(extension)) return <FileCode2 size={14} />;
  if (["js", "jsx", "mjs", "cjs"].includes(extension)) return <FileBraces size={14} />;
  if (["py", "go", "rs", "java", "c", "cc", "cpp", "h", "hpp", "ipynb"].includes(extension)) return <FileCode size={14} />;
  if (["css", "scss", "less", "html", "htm", "xml"].includes(extension)) return <FileCode2 size={14} />;
  if (extension === "lock") return <FileLock size={14} />;
  return <File size={14} />;
}

function WorkspaceFileGlyph({ entry, expanded = false }: { entry: Pick<WorkspaceFileEntry, "type" | "kind" | "path">; expanded?: boolean }) {
  const { fileIconStyle } = useUISettings();
  const [spriteReady, setSpriteReady] = useState(false);
  useEffect(() => {
    if (fileIconStyle !== "opencode") return;
    let cancelled = false;
    void ensureOpenCodeSprite().then(() => {
      if (!cancelled) setSpriteReady(true);
    });
    return () => { cancelled = true; };
  }, [fileIconStyle]);

  if (fileIconStyle === "minimal") return null;

  if (fileIconStyle === "opencode" && spriteReady) {
    const name = chooseIconName(entry.path, entry.type === "directory" ? "directory" : "file", expanded);
    return <svg className="file-glyph-image" aria-hidden="true"><use href={`#${name}`} /></svg>;
  }

  if (fileIconStyle === "outline" && entry.type === "file") {
    return <span className="file-glyph-text" aria-hidden="true">{workspaceFileGlyphLabel(entry)}</span>;
  }

  return <span className="file-glyph-icon">{workspaceFileGlyphSvg(entry)}</span>;
}

function workspaceFileTone(entry: Pick<WorkspaceFileEntry, "type" | "kind" | "path">) {
  if (entry.type === "directory") return "folder";
  if (entry.kind === "image") return "image";
  if (entry.kind === "pdf") return "pdf";
  if (entry.kind === "markdown") return "markdown";
  const name = entry.path.split("/").at(-1)?.toLowerCase() || "";
  const extension = name.includes(".") ? name.split(".").at(-1) || "" : "";
  if (["tex", "latex", "bib", "cls", "sty", "bst"].includes(extension)) return "tex";
  if (["json", "yaml", "yml", "toml", "ini", "cfg"].includes(extension)) return "config";
  if (["ts", "tsx", "js", "jsx", "mjs", "cjs", "py", "go", "rs", "java", "c", "cc", "cpp", "h", "hpp"].includes(extension)) return "code";
  if (["css", "scss", "less", "html", "htm", "xml", "svg"].includes(extension)) return "style";
  if (["sh", "zsh", "bash", "fish"].includes(extension)) return "shell";
  return "file";
}

function WorkspaceTreeNode({ entry, depth, expanded, selectedPath, revealDirectory, loadingDirectories, onToggle, onLoadDirectory, onOpenFile }: {
  entry: WorkspaceFileEntry;
  depth: number;
  expanded: Set<string>;
  selectedPath: string | null;
  revealDirectory: { path: string; id: number } | null;
  loadingDirectories: Set<string>;
  onToggle: (filePath: string) => void;
  onLoadDirectory: (filePath: string) => void;
  onOpenFile: (filePath: string) => void;
}) {
  const isDirectory = entry.type === "directory";
  const isExpanded = isDirectory && expanded.has(entry.path);
  const isLoading = loadingDirectories.has(entry.path);
  const rowRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (isDirectory && revealDirectory?.path === entry.path) rowRef.current?.scrollIntoView({ block: "nearest" });
  }, [entry.path, isDirectory, revealDirectory?.id, revealDirectory?.path]);
  useEffect(() => {
    if (isExpanded && entry.children === undefined && !isLoading) onLoadDirectory(entry.path);
  }, [entry.children, entry.path, isExpanded, isLoading, onLoadDirectory]);
  return <div className="workspace-tree-node">
    <button ref={rowRef} className={`workspace-tree-row${isDirectory ? " is-directory" : ""}${entry.path === selectedPath ? " active" : ""}`} style={{ paddingLeft: `${8 + depth * 15}px` }} onClick={() => isDirectory ? onToggle(entry.path) : onOpenFile(entry.path)} title={entry.path}>
      <span className="tree-disclosure">{isLoading ? <RefreshCw className="spin" size={11} /> : isDirectory ? isExpanded ? <ChevronDown size={13} /> : <ChevronRight size={13} /> : null}</span>
      <span className={`tree-file-icon tone-${workspaceFileTone(entry)}`}><WorkspaceFileGlyph entry={entry} expanded={isExpanded} /></span>
      <strong>{entry.name}</strong>
    </button>
    {isExpanded && entry.children?.map((child) => <WorkspaceTreeNode key={child.path} entry={child} depth={depth + 1} expanded={expanded} selectedPath={selectedPath} revealDirectory={revealDirectory} loadingDirectories={loadingDirectories} onToggle={onToggle} onLoadDirectory={onLoadDirectory} onOpenFile={onOpenFile} />)}
  </div>;
}

function FilePreview({ file, draft, dirty, saving, conflict, saveError, loading, error, onDraftChange, onSave, onReload, onDismissConflict, onAddComment, onSelectionChange, compact = false }: {
  file: WorkspaceFilePreview | null;
  draft?: FileDraft;
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
  onAddComment: (comment: FileComment) => void;
  onSelectionChange?: (selection: FileSelection | null) => void;
  compact?: boolean;
}) {
  const { fileTextSize, fileTextShortcuts, increaseFileTextSize, decreaseFileTextSize, resetFileTextSize } = useUISettings();
  const [mode, setMode] = useState<"preview" | "edit">("preview");
  const [selection, setSelection] = useState<FileSelection | null>(null);
  const [commentOpen, setCommentOpen] = useState(false);
  const [commentBody, setCommentBody] = useState("");
  const onSaveRef = useRef(onSave);
  onSaveRef.current = onSave;
  useEffect(() => {
    setMode(dirty ? "edit" : "preview");
    setSelection(null);
    onSelectionChange?.(null);
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

  useEffect(() => {
    if (!file) return;
    const handleTextSize = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.target instanceof Element && event.target.closest(".app-dialog, [role=\"dialog\"]")) return;
      if (shortcutMatches(event, fileTextShortcuts.increase)) {
        event.preventDefault();
        increaseFileTextSize();
      } else if (shortcutMatches(event, fileTextShortcuts.decrease)) {
        event.preventDefault();
        decreaseFileTextSize();
      } else if (shortcutMatches(event, fileTextShortcuts.reset)) {
        event.preventDefault();
        resetFileTextSize();
      }
    };
    window.addEventListener("keydown", handleTextSize);
    return () => window.removeEventListener("keydown", handleTextSize);
  }, [file, fileTextShortcuts, increaseFileTextSize, decreaseFileTextSize, resetFileTextSize]);

  if (loading) return <div className="artifact-empty"><RefreshCw className="spin" size={18} />Loading file...</div>;
  if (error) return <div className="artifact-empty error"><FileText size={22} /><strong>Could not open this file</strong><span>{error}</span></div>;
  if (!file) return <div className="artifact-empty"><FolderOpen size={24} /><strong>Select a file from the workspace</strong><span>Code, Markdown, PDF, and images can be previewed here.</span></div>;

  return <section className="artifact-editor">
    <div className="artifact-editor-top">
      {(editable || !compact) && <div className={compact ? "artifact-editor-header compact" : "artifact-editor-header"}>
        {!compact && <><span className={`tree-file-icon tone-${workspaceFileTone({ type: "file", kind: file.kind, path: file.path })}`}><WorkspaceFileGlyph entry={{ type: "file", kind: file.kind, path: file.path }} /></span>
        <strong>{file.path}</strong>
        <small>{formatFileSize(file.size)}</small></>}
        {editable && <div className="artifact-editor-actions">
          <div className="artifact-view-toggle">
            <button className={mode === "preview" ? "active" : ""} onClick={() => setMode("preview")}>Preview</button>
            <button className={mode === "edit" ? "active" : ""} onClick={() => setMode("edit")}>Edit</button>
          </div>
          {editing && <button className="secondary-button artifact-comment-button" disabled={!selection} onClick={() => setCommentOpen(true)} title={selection ? `Comment on lines ${selection.startLine}${selection.endLine !== selection.startLine ? `-${selection.endLine}` : ""}` : "Select text in the editor to comment"}><MessageCircleReply size={12} />Comment</button>}
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
        <textarea autoFocus value={commentBody} onChange={(event) => setCommentBody(event.target.value)} placeholder="Ask Archimedes about this passage…" aria-label="Review comment" />
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
    <div className={`artifact-preview-surface${editing ? " editing" : ""}`} style={{ "--file-content-font-size": `${fileTextSize}px` } as React.CSSProperties}>
      {editing ? <Suspense fallback={<div className="artifact-empty"><LoaderCircle className="spin" size={18} />Loading editor...</div>}>
        <FileCodeEditor filePath={file.path} value={draft?.content ?? ""} onChange={(value) => onDraftChange(file.path, value)} onSave={onSave} onSelectionChange={(selection) => { setSelection(selection); onSelectionChange?.(selection); }} />
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
      customStyle={{ minWidth: "max-content", minHeight: "100%", margin: 0, padding: "13px 22px 28px 0", fontSize: "var(--file-content-font-size, 13px)", lineHeight: 1.65, tabSize: 2 }}
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

function FilesView({ workspace, tree, openFiles, selectedPath, directoryRequest, onDirectoryRequestHandled, file, loading, error, loadingDirectories, drafts, dirtyFiles, savingFiles, conflicts, saveErrors, onOpenFile, onSelectOpenFile, onCloseFile, onCloseOtherFiles, onCloseAllFiles, onLoadDirectory, onRefresh, onNewFile, onDraftChange, onSave, onReload, onDismissConflict, onAddComment, onFileSelectionChange, compact = false, compactWidth = 0, onOpenFull, onRestore }: {
  workspace: string;
  tree: WorkspaceFileTree;
  openFiles: WorkspaceFilePreview[];
  selectedPath: string | null;
  directoryRequest?: { path: string; workspace: string; id: number } | null;
  onDirectoryRequestHandled?: (id: number) => void;
  file: WorkspaceFilePreview | null;
  loading: boolean;
  error: string;
  loadingDirectories: Set<string>;
  drafts: Record<string, FileDraft>;
  dirtyFiles: Set<string>;
  savingFiles: Set<string>;
  conflicts: Record<string, string>;
  saveErrors: Record<string, string>;
  onOpenFile: (filePath: string) => void;
  onSelectOpenFile: (file: WorkspaceFilePreview) => void;
  onCloseFile: (filePath: string) => void;
  onCloseOtherFiles: (filePath: string) => void;
  onCloseAllFiles: () => void;
  onLoadDirectory: (directory: string) => void;
  onRefresh: () => void;
  onNewFile: () => void;
  onDraftChange: (filePath: string, content: string) => void;
  onSave: (filePath: string) => void;
  onReload: (filePath: string) => void;
  onDismissConflict: (filePath: string) => void;
  onAddComment: (comment: FileComment) => void;
  onFileSelectionChange?: (path: string, selection: FileSelection | null) => void;
  compact?: boolean;
  compactWidth?: number;
  onOpenFull?: () => void;
  onRestore?: () => void;
}) {
  const { t } = useUISettings();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [revealedDirectory, setRevealedDirectory] = useState<{ path: string; id: number } | null>(null);
  const [compactPane, setCompactPane] = useState<"browse" | "editor">(selectedPath ? "editor" : "browse");
  const [filesPaneWidth, setFilesPaneWidth] = useState(readFilesPaneWidth);
  const [filesListCollapsed, setFilesListCollapsed] = useState(false);
  const [filesEditorCollapsed, setFilesEditorCollapsed] = useState(false);
  const [tabMenu, setTabMenu] = useState<{ file: WorkspaceFilePreview; x: number; y: number } | null>(null);
  const [closingFullEditor, setClosingFullEditor] = useState(false);
  const tabsRef = useRef<HTMLDivElement | null>(null);
  const tabsScrollerRef = useRef<HTMLDivElement | null>(null);
  const tabsScrollThumbRef = useRef<HTMLSpanElement | null>(null);
  const [tabsOverflow, setTabsOverflow] = useState(false);
  const [tabsScrollbarDragging, setTabsScrollbarDragging] = useState(false);
  const syncTabsScrollbar = useCallback(() => {
    const element = tabsRef.current;
    const scroller = tabsScrollerRef.current;
    const thumb = tabsScrollThumbRef.current;
    if (!element || !scroller || !thumb) return;
    const overflow = element.scrollWidth > element.clientWidth + 1;
    setTabsOverflow(overflow);
    if (!overflow) return;
    const track = scroller.clientWidth;
    const width = Math.max(28, Math.round(track * (element.clientWidth / element.scrollWidth)));
    const maxScroll = element.scrollWidth - element.clientWidth;
    const offset = maxScroll > 0 ? (element.scrollLeft / maxScroll) * (track - width) : 0;
    thumb.style.width = `${width}px`;
    thumb.style.transform = `translateX(${Math.round(offset)}px)`;
  }, []);
  useEffect(() => {
    const element = tabsRef.current;
    if (!element) return;
    const observer = new ResizeObserver(syncTabsScrollbar);
    observer.observe(element);
    if (tabsScrollerRef.current) observer.observe(tabsScrollerRef.current);
    window.addEventListener("resize", syncTabsScrollbar);
    syncTabsScrollbar();
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", syncTabsScrollbar);
    };
  }, [openFiles.length, syncTabsScrollbar]);
  function startTabsScrollbarDrag(event: React.PointerEvent<HTMLDivElement>) {
    const element = tabsRef.current;
    const scroller = tabsScrollerRef.current;
    if (!element || !scroller) return;
    const maxScroll = element.scrollWidth - element.clientWidth;
    if (maxScroll <= 0) return;
    event.preventDefault();
    const track = scroller.clientWidth;
    const thumbWidth = Math.max(28, track * (element.clientWidth / element.scrollWidth));
    const startX = event.clientX;
    const startScroll = element.scrollLeft;
    const scrollPerPixel = maxScroll / Math.max(1, track - thumbWidth);
    setTabsScrollbarDragging(true);
    const handleMove = (moveEvent: PointerEvent) => {
      element.scrollLeft = startScroll + (moveEvent.clientX - startX) * scrollPerPixel;
    };
    const handleUp = () => {
      setTabsScrollbarDragging(false);
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  }
  useEffect(() => {
    const element = tabsRef.current;
    if (!element) return;
    const handleWheel = (event: WheelEvent) => {
      if (event.deltaX !== 0 || element.scrollWidth <= element.clientWidth) return;
      event.preventDefault();
      element.scrollLeft += event.deltaY;
    };
    element.addEventListener("wheel", handleWheel, { passive: false });
    return () => element.removeEventListener("wheel", handleWheel);
  }, [openFiles.length]);
  const workspaceName = workspacePathName(workspace);
  useEffect(() => {
    setRevealedDirectory(null);
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
  useEffect(() => {
    if (!directoryRequest || directoryRequest.workspace !== workspace) return;
    const parts = directoryRequest.path.split("/").filter(Boolean);
    setExpanded((current) => {
      const next = new Set(current);
      for (let index = 1; index <= parts.length; index += 1) next.add(parts.slice(0, index).join("/"));
      return next;
    });
    setRevealedDirectory({ path: directoryRequest.path, id: directoryRequest.id });
    setCompactPane("browse");
    setFilesListCollapsed(false);
    onDirectoryRequestHandled?.(directoryRequest.id);
  }, [directoryRequest, workspace, onDirectoryRequestHandled]);
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

  function absoluteWorkspacePath(filePath: string) {
    const separator = workspace.includes("\\") ? "\\" : "/";
    const root = workspace.replace(/[\\/]+$/, "");
    return `${root}${separator}${filePath.replace(/^[\\/]+/, "").split("/").join(separator)}`;
  }

  async function copyTabPath(filePath: string, relative: boolean) {
    const text = relative ? filePath : absoluteWorkspacePath(filePath);
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const area = document.createElement("textarea");
      area.value = text;
      area.style.position = "fixed";
      area.style.opacity = "0";
      document.body.appendChild(area);
      area.select();
      try { document.execCommand("copy"); } finally { area.remove(); }
    }
  }

  const tabContextMenu = tabMenu ? <MenuSurface
    open
    onClose={() => setTabMenu(null)}
    cursor={{ x: tabMenu.x, y: tabMenu.y }}
    ariaLabel={t("File tab actions")}
    minWidth={200}
    width={210}
  >
    <MenuItem onClick={() => { setTabMenu(null); onCloseFile(tabMenu.file.path); }}>{t("Close")}</MenuItem>
    <MenuItem onClick={() => { setTabMenu(null); onCloseOtherFiles(tabMenu.file.path); }}>{t("Close others")}</MenuItem>
    <MenuItem onClick={() => { setTabMenu(null); onCloseAllFiles(); }}>{t("Close all")}</MenuItem>
    <MenuDivider />
    <MenuItem onClick={() => { setTabMenu(null); void copyTabPath(tabMenu.file.path, false); }}>{t("Copy path")}</MenuItem>
    <MenuItem onClick={() => { setTabMenu(null); void copyTabPath(tabMenu.file.path, true); }}>{t("Copy relative path")}</MenuItem>
  </MenuSurface> : null;

  function restoreFullEditor() {
    if (!onRestore || closingFullEditor) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      onRestore();
      return;
    }
    setClosingFullEditor(true);
    window.setTimeout(onRestore, 150);
  }
  function startFilesPaneResize(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = filesPaneWidth;
    const resizeWidth = compact ? compactWidth : window.innerWidth;
    const onPointerMove = (pointerEvent: PointerEvent) => {
      setFilesPaneWidth(clampFilesPaneWidth(startWidth + pointerEvent.clientX - startX, resizeWidth));
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
    const resizeWidth = compact ? compactWidth : window.innerWidth;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      setFilesPaneWidth((width) => clampFilesPaneWidth(width - 16, resizeWidth));
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      setFilesPaneWidth((width) => clampFilesPaneWidth(width + 16, resizeWidth));
    } else if (event.key === "Home") {
      event.preventDefault();
      setFilesPaneWidth(FILES_PANE_DEFAULT_WIDTH);
    }
  }

  const browser = <aside className="artifact-browser">
    {!compact && <div className="artifact-browser-heading">
      <FolderOpen size={14} />
      <strong title={workspace}>{workspaceName}</strong>
      <div className="artifact-browser-heading-actions">
        <button onClick={onRefresh} title="Refresh workspace files" aria-label="Refresh workspace files"><RefreshCw size={13} /></button>
        <button onClick={onNewFile} title="New file" aria-label="New file"><Plus size={14} /></button>
      </div>
    </div>}
    {tree.entries.map((entry) => <WorkspaceTreeNode key={entry.path} entry={entry} depth={0} expanded={expanded} selectedPath={revealedDirectory?.path ?? selectedPath} revealDirectory={revealedDirectory} loadingDirectories={loadingDirectories} onToggle={toggleDirectory} onLoadDirectory={onLoadDirectory} onOpenFile={(path) => { setRevealedDirectory(null); setCompactPane("editor"); setFilesEditorCollapsed(false); onOpenFile(path); }} />)}
    {!tree.entries.length && <p className="artifact-browser-empty">This workspace has no visible files.</p>}
  </aside>;

  const tabs = openFiles.length > 0 ? <div className="artifact-tabs-scroller" ref={tabsScrollerRef}>
    <div ref={tabsRef} className="artifact-tabs" role="tablist" aria-label="Open files" onScroll={syncTabsScrollbar}>
      {openFiles.map((openFile) => <div
        className={openFile.path === selectedPath ? "artifact-tab active" : "artifact-tab"}
        key={openFile.path}
        onContextMenu={(event) => { event.preventDefault(); setTabMenu({ file: openFile, x: event.clientX, y: event.clientY }); }}
      >
        <button className="artifact-tab-main" role="tab" aria-selected={openFile.path === selectedPath} onClick={() => { setRevealedDirectory(null); setCompactPane("editor"); setFilesEditorCollapsed(false); onSelectOpenFile(openFile); }} title={openFile.path}>
          {dirtyFiles.has(openFile.path) && <span className="artifact-dirty-dot" title="Unsaved changes" />}
          <span className={`artifact-file-icon tree-file-icon tone-${workspaceFileTone({ type: "file", kind: openFile.kind, path: openFile.path })}`}><WorkspaceFileGlyph entry={{ type: "file", kind: openFile.kind, path: openFile.path }} /></span><span className="artifact-tab-name">{openFile.name}</span>
        </button>
        <button className="artifact-tab-close" onClick={() => onCloseFile(openFile.path)} title={`Close ${openFile.name}`}><X size={12} /></button>
      </div>)}
    </div>
    <div
      className={`artifact-tabs-scrollbar${tabsOverflow ? " visible" : ""}${tabsScrollbarDragging ? " dragging" : ""}`}
      aria-hidden="true"
      onPointerDown={startTabsScrollbarDrag}
    >
      <span ref={tabsScrollThumbRef} />
    </div>
  </div> : null;

  const editor = <div className={compact ? "artifact-editor-pane compact" : "artifact-editor-pane"}>
    {!compact && <div className="artifact-tabs-row artifact-tabs-row-full">
      {tabs}
      {onRestore && <div className="artifact-tabs-row-actions"><button className="artifact-tabs-restore" onClick={restoreFullEditor} title="Restore to workbench" aria-label="Restore to workbench"><Minimize2 size={13} /></button></div>}
    </div>}
    <FilePreview
      compact
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
      onSelectionChange={(selection) => onFileSelectionChange?.(file?.path ?? "", selection)}
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
      <div className="artifact-tabs-row">
        {showingEditor && !split && <button className="artifact-workbench-back" onClick={() => setCompactPane("browse")} title="Back to files"><ChevronLeft size={13} /><span>Files</span></button>}
        {tabs}
        <div className="artifact-workbench-actions">
          {split && <div className="artifact-workbench-pane-toggles" role="group" aria-label="File panes">
            <button className={filesListCollapsed ? "" : "active"} onClick={toggleFilesList} title={filesListCollapsed ? "Show file list" : "Collapse file list"} aria-label={filesListCollapsed ? "Show file list" : "Collapse file list"} aria-pressed={!filesListCollapsed}>{filesListCollapsed ? <ChevronsRight size={13} /> : <ChevronsLeft size={13} />}</button>
            <button className={filesEditorCollapsed ? "" : "active"} onClick={toggleFilesEditor} title={filesEditorCollapsed ? "Show editor" : "Collapse editor"} aria-label={filesEditorCollapsed ? "Show editor" : "Collapse editor"} aria-pressed={!filesEditorCollapsed}>{filesEditorCollapsed ? <ChevronsLeft size={13} /> : <ChevronsRight size={13} />}</button>
          </div>}
          <button onClick={onRefresh} title="Refresh workspace files" aria-label="Refresh workspace files"><RefreshCw size={13} /></button>
          <button onClick={onNewFile} title="New file" aria-label="New file"><Plus size={14} /></button>
          {onOpenFull && <button onClick={onOpenFull} title="Open full editor" aria-label="Open full editor"><Maximize2 size={13} /></button>}
        </div>
      </div>
      <div className={bodyClass} style={{ "--files-pane-width": `${filesPaneWidth}px` } as React.CSSProperties}>
        {split ? <>
          {!filesListCollapsed && browser}
          {!filesListCollapsed && !filesEditorCollapsed && <div className="artifact-workbench-divider" role="separator" aria-orientation="vertical" aria-label="Resize file list" aria-valuemin={FILES_PANE_MIN_WIDTH} aria-valuemax={Math.max(FILES_PANE_MIN_WIDTH, compactWidth - FILES_EDITOR_MIN_WIDTH - 7)} aria-valuenow={filesPaneWidth} tabIndex={0} onPointerDown={startFilesPaneResize} onDoubleClick={() => setFilesPaneWidth(FILES_PANE_DEFAULT_WIDTH)} onKeyDown={handleFilesPaneResizeKey}><span /></div>}
          {!filesEditorCollapsed && editor}
        </> : showingEditor ? editor : browser}
      </div>
      {tabContextMenu}
    </div>;
  }

  return <div className={`artifact-workbench artifact-workbench-full${closingFullEditor ? " is-closing" : ""}`}>
    <div className="artifact-workbench-body split" style={{ "--files-pane-width": `${filesPaneWidth}px` } as React.CSSProperties}>
      {browser}
      <div className="artifact-workbench-divider" role="separator" aria-orientation="vertical" aria-label="Resize file list" aria-valuemin={FILES_PANE_MIN_WIDTH} aria-valuemax={1200} aria-valuenow={filesPaneWidth} tabIndex={0} onPointerDown={startFilesPaneResize} onDoubleClick={() => setFilesPaneWidth(FILES_PANE_DEFAULT_WIDTH)} onKeyDown={handleFilesPaneResizeKey}><span /></div>
      {editor}
    </div>
    {tabContextMenu}
  </div>;
}

function WorkspaceModal({ modal, fileName, onFileName, onClose, onCreateFile }: { modal: Modal; fileName: string; onFileName: (value: string) => void; onClose: () => void; onCreateFile: () => void }) {
  if (!modal) return null;
  return <Dialog open onClose={onClose} size="sm" className="workspace-modal" ariaLabelledBy="workspace-file-title">
    <header className="modal-header"><div><h2 id="workspace-file-title">New workspace file</h2><p>Create a file in the workspace, then open it in the Files view.</p></div><button className="app-dialog-close" onClick={onClose} aria-label="Close"><X size={16} /></button></header>
    <label>File name<input autoFocus value={fileName} onChange={(event) => onFileName(event.target.value)} placeholder="literature-gap.md" onKeyDown={(event) => event.key === "Enter" && onCreateFile()} /></label>
    <footer className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancel</button><button className="primary-button" onClick={onCreateFile}><Plus size={14} />Create draft</button></footer>
  </Dialog>;
}

export default App;
