const assert = require("node:assert/strict");
const test = require("node:test");
const { installQuitGuard } = require("./active-runs.cjs");

function harness({ response = 0 } = {}) {
  const listeners = new Map();
  const state = { restored: 0, quits: 0 };
  const app = {
    on(name, listener) { listeners.set(name, listener); },
    quit() { state.quits += 1; },
  };
  installQuitGuard({
    app,
    dialog: { showMessageBox: async () => ({ response }) },
    hasWork: () => true,
    stopWork: async () => {},
    restoreWindow: () => { state.restored += 1; },
  });
  const fire = (name) => {
    const event = { prevented: false, preventDefault() { this.prevented = true; } };
    listeners.get(name)(event);
    return event;
  };
  return { state, fire };
}

test("declining the quit prompt restores a window instead of leaving a windowless process", async () => {
  const { state, fire } = harness({ response: 0 });
  fire("before-quit");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(state.restored, 1);
  assert.equal(state.quits, 0);
});

test("accepting the quit prompt stops without restoring a window", async () => {
  const { state, fire } = harness({ response: 1 });
  fire("before-quit");
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.equal(state.restored, 0);
  assert.equal(state.quits, 1);
});
