const path = require("node:path");
const { canonicalWorkspace } = require("./workspace-context.cjs");
const { readManuscriptSnapshot, pinManuscriptSnapshot, unpinManuscriptSnapshot } = require("./manuscript-snapshot.cjs");

function verifyManuscriptOrigin(store, input) {
  if (!input || typeof input !== "object" || canonicalWorkspace(input.dataRoot) !== store.workspace) throw new Error("The manuscript belongs to another data workspace.");
  const project = store.getResearchProject(input.projectId);
  if (!project || project.archived_at || !store.canAccessProject(project.id, "editor")) throw new Error("You do not have permission to hand off this manuscript.");
  const workspace = store.getProjectWorkspace(input.workspaceId);
  if (!workspace || workspace.project_id !== project.id) throw new Error("The manuscript workspace belongs to another project.");
  const thread = input.threadId ? store.getResearchThread(input.threadId) : null;
  if (thread && (thread.project_id !== project.id || thread.workspace_id !== workspace.id)) throw new Error("The manuscript source session belongs to another project workspace.");
  const root = canonicalWorkspace(thread?.workspace_path || workspace.root);
  if (canonicalWorkspace(input.workspace) !== root) throw new Error("The manuscript execution folder does not match its source owner.");
  const checked = readManuscriptSnapshot(root, input.manifestPath);
  if (!checked.current || !checked.pdf) throw new Error("Save and compile the current manuscript before handing it off.");
  if (input.sourceVersion !== checked.requested_source.source_version || input.pdfSha256 !== checked.pdf.sha256
    || input.buildId !== checked.build_id || input.mainPath !== checked.source_path || input.pdfPath !== checked.pdf.path) throw new Error("The manuscript source or PDF version no longer matches this build.");
  const { workspacePath } = require("./workspace-files.cjs");
  const selected = workspacePath(root, typeof input.selectedPath === "string" ? input.selectedPath : checked.source_path);
  return { dataRoot: store.workspace, projectId: project.id, workspaceId: workspace.id, threadId: thread?.id || null,
    workspace: root, mainPath: checked.source_path, selectedPath: path.relative(root, selected).split(path.sep).join("/"),
    manifestPath: checked.manifest_path, sourceVersion: checked.requested_source.source_version,
    pdfPath: checked.pdf.path, pdfSha256: checked.pdf.sha256, buildId: checked.build_id };
}

function retainManuscript(store, input, reference) {
  const origin = verifyManuscriptOrigin(store, input);
  pinManuscriptSnapshot(origin.workspace, origin.manifestPath, reference);
  return { origin, pdfPath: path.join(origin.workspace, origin.pdfPath), rollback() {
    unpinManuscriptSnapshot(origin.workspace, origin.manifestPath, reference);
  } };
}

module.exports = { verifyManuscriptOrigin, retainManuscript };
