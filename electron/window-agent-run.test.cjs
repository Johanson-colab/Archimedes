const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const { test } = require("node:test");
test("native execution is canceled on owning window destruction without sending to closed contents", async () => {
  const { runWindowAgent } = require("./window-agent-run.cjs");
  const sender = new EventEmitter();
  let destroyed = false;
  let sent = 0;
  sender.isDestroyed = () => destroyed;
  sender.send = () => { assert.equal(destroyed, false); sent++; };
  await runWindowAgent({ sender, native: true, run: async ({ externalSignal, emit }) => {
    assert.equal(externalSignal.aborted, false);
    emit({ type: "status" });
    destroyed = true; sender.emit("destroyed");
    assert.equal(externalSignal.aborted, true);
    emit({ type: "native_activity" });
  } });
  assert.equal(sent, 1);
  assert.equal(sender.listenerCount("destroyed"), 0);
});
test("normal completion, rejection and already closed windows cannot retain lifecycle listeners", async () => {
  const { runWindowAgent } = require("./window-agent-run.cjs");
  const sender = new EventEmitter(); sender.isDestroyed = () => false; sender.send = () => {};
  await assert.rejects(runWindowAgent({ sender, native: true, run: async () => { throw new Error("failed"); } }), /failed/);
  assert.equal(sender.listenerCount("destroyed"), 0);
  let runs = 0;
  sender.isDestroyed = () => true;
  await assert.rejects(runWindowAgent({ sender, native: true, run: async () => { runs++; } }), /closed/);
  assert.equal(runs, 0);
});

test("API execution is canceled when its owning window closes", async () => {
  const { runWindowAgent } = require("./window-agent-run.cjs");
  const sender = new EventEmitter();
  sender.isDestroyed = () => false;
  sender.send = () => {};
  await runWindowAgent({ sender, native: false, run: async ({ externalSignal }) => {
    assert.equal(externalSignal.aborted, false);
    sender.emit("destroyed");
    assert.equal(externalSignal.aborted, true);
  } });
  assert.equal(sender.listenerCount("destroyed"), 0);
});
