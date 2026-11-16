export interface ReproductionInputSnapshot {
  version: 1;
  restoration?: { version: 1; importedAt: string; sourceRecordsSha256: string; originalRunId: string; originalReproductionId: string; originalOwner: ReproductionInputSnapshot["owner"]; originalCheckout: NonNullable<ReproductionInputSnapshot["prepared"]>["checkout"] };
  runId: string;
  reproductionId: string;
  createdAt: string;
  owner: { dataRoot: string; projectId: string | null; workspaceId: string | null; executionRoot: string | null };
  plan: { version: string; contract: ReproductionContract };
  paper: { paperId: string | null; readerSha256: string | null; indexedAt: string | null; pageCount: number | null };
  environment: { backend: string; declared: Record<string, unknown>; requirements: { name: string; required: boolean; reason: string; hasValue: boolean }[]; coverage: string };
  prepared: { at: string; image: string | null; backend: string; checkout: { url: string; branch: string; commit: string | null; dirty: boolean | null; location: string | null; storage: "local" | "remote" } | null } | null;
  final: { planVersion: string; runbook: ReproductionStep[]; findings: ReproductionContract["findings"]; steps: ReproductionRunStep[]; logs: { index: number; command: string; storage: string; path: string; bytes?: number; lines?: number }[]; status: string; summary: string; finishedAt: string } | null;
}
export interface ReproductionSnapshotState {
  status: "legacy-unrecorded" | "recorded" | "stale" | "restored-history";
  reasons: string[];
  limitations?: string[];
}
