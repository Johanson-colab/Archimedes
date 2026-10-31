const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const store = require("./store.cjs");

function setup() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-project-libraries-"));
  store.setLocalIdentity({ userId: "usr_library_owner", displayName: "Library Owner", deviceId: "dev", deviceName: "test" });
  const snapshot = store.openWorkspace(root);
  return { root, snapshot };
}

function samplePaper(title = "Evidence-aware retrieval") {
  return {
    title,
    authors: ["A. Researcher"],
    year: 2026,
    venue: "TestConf",
    abstract: "A paper about retrieval.",
    url: "https://example.com/paper",
    pdf_url: "",
    doi: "",
    arxiv_id: "",
    s2_id: "",
    source: "manual",
  };
}

test("libraries are scoped to their owning project", () => {
  const { root, snapshot } = setup();
  try {
    const defaultProject = snapshot.projects[0];
    const projectLibrary = store.listLibraries(defaultProject.id);
    assert.ok(projectLibrary.length >= 1);
    assert.ok(projectLibrary.every((library) => library.project_id === defaultProject.id));

    const second = store.createResearchProject({ name: "Second project" });
    const secondLibraries = store.listLibraries(second.id);
    assert.equal(secondLibraries.length, 1);
    assert.equal(secondLibraries[0].name, "Project library");
    assert.equal(secondLibraries[0].project_id, second.id);
    assert.ok(store.listLibraries(defaultProject.id).every((library) => library.id !== secondLibraries[0].id));

    const created = store.createLibrary({ projectId: second.id, name: "Review shelf" });
    assert.equal(created.project_id, second.id);
    assert.equal(store.listLibraries(second.id).length, 2);
    assert.equal(store.listLibraries(defaultProject.id).some((library) => library.id === created.id), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a paper can live in libraries owned by different projects without duplicating the paper", () => {
  const { root, snapshot } = setup();
  try {
    const defaultProject = snapshot.projects[0];
    const second = store.createResearchProject({ name: "Shared evidence" });
    const firstLibrary = store.createLibrary({ projectId: defaultProject.id, name: "Cross-project shelf" });
    const secondLibrary = store.listLibraries(second.id)[0];
    store.addPaper(firstLibrary.id, samplePaper());
    store.addPaper(secondLibrary.id, samplePaper());
    const firstPapers = store.listPapers(firstLibrary.id);
    const secondPapers = store.listPapers(secondLibrary.id);
    assert.equal(firstPapers.length, 1);
    assert.equal(secondPapers.length, 1);
    assert.equal(firstPapers[0].id, secondPapers[0].id);
    assert.equal(store.listLibraries(defaultProject.id).find((library) => library.id === firstLibrary.id).paper_count, 1);
    assert.equal(store.listLibraries(second.id).find((library) => library.id === secondLibrary.id).paper_count, 1);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("library access follows project membership and the last library is protected", () => {
  const { root, snapshot } = setup();
  try {
    const project = snapshot.projects[0];
    const library = store.listLibraries(project.id)[0];
    store.setLocalIdentity({ userId: "usr_outsider", displayName: "Outsider" });
    assert.deepEqual(store.listLibraries(project.id), []);
    assert.throws(() => store.createLibrary({ projectId: project.id, name: "Nope" }), /permission/i);
    assert.throws(() => store.listPapers(library.id), /access/i);

    store.setLocalIdentity({ userId: "usr_library_owner", displayName: "Library Owner" });
    const created = store.createLibrary({ projectId: project.id, name: "Second shelf" });
    store.deleteLibrary(created.id);
    const remaining = store.listLibraries(project.id);
    assert.ok(remaining.length > 1);
    for (const item of remaining.slice(1)) store.deleteLibrary(item.id);
    const last = store.listLibraries(project.id);
    assert.equal(last.length, 1);
    assert.throws(() => store.deleteLibrary(last[0].id), /at least one library/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
