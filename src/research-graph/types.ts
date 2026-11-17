/**
 * Research graph contract for the renderer.
 *
 * Keep the kind lists in sync with electron/research-graph/constants.cjs.
 * The graph stores meaningful research objects only; runs, files and reviews
 * are evidence attached to a node, not graph nodes.
 */

export const RESEARCH_NODE_KINDS = [
  "question",
  "idea",
  "experiment",
  "result",
  "writing",
] as const;

export type ResearchNodeKind = (typeof RESEARCH_NODE_KINDS)[number];

export const RESEARCH_NODE_STATUSES = ["draft", "active", "retracted"] as const;

export type ResearchNodeStatus = (typeof RESEARCH_NODE_STATUSES)[number];

export const RESEARCH_EDGE_KINDS = [
  "generates",
  "tests",
  "produces",
  "supports",
  "contradicts",
  "inconclusive",
  "informs",
  "decides",
  "refines",
  "merges",
  "extends",
  "replicates",
  "cites",
] as const;

export type ResearchEdgeKind = (typeof RESEARCH_EDGE_KINDS)[number];

export interface ResearchRevision {
  id: string;
  node_id: string;
  parent_revision_id: string | null;
  content: Record<string, unknown>;
  content_hash: string;
  source_turn_id: string | null;
  source_event_id: string | null;
  git_commit: string | null;
  created_by: string;
  created_at: string;
}

export interface ResearchNode {
  id: string;
  project_id: string;
  thread_id?: string | null;
  kind: ResearchNodeKind;
  status: ResearchNodeStatus;
  title: string;
  summary: string;
  current_revision_id: string | null;
  current_revision: ResearchRevision | null;
  source_run_id?: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  archived_by: string | null;
  archive_reason: string;
  archived: boolean;
}

export interface ResearchEdge {
  id: string;
  project_id: string;
  thread_id?: string | null;
  from_node: string;
  from_revision: string;
  to_node: string;
  to_revision: string;
  kind: ResearchEdgeKind;
  metadata: Record<string, unknown>;
  created_by: string;
  created_at: string;
}

export interface ResearchGraph {
  projectId: string;
  threadId?: string | null;
  nodes: ResearchNode[];
  edges: ResearchEdge[];
}

export interface ResearchGraphUpdate {
  projectId: string;
  threadId: string;
  turnId: string;
  createdNodeIds: string[];
  createdEdgeIds: string[];
  superseded?: Array<{ nodeId: string; previousStatus: ResearchNodeStatus; reason?: string }>;
  supersededNodeIds?: string[];
  nodeCount: number;
  edgeCount: number;
  skippedNodeCount?: number;
  reason?: string;
}

export interface ResearchGraphIssue {
  code: string;
  message: string;
  nodeId?: string;
  edgeId?: string;
}

export const EXPERIMENT_RUN_STATUSES = ["starting", "running", "succeeded", "failed", "cancelled"] as const;

export type ExperimentRunStatus = (typeof EXPERIMENT_RUN_STATUSES)[number];

export type ExperimentVerdict = "supports" | "contradicts" | "inconclusive";

export interface ExperimentActivity {
  id: string; project_id: string; thread_id: string; node_id: string;
  run_id: string | null; turn_id: string | null;
  category: string; status: string; title: string; source: "agent_reported"; created_at: string;
}

export interface ExperimentRun {
  id: string;
  project_id: string;
  thread_id: string;
  node_id: string;
  status: ExperimentRunStatus;
  backend: string;
  command: string;
  cwd: string;
  commit_sha: string | null;
  log_path: string;
  pid: number | null;
  exit_code: number | null;
  metrics: Record<string, unknown>;
  evidence?: Array<{
    id: string; turn_id: string | null; created_at: string;
    metrics: Record<string, number>;
    artifacts: Array<{ path: string; sha256: string; sizeBytes: number }>;
  }>;
  provenance?: {
    experimentRevisionId?: string;
    ideas?: Array<{ nodeId: string; revisionId: string; experimentRevisionId?: string }>;
    workspace?: { id: string; root: string; branchName: string; baseCommit: string; parentRunId?: string | null } | null;
    codeSnapshot?: { kind: string; commit: string; path: string; sha256: string; sizeBytes: number; limitations: string } | null;
  } | null;
  error: string;
  started_at: string | null;
  ended_at: string | null;
  created_at: string;
  updated_at: string;
}
