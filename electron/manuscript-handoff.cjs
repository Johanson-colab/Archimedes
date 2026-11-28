const fs = require("node:fs");
const { createHash } = require("node:crypto");
const { readManuscriptSnapshot } = require("./manuscript-snapshot.cjs");
const { workspacePath } = require("./workspace-files.cjs");

function manuscriptWorkspace(store, projectId, workspaceId, role = "editor", origin = {}) {
  const workspace = store.getProjectWorkspace(workspaceId);
  if (!workspace || workspace.project_id !== projectId || !store.canAccessProject(projectId, role)) {
    throw new Error("The manuscript belongs to a different project workspace.");
  }
  const currentRoot = fs.realpathSync(workspace.root);
  if (!origin.workspace) return currentRoot;
  const requested = fs.realpathSync(origin.workspace);
  if (origin.threadId) {
    const thread = store.getResearchThread(origin.threadId);
    if (!thread || thread.project_id !== projectId ||
      fs.realpathSync(thread.workspace_path || currentRoot) !== requested) {
      throw new Error("The manuscript belongs to a different project workspace.");
    }
  } else if (requested !== currentRoot) {
    throw new Error("The manuscript belongs to a different project workspace.");
  }
  return requested;
}

function prepareManuscriptReview(store, { projectId, workspaceId, manifestPath, workspace, threadId }) {
  const originRoot = manuscriptWorkspace(store, projectId, workspaceId, "editor", { workspace, threadId });
  const receipt = readManuscriptSnapshot(originRoot, manifestPath);
  if (!receipt.current || !receipt.pdf) throw new Error("Save and compile the current manuscript before reviewing it.");
  const origin = {
    dataWorkspace: store.currentStore().workspace, projectId, workspaceId, threadId: threadId || "",
    workspace: originRoot, mainPath: receipt.source_path, manifestPath: receipt.manifest_path,
    sourceVersion: receipt.requested_source.source_version, buildId: receipt.build_id,
    pdfPath: receipt.pdf.path, pdfSha256: receipt.pdf.sha256,
  };
  return origin;
}

function authorizeManuscriptRecord(store, origin, role = "viewer") {
  if (!origin || store.currentStore().workspace !== origin.dataWorkspace ||
    !store.canAccessProject(origin.projectId, role)) {
    throw new Error("The manuscript belongs to a different project workspace.");
  }
  return origin;
}

function authorizeManuscriptRun(store, origin, role = "viewer") {
  authorizeManuscriptRecord(store, origin, role);
  const workspace = manuscriptWorkspace(store, origin.projectId, origin.workspaceId, role, origin);
  if (workspace !== origin.workspace) throw new Error("The manuscript belongs to a different project workspace.");
  return origin;
}

function reviewedPdfPath(origin, retainedPath = "") {
  const candidates = [];
  if (retainedPath && fs.existsSync(retainedPath)) candidates.push(retainedPath);
  try { candidates.push(workspacePath(origin.workspace, origin.pdfPath)); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
  let missing = false;
  for (const target of candidates) {
    try {
      const bytes = fs.readFileSync(target);
      if (createHash("sha256").update(bytes).digest("hex") === origin.pdfSha256) return target;
    } catch (error) {
      if (error.code === "ENOENT") { missing = true; continue; }
      throw error;
    }
  }
  throw new Error(missing ? "The reviewed PDF is no longer available." : "The reviewed PDF has changed.");
}

function verifiedReviewedPdf(origin, retainedPath = "") {
  return fs.readFileSync(reviewedPdfPath(origin, retainedPath));
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

module.exports = { prepareManuscriptReview, authorizeManuscriptRecord, authorizeManuscriptRun, reviewedPdfPath, verifiedReviewedPdf, reviewedFinding, prepareRevision };
