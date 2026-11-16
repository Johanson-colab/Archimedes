export interface ManuscriptSourceFile {
  path: string;
  bytes: number;
  sha256: string;
}

export interface ManuscriptSourceManifest {
  workspace: string;
  source_path: string;
  project_path: string;
  coverage: 'manuscript-directory';
  source_version: string;
  observation_version: string;
  files: ManuscriptSourceFile[];
  total_bytes: number;
  untracked_inputs: { path: string; target: string; reason: string }[];
  excluded_directories: string[];
}

export interface ManuscriptBuildSnapshot {
  version: 1;
  build_id: string;
  workspace: string;
  source_path: string;
  project_path: string;
  created_at: string;
  engine: string;
  requested_source: ManuscriptSourceManifest;
  started_source_version: string;
  finished_source_version: string | null;
  source_changed: boolean;
  status: 'current' | 'stale' | 'failed' | 'unverified';
  pdf: ManuscriptSourceFile | null;
  log: ManuscriptSourceFile & { retention: 'bounded compiler output' };
  manifest_path: string;
}

/** Fresh disk verification required before passing a build to review/slides. */
export interface ManuscriptBuildVerification extends ManuscriptBuildSnapshot {
  current_source_version: string | null;
  source_matches: boolean;
  pdf_matches: boolean;
  verification_error: string;
  current: boolean;
}
