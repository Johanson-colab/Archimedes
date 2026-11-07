const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const store = require("./store.cjs");

function openTempWorkspace(prefix) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  store.openWorkspace(root);
  return root;
}

test("paper chats do not appear as research sessions in the sidebar", () => {
  const root = openTempWorkspace("archimedes-thread-kind-");
  try {
    const project = store.listResearchProjects()[0];
    const research = store.createResearchThread({ prompt: "Compare three reranking strategies", mode: "free-chat", projectId: project.id });
    const paper = store.createResearchThread({
      prompt: "You are preparing a durable research reading guide for the paper \"IdeaScientist\"",
      mode: "deep-research",
      projectId: project.id,
      kind: "paper",
      title: "IdeaScientist: Orchestrating Agents for Grounded Scientific Ideation",
    });

    const listed = store.listResearchThreads({ projectId: project.id }).map((thread) => thread.id);
    assert.ok(listed.includes(research.id), "a normal research session stays in the sidebar");
    assert.equal(listed.includes(paper.id), false, "a paper chat must not be listed");

    // The title comes from the paper, not from the internal instruction.
    assert.equal(store.getResearchThread(paper.id).title, "IdeaScientist: Orchestrating Agents for Grounded Scientific Ideation");
    // The thread still works normally once you open it from the paper.
    assert.equal(store.getResearchThread(paper.id).kind, "paper");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a thread linked to a paper is migrated out of the sidebar", () => {
  const root = openTempWorkspace("archimedes-thread-migrate-");
  try {
    const project = store.listResearchProjects()[0];
    const library = store.listLibraries(project.id)[0];
    const paper = store.addPaper(library.id, { canonical_key: "doi:10.1/thread-kind", title: "Linked paper", authors: ["A"] });
    const thread = store.createResearchThread({ prompt: "Read the full paper", mode: "deep-research", projectId: project.id });
    assert.ok(store.listResearchThreads({ projectId: project.id }).some((item) => item.id === thread.id));
    store.setPaperChatThread(paper.id, thread.id, project.id);
    assert.equal(store.listResearchThreads({ projectId: project.id }).some((item) => item.id === thread.id), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("paper chat stays under its paper while research conversations remain visible", () => {
  const root = openTempWorkspace("archimedes-paper-work-isolation-");
  const other = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-paper-work-close-"));
  try {
    const project = store.listResearchProjects()[0];
    const library = store.listLibraries(project.id)[0];
    const paper = store.addPaper(library.id, { title: "A paper", authors: ["A"] });
    const research = store.createResearchThread({ prompt: "Independent work", mode: "free-chat", projectId: project.id });
    const chat = store.createResearchThread({ prompt: "Read the paper", mode: "deep-research", projectId: project.id, kind: "paper" });
    const turn = store.startResearchTurn({ threadId: chat.id, taskId: null, prompt: "Read the paper", mode: "deep-research" });
    assert.deepEqual(store.listResearchThreads({ projectId: project.id }).map((item) => item.id), [research.id]);
    store.finishResearchTurn(turn.id, { response: "Paper answer" });
    store.setPaperChatThread(paper.id, chat.id, project.id);
    store.openWorkspace(other);
    store.openWorkspace(root);
    assert.deepEqual(store.listResearchThreads({ projectId: project.id }).map((item) => item.id), [research.id]);
    assert.equal(store.getPaperChatThread(paper.id, project.id).messages.at(-1).text, "Paper answer");
  } finally {
    store.openWorkspace(other);
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(other, { recursive: true, force: true });
  }
});

test("paper run events and completion do not update Work state", () => {
  const app = fs.readFileSync(path.join(__dirname, "..", "src", "App.tsx"), "utf8");
  const library = fs.readFileSync(path.join(__dirname, "..", "src", "LibraryView.tsx"), "utf8");
  assert.match(library, /clientRunId = `paper-chat:\$\{crypto\.randomUUID\(\)\}`/);
  assert.match(app, /if \(event\.clientRunId\?\.startsWith\("side-chat:"\) \|\| event\.clientRunId\?\.startsWith\("paper-chat:"\)\) return;/);
  assert.doesNotMatch(library, /onAgentRun/);
  assert.match(app, /previewThreads\.filter\(\(thread\) => thread\.kind !== "paper"\)/);
});
