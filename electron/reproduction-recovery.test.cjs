const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
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

    // Reopening is what the app does after a restart.
    store.openWorkspace(other);
    store.openWorkspace(root);

    const after = store.getReproduction(reproduction.id);
    assert.equal(after.status, "blocked");
    assert.match(after.error, /app stopped while this was running/i);
    assert.equal(store.getReproductionRun(run.id).status, "interrupted");
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

test("a fresh process recovers interrupted turns, pending approvals and commands without rewriting completed output", () => {
  const { spawnSync } = require("node:child_process"), path = require("node:path");
  const root = workspace();
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
      store.finishTask(persisted.task.id,{response:'Durable completed output',status:'completed'});
      const action=store.createAction({taskId:orphan.task.id,kind:'command',payload:{command:'never executed'}});
      const command=store.startCommand({command:'old command',cwd:process.argv[1]});
      process.stdout.write(JSON.stringify({orphan:orphan.thread.id,persisted:persisted.thread.id,action:action.id,command:command.id}));
    `, root], { encoding: "utf8" });
    assert.equal(child.status, 0, child.stderr);
    const ids = JSON.parse(child.stdout);
    store.openWorkspace(root);
    const owner = store;
    const orphan = owner.getResearchThread(ids.orphan);
    assert.equal(orphan.status, "idle");
    assert.equal(orphan.turns[0].status, "interrupted");
    assert.equal(orphan.events.at(-1).type, "run_recovered");
    assert.equal(owner.getAction(ids.action).status, "rejected");
    assert.equal(owner.getSnapshot().commands.find(command => command.id === ids.command).status, "interrupted");
    const persisted = owner.getResearchThread(ids.persisted);
    assert.equal(persisted.turns[0].status, "completed");
    assert.equal(persisted.turns[0].assistant_message, "Durable completed output");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
