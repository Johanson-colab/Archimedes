export type MetricMapping = {
  metricColumn?: string; expectedColumn: string; actualColumn: string;
  unitColumn?: string; actualUnitColumn?: string; unitValue?: string;
  datasetColumn?: string; actualDatasetColumn?: string; datasetValue?: string;
  toleranceColumn?: string; absoluteTolerance: string | number;
};
export type MetricInput = { token: string; name: string; sha256: string; bytes: number; format: string; headers: string[]; preview: string[][]; rowCount: number };
export type MetricRow = { row: number; metric: string; expectedRaw: string; actualRaw: string; expected: string | null; actual: string | null; expectedUnit: string; actualUnit: string; expectedDataset: string; actualDataset: string; tolerance: string | null; difference: string | null; status: 'missing' | 'incomparable' | 'within' | 'outside'; reason: string };
export type MetricOwner = { dataRoot: string; projectId: string; workspaceId: string; executionRoot: string; reproductionId: string; runId: string };
export type MetricComparison = { version: 1; id: string; title: string; owner: MetricOwner; createdAt: string; runSnapshotSha256: string | null; source: { name: string; path: string; sha256: string; bytes: number; originalPath: string; origin: 'user-selected-file' }; mapping: MetricMapping; rows: MetricRow[]; counts: Record<MetricRow['status'], number>; coverage: string; manifestPath: string; sourceState: 'ready' | 'missing' | 'changed'; runSnapshotMatches: boolean; state: 'recorded' | 'stale'; reasons: string[] };
export type MetricComparisonSummary = Omit<MetricComparison, 'rows'> | { id: string; state: 'invalid'; reasons: string[] };
export type MetricContext = { reproductionId: string; runId: string };
export type MetricComparisonBridge = {
  chooseMetricComparisonInput(input: MetricContext): Promise<{ canceled: boolean; input?: MetricInput }>;
  saveMetricComparison(input: MetricContext & { inputToken: string; title: string; mapping: MetricMapping }): Promise<MetricComparison>;
  listMetricComparisons(input: MetricContext): Promise<MetricComparisonSummary[]>;
  getMetricComparison(input: MetricContext & { comparisonId: string }): Promise<MetricComparison>;
};
