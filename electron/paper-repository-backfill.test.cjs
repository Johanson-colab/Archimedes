const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const store = require("./store.cjs");

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-paper-repo-"));
}

test("opening a workspace fills in repositories named by the abstracts", () => {
  const root = workspace();
  try {
    store.openWorkspace(root);
    const library = store.createLibrary({ name: "Papers" });
    store.addPaper(library.id, {
      title: "Evo-Harness",
      abstract: "Code is released at https://github.com/A-EVO-Lab/a-evolve/tree/release/evo-harness.",
      url: "https://arxiv.org/abs/2608.15071",
      year: 2026,
    });
    store.addPaper(library.id, {
      title: "No code released",
      abstract: "We describe a method and publish no code.",
      url: "https://arxiv.org/abs/1234.5678",
      year: 2026,
    });

    // Reopening is what triggers the backfill for papers already in the database.
    const other = workspace();
    store.openWorkspace(other);
    store.openWorkspace(root);

    const papers = store.listPapers(library.id);
    const evo = papers.find((paper) => paper.title === "Evo-Harness");
    const none = papers.find((paper) => paper.title === "No code released");
    assert.equal(evo.github_url, "https://github.com/A-EVO-Lab/a-evolve/tree/release/evo-harness");
    assert.equal(none.github_url, "", "a paper without a link keeps an empty field instead of a guess");

    store.openWorkspace(other);
    fs.rmSync(other, { recursive: true, force: true });
  } finally {
    store.openWorkspace(os.tmpdir());
    fs.rmSync(root, { recursive: true, force: true });
  }
});
