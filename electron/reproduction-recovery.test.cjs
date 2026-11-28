const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { DatabaseSync } = require("node:sqlite");
const store = require("./store.cjs");

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-recovery-"));
}

test("a run left running by a killed app is reconciled on the next open", () => {
  const root = workspace();
  const other = workspace();
  try {
    store.openWorkspace(root);
    const reproduction = store.createReproduction({ title: "Evo-Harness" });
    const run = store.createReproductionRun({ reproductionId: reproduction.id });
    store.updateReproduction(reproduction.id, { status: "provisioning" });

    store.openWorkspace(other);
    store.openWorkspace(root);
    assert.equal(store.getReproduction(reproduction.id).status, "provisioning");

    const { execFileSync } = require("node:child_process");
    const recovered = execFileSync(process.execPath, ["-e", `
      const store = require("./store.cjs");
      store.openWorkspace(process.argv[1]);
      console.log(JSON.stringify([store.getReproduction(process.argv[2]), store.getReproductionRun(process.argv[3])]));
    `, root, reproduction.id, run.id], { cwd: __dirname, encoding: "utf8" });
    const [after, afterRun] = JSON.parse(recovered);
    assert.equal(after.status, "blocked");
    assert.match(after.error, /app stopped while this was running/i);
    assert.equal(afterRun.status, "interrupted");
  } finally {
    store.openWorkspace(other);
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(other, { recursive: true, force: true });
  }
});

test("a verified reproduction is left alone", () => {
  const root = workspace();
  try {
    store.openWorkspace(root);
    const reproduction = store.createReproduction({ title: "Done" });
    store.updateReproduction(reproduction.id, { status: "checks-passed" });
    store.openWorkspace(root);
    assert.equal(store.getReproduction(reproduction.id).status, "checks-passed");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("reopening reports a remote run that may still be active and leaves an unowned PID alone", () => {
  const root = workspace();
  const { execFileSync } = require("node:child_process");
  try {
    const ids = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", `
      import store from "./store.cjs";
      import graph from "./research-graph/service.cjs";
      store.openWorkspace(process.argv[1]);
      const repro = store.createReproduction({ title: "Remote fixture" });
      const attempt = store.createReproductionRun({ reproductionId: repro.id, backend: "SSH · fixture.invalid" });
      store.updateReproduction(repro.id, { status: "running" });
      const project = store.createResearchProject({ name: "PID fixture" });
      const thread = store.createResearchThread({ projectId: project.id, prompt: "Synthetic experiment", mode: "research" });
      const common = { projectId: project.id, threadId: thread.id, content: {} };
      const question = graph.createNode({ ...common, kind: "question", title: "Question" });
      const idea = graph.createNode({ ...common, kind: "idea", title: "Idea", parents: [{ nodeId: question.id }] });
      const node = graph.createNode({ ...common, kind: "experiment", title: "Experiment", parents: [{ nodeId: idea.id }] });
      const run = await store.createExperimentRun({ ...common, nodeId: node.id, status: "starting", backend: "local", command: "fixture", cwd: process.argv[1] });
      store.updateExperimentRun({ runId: run.id, status: "running", pid: Number(process.argv[2]) });
      console.log(JSON.stringify({ repro: repro.id, attempt: attempt.id, run: run.id }));
    `, root, String(process.pid)], { cwd: __dirname, encoding: "utf8" }));
    store.openWorkspace(root);
    assert.equal(store.getReproduction(ids.repro).status, "blocked");
    assert.match(store.getReproduction(ids.repro).error, /Remote process status is unconfirmed/);
    assert.equal(store.getReproductionRun(ids.attempt).status, "interrupted");
    const run = store.getExperimentRun(ids.run);
    assert.equal(run.status, "running");
    assert.equal(run.pid, process.pid);
    assert.match(run.error, /Verify its identity/);
    store.openWorkspace(root);
    assert.deepEqual(store.getExperimentRun(ids.run), run);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test("a fresh process recovers interrupted turns, pending approvals and commands without rewriting completed output", () => {
  const { spawnSync } = require("node:child_process"), path = require("node:path");
  const root = workspace();
  const englishNotice = "The app closed while this turn was running. You can continue in this chat. Check any partial changes before continuing.";
  try {
    const child = spawnSync(process.execPath, ["-e", `
      const store = require(${JSON.stringify(path.join(__dirname, "store.cjs"))});
      store.openWorkspace(process.argv[1]);
      function turn(prompt) {
        const thread = store.createResearchThread({prompt, mode:'free-chat'});
        const task = store.startTask({prompt});
        const turn = store.startResearchTurn({threadId:thread.id, taskId:task.id, prompt, mode:'free-chat'});
        return {thread,task,turn};
      }
      const orphan = turn('orphan');
      const persisted = turn('finished task only');
      const sameText = turn(process.argv[2]);
      store.finishTask(persisted.task.id,{response:'Durable completed output',status:'completed'});
      store.finishTask(sameText.task.id,{response:process.argv[2],status:'completed'});
      const action=store.createAction({taskId:orphan.task.id,kind:'command',payload:{command:'never executed'}});
      const command=store.startCommand({command:'old command',cwd:process.argv[1]});
      process.stdout.write(JSON.stringify({orphan:orphan.thread.id,persisted:persisted.thread.id,sameText:sameText.thread.id,action:action.id,command:command.id}));
    `, root, englishNotice], { encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr);
    const ids = JSON.parse(child.stdout);
    store.openWorkspace(root);
    const owner = store;
    const orphan = owner.getResearchThread(ids.orphan);
    assert.equal(orphan.status, "idle");
    assert.equal(orphan.turns[0].status, "interrupted");
    assert.equal(orphan.events.at(-1).type, "run_recovered");
    assert.equal(orphan.events.at(-1).payload.generated_notice, true);
    assert.equal(orphan.messages.at(-1).recoveryNotice, true);
    assert.equal(orphan.messages.at(-1).text, englishNotice);
    assert.equal(owner.getAction(ids.action).status, "rejected");
    assert.equal(owner.getSnapshot().commands.find(command => command.id === ids.command).status, "interrupted");
    const persisted = owner.getResearchThread(ids.persisted);
    assert.equal(persisted.turns[0].status, "completed");
    assert.equal(persisted.turns[0].assistant_message, "Durable completed output");
    const answers = persisted.events.filter(event => event.type === "assistant_message");
    assert.equal(answers.length, 1);
    assert.equal(answers[0].payload.text, "Durable completed output");
    assert.equal(persisted.messages.at(-1).recoveryNotice, undefined);
    store.openWorkspace(root);
    assert.equal(store.getResearchThread(ids.orphan).events.filter(event => event.type === "run_recovered").length, 1);
    const sameText = owner.getResearchThread(ids.sameText);
    assert.deepEqual(sameText.messages.map(({ text, recoveryNotice }) => [text, recoveryNotice]), [
      [englishNotice, undefined], [englishNotice, undefined],
    ], "genuine user and model text with identical wording is not marked as a notice");
    const db = new DatabaseSync(path.join(root, ".archimedes", "archimedes.db"));
    try {
      db.prepare("UPDATE research_events SET payload_json = json_remove(payload_json, '$.generated_notice') WHERE thread_id = ? AND type = 'run_recovered'").run(ids.orphan);
    } finally { db.close(); }
    const legacy = owner.getResearchThread(ids.orphan);
    assert.equal(legacy.events.at(-1).payload.generated_notice, undefined);
    assert.equal(legacy.messages.at(-1).recoveryNotice, true, "a previously saved recovery row is recognized");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("switching data folders preserves a live turn and its pending approval", t => {
  const root = workspace(), other = workspace();
  t.after(() => { fs.rmSync(root, { recursive: true, force: true }); fs.rmSync(other, { recursive: true, force: true }); });
  store.openWorkspace(root);
  const thread = store.createResearchThread({ prompt: "live", mode: "free-chat" });
  const task = store.startTask({ prompt: "live" });
  store.startResearchTurn({ threadId: thread.id, taskId: task.id, prompt: "live", mode: "free-chat" });
  const action = store.createAction({ taskId: task.id, kind: "command", payload: { command: "sample" } });
  store.openWorkspace(other);
  store.openWorkspace(root);
  assert.equal(store.getResearchThread(thread.id).turns[0].status, "running");
  assert.equal(store.getAction(action.id).status, "pending");
});

test("conversation surfaces translate only marked recovery notices", async () => {
  const React = require("react");
  const { renderToStaticMarkup } = require("react-dom/server");
  const { transformWithOxc } = await import("vite");
  const directory = path.join(__dirname, "../src");
  const translations = fs.readFileSync(path.join(directory, "i18n/translations/conversation.ts"), "utf8").replace("export const", "const");
  const { code: translationCode } = await transformWithOxc(translations, "conversation.ts");
  const chinese = new Function(`${translationCode}\nreturn conversation;`)();
  const englishNotice = "The app closed while this turn was running. You can continue in this chat. Check any partial changes before continuing.";
  assert.equal(chinese[englishNotice], "这一轮运行时应用已关闭。你可以在此对话中继续。继续前请检查是否有只完成了一部分的修改。");
  let language = "zh";
  const text = ({ content, text, children }) => React.createElement("p", null, content || text || children);
  const bindings = {
    React, memo: React.memo,
    useUISettings: () => ({ t: key => language === "zh" ? chinese[key] ?? key : key }),
    MarkdownMessage: text, StreamingMarkdownMessage: text, PaperChatMarkdown: text, ReactMarkdown: text, remarkGfm: () => {},
  };
  for (const [file, name] of [["App.tsx", "ConversationMessage"], ["SideConversation.tsx", "SideMessage"], ["LibraryView.tsx", "PaperChatMessageRow"]]) {
    const source = fs.readFileSync(path.join(directory, file), "utf8");
    const start = source.indexOf(`const ${name} = memo(`);
    const end = source.indexOf("\n});", start) + 4;
    assert.ok(start >= 0 && end > start, name);
    const { code } = await transformWithOxc(source.slice(start, end), file, { jsx: { runtime: "classic" } });
    const Component = new Function(...Object.keys(bindings), `${code}\nreturn ${name};`)(...Object.values(bindings));
    const render = (role, recoveryNotice) => renderToStaticMarkup(React.createElement(Component, {
      message: { id: "message", role, text: englishNotice, recoveryNotice },
    }));
    language = "zh";
    assert.ok(render("assistant", true).includes(chinese[englishNotice]), name);
    assert.ok(render("assistant", false).includes(englishNotice), name);
    assert.ok(render("user", false).includes(englishNotice), name);
    language = "en";
    assert.ok(render("assistant", true).includes(englishNotice), name);
  }
});
