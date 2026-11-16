export interface BuildInfo {
  version: string;
  commit: string;
  channel: string;
  branch?: string | null;
  sourceDirty: boolean | null;
  sourceFingerprint: string | null;
  capabilities: { cloudEntryPoints: boolean; defaultResearchApps: string[]; betaResearchApps: string[] } | null;
  platform: string;
  arch: string;
  packaged: boolean;
  electron: string | null;
}
