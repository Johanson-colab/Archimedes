export type TransferSourceFile = { workspaceId: string; threadId?: string; path: string };
export type ProjectTransferSelection = { pdfs: boolean; annotations: boolean; reports: boolean; conversations: boolean; results: boolean; artifacts: boolean; reproductions: boolean; sourceFiles: TransferSourceFile[] };
export type ProjectTransferUnavailable = { category: string; path: string; reason: string; reference?: { table?: string; id?: string } };
export type ProjectTransferPreview = {
  format: 'archimedes-project'; version: 1; name: string; path?: string;
  counts: Record<string, number>; fileCount: number; totalBytes: number;
  unavailable: ProjectTransferUnavailable[]; selection: ProjectTransferSelection;
  files: { category: string; root: string; path: string; bytes: number; sha256: string }[];
};
export type ProjectTransferBridge = {
  previewProjectPackage(projectId: string, selection: ProjectTransferSelection): Promise<ProjectTransferPreview>;
  exportProjectPackage(projectId: string, selection: ProjectTransferSelection): Promise<{ canceled: boolean; package?: ProjectTransferPreview }>;
  chooseProjectTransferSources(projectId: string, mode: 'files' | 'folder'): Promise<{ canceled: boolean; files: TransferSourceFile[]; excluded: number }>;
  inspectProjectPackage(): Promise<{ canceled: boolean; package?: ProjectTransferPreview }>;
  importProjectPackage(input: { packagePath: string; name?: string }): Promise<{ canceled: boolean; project?: ResearchProject; workspacePath?: string; unavailable?: ProjectTransferUnavailable[] }>;
};
export const DEFAULT_TRANSFER_SELECTION: ProjectTransferSelection = { pdfs: true, annotations: true, reports: true, conversations: true, results: true, artifacts: true, reproductions: true, sourceFiles: [] };
