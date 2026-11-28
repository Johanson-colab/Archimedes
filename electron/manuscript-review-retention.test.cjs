const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { reviewedFinding } = require("./manuscript-handoff.cjs");

function scopedReviewHandlers(scope) {
  const source = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const start = source.indexOf("  function scopedReviewRun(");
  const end = source.indexOf('  ipcMain.handle("extensions:read-local",', start);
  assert.ok(start >= 0 && end > start, "review handler boundaries were not found");
  const handlers = new Map();
  const context = {
    ...scope,
    ipcMain: { handle: (channel, callback) => handlers.set(channel, callback) },
  };
  new Function(...Object.keys(context), source.slice(start, end))(...Object.values(context));
  return handlers;
}

test("saved manuscript review operations do not require a live execution workspace", async () => {
  const run = { id: "review", sourceKind: "manuscript", manuscript: { projectId: "project" } };
  const calls = [];
  const handlers = scopedReviewHandlers({
    windowWorkspaces: new Map([[7, "/data"]]),
    paperReview: {
      getRun: () => run,
      exportRun: () => ({ filename: "review.md", markdown: "Review" }),
    },
    manuscriptHandoff: {
      authorizeManuscriptRecord: (store, origin) => { calls.push(["record", origin]); return origin; },
      authorizeManuscriptRun: () => { calls.push(["workspace"]); throw new Error("workspace must not be required"); },
    },
    store: {},
    createRetainedPdfToken: () => "retained-token",
    createPreviewToken: () => "workspace-token",
    path,
    BrowserWindow: { fromWebContents: () => null },
    dialog: { showSaveDialog: async () => ({ canceled: true, filePath: "" }) },
    app: { getPath: () => "/documents" },
    fs,
  });
  const event = { sender: { id: 7, isDestroyed: () => false } };
  assert.equal(handlers.get("paper-review-app:get-run")(event, { runId: "review" }), run);
  assert.equal((await handlers.get("paper-review-app:export-run")(event, { runId: "review" })).saved, false);
  assert.deepEqual(calls, [["record", run.manuscript], ["record", run.manuscript]]);
});

test("reviewed page links use the retained PDF by content hash", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-review-page-"));
  const retained = path.join(root, "pdfs", "abc.pdf");
  fs.mkdirSync(path.dirname(retained), { recursive: true });
  fs.writeFileSync(retained, "%PDF fixture");
  const origin = { projectId: "project", workspace: root, pdfPath: ".archimedes/latex-build/a0/abc/build.pdf", pdfSha256: "abc" };
  const run = { id: "review", sourceKind: "manuscript", manuscript: origin, result: { document: { pageCount: 2 }, review: { strengths: [{ text: "A finding", page: 2 }] } } };
  const handlers = scopedReviewHandlers({
    windowWorkspaces: new Map([[7, "/data"]]),
    paperReview: {
      getRun: () => run,
      retainedPdfPath: sha => sha === "abc" ? retained : "",
    },
    manuscriptHandoff: {
      authorizeManuscriptRun: (store, value) => value,
      reviewedFinding,
      reviewedPdfPath: () => retained,
    },
    store: {},
    createRetainedPdfToken: (sender, target) => {
      assert.equal(sender, 7);
      assert.equal(target, retained);
      return "retained-token";
    },
    createPreviewToken: () => { throw new Error("the pruned build PDF must not be used"); },
    path,
    BrowserWindow: { fromWebContents: () => null },
    dialog: {},
    app: {},
    fs,
  });
  const url = handlers.get("paper-review-app:manuscript-page")({ sender: { id: 7 } }, { runId: "review", group: "strengths", index: 0 });
  assert.equal(url, `archimedes-file://retained-token/abc.pdf#page=2`);
  fs.rmSync(root, { recursive: true, force: true });
});
