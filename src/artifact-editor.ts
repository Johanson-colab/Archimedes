export type ArtifactLineEnding = "\n" | "\r\n";

export interface ArtifactDraft {
  path: string;
  content: string;
  savedContent: string;
  lineEnding: ArtifactLineEnding;
  modifiedAt: string;
}

export interface ArtifactSelection {
  startLine: number;
  endLine: number;
  excerpt: string;
}

export interface ArtifactComment extends ArtifactSelection {
  path: string;
  body: string;
}

export const MAX_EDITABLE_ARTIFACT_BYTES = 2_000_000;

export function isEditableArtifact(file: Pick<WorkspaceFilePreview, "kind" | "size"> | null | undefined) {
  return Boolean(file && (file.kind === "text" || file.kind === "markdown") && file.size <= MAX_EDITABLE_ARTIFACT_BYTES);
}

export function detectLineEnding(content: string): ArtifactLineEnding {
  return content.includes("\r\n") ? "\r\n" : "\n";
}

export function toEditorText(content: string) {
  return content.replace(/\r\n?/g, "\n");
}

export function fromEditorText(content: string, lineEnding: ArtifactLineEnding) {
  return lineEnding === "\r\n" ? content.replace(/\r?\n/g, "\r\n") : content.replace(/\r\n?/g, "\n");
}

export function createArtifactDraft(file: WorkspaceFilePreview): ArtifactDraft | null {
  if (!isEditableArtifact(file) || typeof file.content !== "string") return null;
  const content = toEditorText(file.content);
  return {
    path: file.path,
    content,
    savedContent: content,
    lineEnding: detectLineEnding(file.content),
    modifiedAt: file.modifiedAt,
  };
}

export function isDraftDirty(draft: ArtifactDraft | null | undefined) {
  return Boolean(draft && draft.content !== draft.savedContent);
}

export function prepareArtifactContent(draft: ArtifactDraft) {
  return fromEditorText(draft.content, draft.lineEnding);
}

export interface RefreshedArtifactFiles {
  files: WorkspaceFilePreview[];
  conflicts: Record<string, string>;
}

/**
 * Keep unsaved buffers when the workspace watcher reloads files. A dirty draft
 * whose baseline no longer matches the file on disk is reported as a conflict
 * instead of silently replacing the user's edits.
 */
export function mergeRefreshedArtifactFiles(
  openFiles: WorkspaceFilePreview[],
  refreshedFiles: WorkspaceFilePreview[],
  drafts: Record<string, ArtifactDraft>,
  savingPaths: ReadonlySet<string> = new Set(),
): RefreshedArtifactFiles {
  const refreshedByPath = new Map(refreshedFiles.map((file) => [file.path, file]));
  const conflicts: Record<string, string> = {};
  const files = openFiles.map((current) => {
    const refreshed = refreshedByPath.get(current.path);
    if (!refreshed) return current;
    const draft = drafts[current.path];
    if (!draft || !isDraftDirty(draft)) return refreshed;
    if (savingPaths.has(current.path)) return current;
    const onDisk = toEditorText(refreshed.content ?? "");
    if (onDisk !== draft.savedContent) conflicts[current.path] = onDisk;
    return current;
  });
  return { files, conflicts };
}

export function markDraftSaved(draft: ArtifactDraft, savedContent: string, modifiedAt: string): ArtifactDraft {
  return {
    ...draft,
    savedContent,
    modifiedAt,
  };
}

export function formatArtifactComment(comment: ArtifactComment) {
  const range = comment.startLine === comment.endLine
    ? `line ${comment.startLine}`
    : `lines ${comment.startLine}-${comment.endLine}`;
  const excerpt = comment.excerpt.trim().slice(0, 2_000);
  const quoted = excerpt.split(/\r?\n/).map((line) => `> ${line}`).join("\n");
  return `Review comment on \`${comment.path}\` (${range}):\n${quoted}\n\n${comment.body.trim()}`;
}
