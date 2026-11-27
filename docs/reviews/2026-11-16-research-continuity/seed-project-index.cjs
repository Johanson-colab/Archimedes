// Local UI fixture only. Invoke with the isolated app data root and project ID.
const path = require("node:path");
const fs = require("node:fs");
const root = path.resolve(__dirname, "../../..");
const store = require(path.join(root, "electron/store.cjs"));
const results = require(path.join(root, "electron/project-results.cjs"));
const history = require(path.join(root, "electron/paper-writing-history.cjs"));
const dataRoot = fs.realpathSync(process.argv[2]);
if (!dataRoot.includes("archimedes-research-continuity")) throw new Error("Use the isolated research-continuity UI fixture.");
const owner = store.createWorkspaceStore(dataRoot);
try {
  const project = process.argv[3] ? owner.getResearchProject(process.argv[3]) : owner.listResearchProjects()[0];
  const workspace = owner.defaultProjectWorkspace(project.id), executionRoot = workspace.root;
  const library = owner.listLibraries(project.id)[0] || owner.createLibrary({ projectId: project.id, name: "Selected literature" });
  const paper = owner.addPaper(library.id, { title: "Evidence retention in research workflows", doi: "10.1000/research-continuity-ui", authors: ["Research fixture"], year: 2026, venue: "Workflow study", abstract: "A local fixture for revisiting research evidence." });
  let thread = owner.listResearchThreads({ projectId: project.id, workspaceId: workspace.id }).find(item => item.title === "Inspect retention results");
  if (!thread) thread = owner.createResearchThread({ projectId: project.id, workspaceId: workspace.id, title: "Inspect retention results", mode: "free-chat" });
  const result = results.savePackage({ id: "ui-research-continuity-analysis", projectId: project.id, workspaceId: workspace.id, executionRoot, threadId: thread.id, kind: "analysis", title: "Retention by workflow", manifest: { version: 1, source: { name: "retention.csv", file: "source.csv", inputId: "ui-retention", format: "csv" }, config: { type: "bar", x: 0, y: 1, group: -1 } }, files: [{ name: "source.csv", role: "source", encoding: "utf8", content: "workflow,retained\nA,8\nB,6\n" }, { name: "plot.svg", role: "output", encoding: "utf8", content: '<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><text x="20" y="30">Retention: A 8, B 6</text></svg>' }] });
  owner.registerProjectResult(result);
  let reproduction = owner.listReproductions({ projectId: project.id }).find(item => item.title === "Retention reproducibility check");
  if (!reproduction) reproduction = owner.createReproduction({ projectId: project.id, workspaceId: workspace.id, paperId: paper.id, title: "Retention reproducibility check", repoUrl: "https://example.invalid/retention" });
  let run = owner.listReproductionRuns(reproduction.id)[0];
  if (!run) run = owner.createReproductionRun({ reproductionId: reproduction.id, backend: "local", status: "verified" });
  const options = { listManuscriptVersions: history.listProjectManuscriptVersions };
  const index = owner.listProjectResearchIndex({ projectId: project.id }, options);
  if (!index.notes.length) {
    owner.saveProjectResearchNote({ projectId: project.id, kind: "conclusion", text: "Workflow A retained more evidence in this small comparison. The result needs a larger sample.", evidenceRefs: index.items.filter(item => item.kind === "paper" && item.id === paper.id || item.kind === "analysis" && item.id === result.id) }, options);
    owner.saveProjectResearchNote({ projectId: project.id, kind: "question", text: "Does the difference remain after restarting and restoring the project?", evidenceRefs: index.items.filter(item => item.kind === "run" && item.id === run.id) }, options);
  }
  console.log(JSON.stringify({ projectId: project.id, name: project.name, executionRoot, paperId: paper.id, analysisId: result.id, reproductionId: reproduction.id, runId: run.id }));
} finally { owner.close(); }
