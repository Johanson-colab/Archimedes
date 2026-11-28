export type ManuscriptReviewOrigin = {
  dataWorkspace: string;
  projectId: string;
  workspaceId: string;
  threadId?: string;
  workspace: string;
  mainPath: string;
  manifestPath: string;
  sourceVersion: string;
  buildId: string;
  pdfPath: string;
  pdfSha256: string;
};

export type ManuscriptReviewRequest = {
  origin: ManuscriptReviewOrigin;
  destination: { provider: string; baseUrl: string; model: string };
};

export type ManuscriptReviewFinding = {
  runId: string;
  group: "strengths" | "weaknesses" | "questions" | "limitations";
  index: number;
};
