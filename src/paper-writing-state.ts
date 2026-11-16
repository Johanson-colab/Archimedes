export type WritingDocument = {
  workspace: string;
  file: WorkspaceFilePreview;
  draft: string;
  savedDraft: string;
  saveState: "saved" | "saving" | "unsaved";
  error: string;
  version: number;
  saveQueue: Promise<void>;
};

export function createWritingScope(workspace: string) {
  return {
    workspace,
    activeProject: "",
    projects: [] as LatexProjectSummary[],
    projectsLoading: false,
    projectListSequence: 0,
    restorationAttempted: false,
    chooserTab: "existing" as "existing" | "new",
    tree: { entries: [], count: 0, truncated: false } as WorkspaceFileTree,
    loading: new Set<string>(),
    mainPath: "",
    selectedPath: "",
    documents: new Map<string, WritingDocument>(),
    expanded: new Set<string>(),
    activeDirectory: "",
    error: "",
    searchOpen: false,
    searchQuery: "",
    searchOffset: 0,
    buildLogOpen: false,
    coedit: false,
    chooserOpen: true,
    creating: false,
    importing: false,
    createKind: null as "file" | "folder" | null,
    createName: "",
    compileTarget: "",
    compileRequestId: "",
    compileLog: "",
    compileElapsed: 0,
    compilePhase: "Preparing compiler",
    compileState: "idle" as "idle" | "compiling" | "success" | "error",
    compileResult: null as LatexCompileResult | null,
    handoffBusy: false,
    activeProblem: null as number | null,
    activationSequence: 0,
    openSequence: 0,
    compileSequence: 0,
    directoryRequests: new Map<string, number>(),
  };
}

export type WritingScope = ReturnType<typeof createWritingScope>;

export function createWritingDocument(workspace: string, file: WorkspaceFilePreview): WritingDocument {
  const content = file.content || "";
  return { workspace, file, draft: content, savedDraft: content, saveState: "saved", error: "", version: 0, saveQueue: Promise.resolve() };
}

export function editWritingDocument(document: WritingDocument, content: string) {
  document.draft = content;
  document.version += 1;
  document.saveState = content === document.savedDraft ? "saved" : "unsaved";
}

/** Serialize snapshots for one owner/file; an older completion cannot save later typing. */
export function saveWritingDocument(
  document: WritingDocument,
  write: ResearchDeskBridge["writeWorkspaceFile"],
  changed: () => void,
) {
  const content = document.draft;
  const operation = document.saveQueue.then(async () => {
    if (content === document.savedDraft) return;
    document.saveState = "saving";
    changed();
    try {
      const saved = await write(document.workspace, document.file.path, content);
      document.file = { ...saved, content };
      document.savedDraft = content;
      document.version += 1;
      document.saveState = document.draft === content ? "saved" : "unsaved";
      document.error = "";
    } catch (error) {
      document.saveState = "unsaved";
      document.error = error instanceof Error ? error.message : String(error);
      throw error;
    } finally {
      changed();
    }
  });
  // A failed snapshot must not prevent a newer edit or an explicit retry.
  document.saveQueue = operation.catch(() => {});
  return operation;
}


export type WritingLocation = { projectPath: string; mainPath: string; selectedPath: string };
export function writingLocationKey(workspace: string, projectId?: string | null) {
  return `archimedes-writing-location:${JSON.stringify([workspace, projectId ?? null])}`;
}
export function readWritingLocation(storage: Pick<Storage, "getItem">, workspace: string, projectId?: string | null): WritingLocation | null {
  try {
    const saved = JSON.parse(storage.getItem(writingLocationKey(workspace, projectId)) || "null") as WritingLocation | null;
    if (!saved || ![saved.projectPath, saved.mainPath, saved.selectedPath].every((value) => typeof value === "string" && value.length > 0 && !value.startsWith("/") && !value.split(/[\\/]/).includes(".."))) return null;
    return saved;
  } catch { return null; }
}
export function rememberWritingLocation(storage: Pick<Storage, "setItem">, workspace: string, projectId: string | null | undefined, location: WritingLocation) {
  try { storage.setItem(writingLocationKey(workspace, projectId), JSON.stringify(location)); }
  catch { /* A local preference failure must not block editing a real file. */ }
}
