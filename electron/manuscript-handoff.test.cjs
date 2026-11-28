const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");
const { captureManuscriptSources, writeManuscriptSnapshot } = require("./manuscript-snapshot.cjs");
const { prepareManuscriptReview, verifiedReviewedPdf, prepareRevision } = require("./manuscript-handoff.cjs");

test("rechecks a compiled manuscript and drafts only one selected page in its private owner", t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-manuscript-handoff-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "paper"));
  const source = path.join(root, "paper/main.tex");
  const content = "\\documentclass{article}\n\\begin{document}Original\\end{document}\n";
  fs.writeFileSync(source, content);
  const requested = captureManuscriptSources(root, "paper/main.tex");
  const buildDirectory = path.join(root, ".archimedes/latex-build/a0/abc-123");
  fs.mkdirSync(buildDirectory, { recursive: true });
  const pdfPath = path.join(buildDirectory, "main.pdf");
  fs.writeFileSync(pdfPath, "%PDF fixture");
  const receipt = writeManuscriptSnapshot({ root, buildDirectory, buildId: "abc-123", requested, started: requested, finished: requested, pdfPath, log: "", compiled: true, engine: "fixture" });
  let owner = root;
  const store = {
    getProjectWorkspace: id => id === "workspace" ? { project_id: "project", root } : null,
    canAccessProject: id => id === "project",
    currentStore: () => ({ workspace: owner }),
    createResearchThread: input => input,
  };
  const input = { projectId: "project", workspaceId: "workspace", manifestPath: receipt.manifest_path };
  const origin = prepareManuscriptReview(store, input);
  assert.equal(verifiedReviewedPdf(origin).toString("utf8"), "%PDF fixture");
  fs.writeFileSync(source, content.replace("Original", "New version"));
  assert.throws(() => prepareManuscriptReview(store, input), /Save and compile/);
  const run = { id: "review-1", manuscript: origin, result: { document: { pageCount: 2 }, review: { weaknesses: [
    { text: "Unselected note", page: 1 }, { text: "Selected note", page: 2 },
  ] } } };
  const selection = { group: "weaknesses", index: 1 };
  const { thread, draft } = prepareRevision(store, run, selection);
  assert.equal(thread.visibility, "private");
  assert.equal(thread.workspaceId, "workspace");
  assert.match(draft, /Selected note/);
  assert.match(draft, /#page=2/);
  assert.ok(draft.includes(origin.sourceVersion));
  assert.doesNotMatch(draft, /Unselected note/);
  owner = "/another-data-workspace";
  assert.throws(() => prepareRevision(store, run, selection), /different project workspace/);
  fs.writeFileSync(pdfPath, "%PDF replaced");
  assert.throws(() => verifiedReviewedPdf(origin), /reviewed PDF has changed/);
});
