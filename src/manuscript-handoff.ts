export type ManuscriptSource = {
  workspace: string;
  projectId: string;
  mainPath: string;
  selectedPath: string;
  manifestPath: string;
  sourceVersion: string;
  pdfPath: string;
  pdfSha256: string;
  buildId: string;
};
export type ManuscriptOrigin = ManuscriptSource & {
  dataRoot: string;
  workspaceId: string;
  threadId: string | null;
};
export type ManuscriptTarget = "paper-review" | "paper-to-slides";
export type ManuscriptOpenRequest = { origin: ManuscriptOrigin; token: string };
export type ManuscriptChatSource = Pick<ManuscriptOrigin, "workspace" | "projectId" | "workspaceId" | "threadId" | "dataRoot" | "mainPath" | "selectedPath">;
