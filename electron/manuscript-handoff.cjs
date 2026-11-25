const fs = require("node:fs");
const { createHash } = require("node:crypto");
const { readManuscriptSnapshot } = require("./manuscript-snapshot.cjs");
const { workspacePath } = require("./workspace-files.cjs");

function manuscriptWorkspace(store, projectId, workspaceId, role = "editor") {
  const workspace = store.getProjectWorkspace(workspaceId);
  if (!workspace || workspace.project_id !== projectId || !store.canAccessProject(projectId, role)) {
    throw new Error("The manuscript belongs to a different project workspace.");
  }
  return fs.realpathSync(workspace.root);
}

function prepareManuscriptReview(store, { projectId, workspaceId, manifestPath }) {
  const workspace = manuscriptWorkspace(store, projectId, workspaceId);
  const receipt = readManuscriptSnapshot(workspace, manifestPath);
  if (!receipt.current || !receipt.pdf) throw new Error("Save and compile the current manuscript before reviewing it.");
  const origin = {
    dataWorkspace: store.currentStore().workspace, projectId, workspaceId,
    workspace, mainPath: receipt.source_path, manifestPath: receipt.manifest_path,
    sourceVersion: receipt.requested_source.source_version, buildId: receipt.build_id,
    pdfPath: receipt.pdf.path, pdfSha256: receipt.pdf.sha256,
  };
  return origin;
}

function authorizeManuscriptRun(store, origin, role = "viewer") {
  if (!origin || store.currentStore().workspace !== origin.dataWorkspace ||
    manuscriptWorkspace(store, origin.projectId, origin.workspaceId, role) !== origin.workspace) {
    throw new Error("The manuscript belongs to a different project workspace.");
  }
  return origin;
}

function verifiedReviewedPdf(origin) {
  const target = workspacePath(origin.workspace, origin.pdfPath);
  const bytes = fs.readFileSync(target);
  if (createHash("sha256").update(bytes).digest("hex") !== origin.pdfSha256) throw new Error("The reviewed PDF has changed.");
  return bytes;
}

function reviewedFinding(run, { group, index }) {
  if (!["strengths", "weaknesses", "questions", "limitations"].includes(group) || !Number.isSafeInteger(index)) {
    throw new Error("Choose a finding with a page number.");
  }
  const finding = run?.result?.review?.[group]?.[index];
  if (!finding?.text || !Number.isSafeInteger(finding.page) || finding.page < 1 ||
    finding.page > run.result.document?.pageCount) throw new Error("Choose a finding with a page number.");
  return finding;
}

function prepareRevision(store, run, selection) {
  const origin = authorizeManuscriptRun(store, run?.manuscript, "editor");
  const finding = reviewedFinding(run, selection);
  const thread = store.createResearchThread({
    projectId: origin.projectId, workspaceId: origin.workspaceId, workspacePath: origin.workspace,
    visibility: "private", mode: "paper-generation", title: `Manuscript revision (page ${finding.page})`,
  });
  const draft = `Revision note for ${origin.mainPath}\n\n${finding.text}\n\nSource: simulated review ${run.id}, page ${finding.page}\nReviewed PDF: ${origin.pdfPath}#page=${finding.page}\nManuscript version: ${origin.sourceVersion}`;
  return { thread, draft };
}

module.exports = { prepareManuscriptReview, authorizeManuscriptRun, verifiedReviewedPdf, reviewedFinding, prepareRevision };
