const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const test = require("node:test");
const store = require("./store.cjs");
const agent = require("./agent.cjs");
const models = require("./model-config.cjs");
const { createWorkspaceIpc } = require("./workspace-context.cjs");
const { registerProjectResultCommands } = require("./project-result-commands.cjs");
const { registerThreadCommands } = require("./thread-commands.cjs");

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-result-commands-")));
  const roots = Object.fromEntries(["data", "other", "execution", "next"].map(name => {
    const folder = path.join(root, name); fs.mkdirSync(folder); return [name, folder];
  }));
  const owner = store.createWorkspaceStore(roots.data), other = store.createWorkspaceStore(roots.other);
  const project = owner.createResearchProject({ name: "Result owner", workspacePath: roots.execution });
  const workspace = owner.defaultProjectWorkspace(project.id);
  let selected = roots.data, bridge;
  const handlers = new Map();
  const ipcMain = createWorkspaceIpc({ ipcMain: { handle: (channel, callback) => handlers.set(channel, callback) }, store, workspaceForEvent: () => selected });
  registerProjectResultCommands({ ipcMain, store });
  registerThreadCommands({ ipcMain, store, dataWorkspace: () => selected });
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, "preload.cjs"), "utf8"), { process, require(name) {
    assert.equal(name, "electron");
    return { contextBridge: { exposeInMainWorld: (_name, value) => { bridge = value; } }, ipcRenderer: {
      invoke: (channel, input) => Promise.resolve().then(() => handlers.get(channel)({ sender: { id: 1 } }, input)),
    } };
  } });
  t.after(() => { store.closeAllWorkspaces(); fs.rmSync(root, { recursive: true, force: true }); });
  const input = { projectId: project.id, workspaceId: workspace.id, kind: "analysis", title: "Real CSV", manifest: { version: 1, source: { file: "source.csv" } }, files: [
    { name: "source.csv", role: "source", encoding: "utf8", content: "x,y\n1,2\n" },
    { name: "plot.svg", role: "output", encoding: "utf8", content: '<svg xmlns="http://www.w3.org/2000/svg"/>' },
  ] };
  return { root, ...roots, owner, other, project, workspace, bridge, input, select: value => { selected = value; } };
}

test("real bridge saves to the canonical project root, registers only actual sessions, and cannot cross data stores", async t => {
  const f = fixture(t);
  const saved = await f.bridge.saveProjectResult({ ...f.input, executionRoot: f.other });
  assert.equal(saved.executionRoot, f.execution);
  assert.equal(saved.threadId, null);
  assert.equal(f.owner.listProjectThreadsForSync(f.project.id).length, 0, "saving a figure/analysis must not invent a conversation");
  assert.equal(fs.existsSync(path.join(f.data, "research-results")), false);
  assert.equal(fs.readFileSync(path.join(f.execution, saved.files[0].path), "utf8"), f.input.files[0].content);
  const thread = f.owner.createResearchThread({ projectId: f.project.id, workspaceId: f.workspace.id, prompt: "Analyse full source", mode: "free-chat" });
  const linked = await f.bridge.saveProjectResult({ ...f.input, id: saved.id, threadId: thread.id });
  assert.equal(linked.threadId, thread.id);
  assert.deepEqual(f.owner.listArtifacts(thread.id).map(file => file.path).sort(), linked.files.map(file => file.path).sort());
  assert.ok((await f.bridge.getProjectResult(saved.id)).files.every(file => !("content" in file)));
  assert.equal((await f.bridge.readProjectResultFile(saved.id, "source.csv")).content, f.input.files[0].content);
  f.select(f.other.workspace);
  await assert.rejects(f.bridge.getProjectResult(saved.id), /not found/);
  assert.equal(f.other.listProjectResultRecords({ projectId: f.other.defaultResearchProject().id }).length, 0);
});

test("updates retain historical roots, validate session ownership before writes, and survive session deletion/reopen", async t => {
  const f = fixture(t), saved = await f.bridge.saveProjectResult(f.input);
  const thread = f.owner.createResearchThread({ projectId: f.project.id, workspaceId: f.workspace.id, prompt: "Original context", mode: "free-chat" });
  f.owner.setResearchProjectWorkspace(f.project.id, f.next);
  const nextThread = f.owner.createResearchThread({ projectId: f.project.id, workspaceId: f.workspace.id, prompt: "New folder", mode: "free-chat" });
  await assert.rejects(f.bridge.saveProjectResult({ ...f.input, id: saved.id, threadId: nextThread.id }), /linked session/);
  const linked = await f.bridge.saveProjectResult({ ...f.input, id: saved.id, threadId: thread.id, title: "Historical output" });
  assert.equal(linked.executionRoot, f.execution);
  assert.equal(fs.existsSync(path.join(f.next, "research-results")), false);
  f.owner.deleteResearchThread(thread.id);
  f.owner.close();
  const reopened = store.createWorkspaceStore(f.data);
  assert.equal(reopened.getProjectResultRecord(saved.id).threadId, null);
  assert.equal((await f.bridge.getProjectResult(saved.id)).threadId, null);
  assert.equal((await f.bridge.listProjectResults({ projectId: f.project.id }))[0].title, "Historical output");
});

test("viewers can reopen result files and see changed hashes but cannot save or inject credentials", async t => {
  const f = fixture(t), saved = await f.bridge.saveProjectResult(f.input);
  await assert.rejects(f.bridge.saveProjectResult({ ...f.input, manifest: { apiKey: "fake-must-not-save" } }), /without credentials/);
  f.owner.addProjectMember({ projectId: f.project.id, userId: "result-viewer", role: "viewer" });
  store.setLocalIdentity({ userId: "result-viewer", displayName: "Viewer" });
  try {
    assert.equal((await f.bridge.getProjectResult(saved.id)).fileState, "ready");
    await assert.rejects(f.bridge.saveProjectResult({ ...f.input, id: saved.id }), /permission/);
    fs.writeFileSync(path.join(f.execution, saved.files[0].path), "changed input\n");
    const changed = await f.bridge.readProjectResultFile(saved.id, "source.csv");
    assert.equal(changed.fileState, "changed"); assert.notEqual(changed.sha256, changed.actualSha256);
    await assert.rejects(f.bridge.readProjectResultFile(saved.id, "../unregistered.csv"), /filename|registered/);
  } finally { store.setLocalIdentity({ userId: "local-user", displayName: "Local user", deviceId: "local-device", deviceName: "This device" }); }
});

test("a saved 9 MiB CSV is actually readable through the research agent at its final row with bounded output", async t => {
  const f = fixture(t), line = `1,${"x".repeat(1020)}\n`, rows = Math.floor(9 * 1024 * 1024 / line.length);
  const csv = `x,y\n${line.repeat(rows)}999,ACTUAL_FINAL_CSV_ROW\n`;
  const saved = await f.bridge.saveProjectResult({ ...f.input, files: [{ ...f.input.files[0], content: csv }] });
  const source = saved.files[0];
  assert.ok(source.sizeBytes > 8 * 1024 * 1024 && source.sizeBytes < 10 * 1024 * 1024);
  assert.equal((await f.bridge.readProjectResultFile(saved.id, "source.csv")).fileState, "ready");
  models.initializeModelConfig(path.join(f.root, "settings"));
  models.saveModelConfig({ provider: "custom", baseUrl: "https://fake-provider.invalid/v1", model: "fake", apiKey: "fake-not-a-credential" });
  let calls = 0, actualTool;
  const previous = global.fetch;
  t.after(() => { global.fetch = previous; });
  global.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    const message = ++calls === 1
      ? { content: "", tool_calls: [{ id: "actual-read", type: "function", function: { name: "read_workspace_file", arguments: JSON.stringify({ path: source.path, start_line: rows + 2, end_line: rows + 2 }) } }] }
      : (() => { actualTool = request.messages.find(message => message.role === "tool"); return { content: "The last row is 999,ACTUAL_FINAL_CSV_ROW." }; })();
    return { ok: true, headers: { get: () => "application/json" }, json: async () => ({ choices: [{ finish_reason: message.tool_calls ? "tool_calls" : "stop", message }] }) };
  };
  const result = await agent.runAgent({ dataStore: f.owner, projectId: f.project.id, workspaceId: f.workspace.id, workspace: f.execution, prompt: `Read the final row of ${source.path}.` });
  assert.equal(result.status, "completed");
  assert.equal(calls, 2);
  const read = JSON.parse(actualTool.content);
  assert.equal(read.content, "999,ACTUAL_FINAL_CSV_ROW");
  assert.equal(read.start_line, rows + 2);
  assert.ok(actualTool.content.length < 64_000);
  assert.ok(result.thread.events.some(event => event.type === "tool_result" && JSON.stringify(event.payload).includes("ACTUAL_FINAL_CSV_ROW")));
});

test("a historical saved result creates a legitimate empty source session and stages hash-bound figures without editing the manuscript", async t => {
  const f = fixture(t);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO/+XK8AAAAASUVORK5CYII=", "base64");
  const input = { ...f.input, files: [...f.input.files, { name: "plot.png", role: "output", encoding: "base64", content: png.toString("base64") }] };
  const saved = await f.bridge.saveProjectResult(input);
  fs.mkdirSync(path.join(f.execution, "paper")); fs.writeFileSync(path.join(f.execution, "paper/main.tex"), "Original manuscript\n");
  f.owner.setResearchProjectWorkspace(f.project.id, f.next);
  const thread = await f.bridge.createResearchThread({ projectId: f.project.id, workspaceId: f.workspace.id, basedOnResultId: saved.id });
  assert.equal(thread.workspace_path, f.execution); assert.equal(thread.based_on_result_id, saved.id); assert.equal(thread.turns.length, 0);
  assert.equal((await f.bridge.createResearchThread({ projectId: f.project.id, workspaceId: f.workspace.id })).workspace_path, f.next);
  await assert.rejects(f.bridge.createResearchThread({ projectId: f.project.id, basedOnResultId: saved.id, workspacePath: f.next }), /does not match/);
  await assert.rejects(f.bridge.createResearchThread({ basedOnThreadId: thread.id, basedOnResultId: saved.id }), /Choose one source/);
  const target = { projectId: f.project.id, workspaceId: f.workspace.id, threadId: thread.id, workspace: f.execution, mainPath: "paper/main.tex" };
  const staged = await f.bridge.stageProjectResultFigure({ resultId: saved.id, fileName: "plot.png", target });
  assert.deepEqual(fs.readFileSync(path.join(f.execution, staged.path)), png);
  assert.equal((await f.bridge.stageProjectResultFigure({ resultId: saved.id, fileName: "plot.png", target })).path, staged.path);
  assert.equal(fs.readFileSync(path.join(f.execution, "paper/main.tex"), "utf8"), "Original manuscript\n");
  assert.equal(JSON.parse(fs.readFileSync(path.join(f.execution, `${staged.path}.source.json`))).source.resultId, saved.id);
  assert.ok(f.owner.listArtifacts(thread.id).some(file => file.path === staged.path && file.sha256 === staged.sha256));
  const changedPng = Buffer.concat([png, Buffer.from("new exported version")]);
  await f.bridge.saveProjectResult({ ...input, id: saved.id, threadId: thread.id, files: [...f.input.files, { name: "plot.png", role: "output", encoding: "base64", content: changedPng.toString("base64") }] });
  const next = await f.bridge.stageProjectResultFigure({ resultId: saved.id, fileName: "plot.png", target });
  assert.notEqual(next.path, staged.path); assert.deepEqual(fs.readFileSync(path.join(f.execution, staged.path)), png);
  fs.appendFileSync(path.join(f.execution, saved.files[0].path), "stale external source edit\n");
  await assert.rejects(f.bridge.stageProjectResultFigure({ resultId: saved.id, fileName: "plot.png", target }), /changed or missing/);
  const anotherData = path.join(f.root, "foreign-data"); fs.mkdirSync(anotherData); f.select(anotherData);
  await assert.rejects(f.bridge.createResearchThread({ basedOnResultId: saved.id }), /does not exist/);
});

test("manuscript figure staging rejects symlink destinations and project mixing without changing external files", async t => {
  const f = fixture(t), png = Buffer.from("89504e470d0a1a0a", "hex");
  const saved = await f.bridge.saveProjectResult({ ...f.input, files: [{ name: "plot.png", role: "output", encoding: "base64", content: png.toString("base64") }] });
  fs.mkdirSync(path.join(f.execution, "paper")); fs.writeFileSync(path.join(f.execution, "paper/main.tex"), "Original\n");
  const outside = path.join(f.root, "external-data"); fs.mkdirSync(outside); fs.symlinkSync(outside, path.join(f.execution, "paper/figures"), "dir");
  const target = { projectId: f.project.id, workspaceId: f.workspace.id, threadId: null, workspace: f.execution, mainPath: "paper/main.tex" };
  await assert.rejects(f.bridge.stageProjectResultFigure({ resultId: saved.id, fileName: "plot.png", target }), /symbolic link/);
  assert.deepEqual(fs.readdirSync(outside), []);
  const otherProject = f.owner.createResearchProject({ name: "Other project", workspacePath: f.next });
  await assert.rejects(f.bridge.stageProjectResultFigure({ resultId: saved.id, fileName: "plot.png", target: { ...target, projectId: otherProject.id, workspaceId: f.owner.defaultProjectWorkspace(otherProject.id).id, workspace: f.next } }), /same project/);
});
