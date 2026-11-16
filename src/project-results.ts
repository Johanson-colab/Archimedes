export type ProjectResultKind = "analysis" | "figure";
export type ProjectResultOwner = { projectId: string; workspaceId: string; executionRoot: string };
export type ProjectResultFile = { name: string; role: "source" | "reference" | "output"; encoding: "utf8" | "base64"; content: string };
export type ProjectResultSummary = ProjectResultOwner & { id: string; threadId: string | null; kind: ProjectResultKind; title: string; manifestPath: string; createdAt: string; updatedAt: string };
export type ProjectResultFileMetadata = Omit<ProjectResultFile, "content"> & { path: string; sizeBytes: number; sha256: string; actualSha256: string | null; fileState: "ready" | "changed" | "missing" };
export type ProjectResultDetail = ProjectResultSummary & { manifest: Record<string, unknown>; files: ProjectResultFileMetadata[]; fileState: "ready" | "changed" | "missing"; missingFiles: string[]; changedFiles: string[] };
export type SaveProjectResultInput = { id?: string; projectId: string; workspaceId?: string; threadId?: string | null; kind: ProjectResultKind; title: string; manifest: Record<string, unknown>; files: ProjectResultFile[] };
export type ProjectResultFileReceipt = Pick<ProjectResultFile, "name" | "encoding" | "content"> & { sha256: string; actualSha256: string; fileState: "ready" | "changed" };
export type ProjectResultsBridge = {
  saveProjectResult(input: SaveProjectResultInput): Promise<ProjectResultDetail>;
  listProjectResults(input: { projectId: string; workspaceId?: string; kind?: ProjectResultKind }): Promise<ProjectResultSummary[]>;
  getProjectResult(id: string): Promise<ProjectResultDetail>;
  readProjectResultFile(id: string, name: string): Promise<ProjectResultFileReceipt>;
};
export type AnalysisChatInput = { id: string; name: string; threadId?: string | null; resultId?: string; sourcePath?: string; attachSource?: boolean };
export type StageProjectResultFigureInput = { resultId: string; fileName: string; target: { projectId: string; workspaceId: string; threadId: string | null; workspace: string; mainPath: string } };
export type StageProjectResultFigureReceipt = { path: string; sha256: string; source: { resultId: string; manifestPath: string; name: string; sha256: string } };

export type ProjectResultOpenRequest = { id: string; token: string; dataRoot?: string; projectId?: string };
export type ResultFigureRequest = { dataRoot: string; projectId: string; resultId: string; fileName: string; title: string; token: string };
