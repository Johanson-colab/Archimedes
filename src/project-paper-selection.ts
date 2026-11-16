export type ProjectPaperSelection = {
  project_id: string;
  paper_id: string;
  reason: string;
  discovery: Record<string, unknown>;
  updated_at: string;
};

export type SelectionBridge = ResearchDeskBridge & {
  addLibraryPaper: (libraryId: string, paper: AcademicSearchResult, selection?: { reason?: string; discovery?: Record<string, unknown> }) => Promise<LibraryPaper>;
  getProjectPaperSelection: (paperId: string, projectId: string) => Promise<ProjectPaperSelection | null>;
  saveProjectPaperSelection: (paperId: string, projectId: string, patch: { reason?: string; discovery?: Record<string, unknown> }) => Promise<ProjectPaperSelection>;
};

export function discoveryProvenance(snapshot: { mode: DailyDiscoveryMode | "conference"; range: DailyDiscoveryRange; topic: DailyDiscoveryTopic; searchKind: "quick" | "deep"; submittedQuery: string; response: DailyDiscoveryResponse | null; deepResponse: DeepPaperSearchResponse | null }, paper: AcademicSearchResult) {
  const source = snapshot.searchKind === "deep" ? snapshot.deepResponse : snapshot.response;
  const match = snapshot.deepResponse?.results.find((result) => result.paper.external_id === paper.external_id && result.paper.title === paper.title);
  return {
    query: snapshot.submittedQuery,
    criteria: JSON.stringify({ mode: snapshot.mode, range: snapshot.range, topic: snapshot.topic, searchKind: snapshot.searchKind, ...(snapshot.searchKind === "deep" ? { plan: snapshot.deepResponse?.plan } : {}) }),
    fetched_at: source?.fetched_at || new Date().toISOString(),
    providers: source?.providers || [], degraded: Boolean(source?.warning || (snapshot.searchKind === "quick" && snapshot.response?.stale)),
    warning: source?.warning || "", machine_reason: match?.reason || "",
  };
}
