const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const React = require("react");
const { createRoot } = require("react-dom/client");
const { JSDOM } = require("jsdom");

const filename = path.join(__dirname, "..", "src", "useQueuedPromptDelivery.ts");
const hookReady = import("vite").then(async ({ transformWithOxc }) => {
  const { code } = await transformWithOxc(fs.readFileSync(filename, "utf8"), filename);
  const executable = code.replace(/import \{([^}]+)\} from "react";/, "const {$1} = React;").replace("export function", "function");
  return new Function("React", `${executable}\nreturn useQueuedPromptDelivery;`)(React);
});

const first = { id: "first", draft: "Read my paper", contextItems: [{ id: "paper", path: "中文/paper.pdf" }] };
const second = { id: "second", draft: "Compare its experiments", contextItems: [{ id: "code", path: "code/main.py" }] };
const deferred = () => {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
};

async function fixture(submit, items = [first, second]) {
  const useQueuedPromptDelivery = await hookReady;
  const dom = new JSDOM("<div id='root'></div>");
  global.window = dom.window;
  global.document = dom.window.document;
  global.IS_REACT_ACT_ENVIRONMENT = true;
  const root = createRoot(document.getElementById("root"));
  let state;
  let failures = 0;
  function Harness() {
    const [queue, setQueue] = React.useState(items);
    const [busy, setBusy] = React.useState(true);
    const [draft, setDraft] = React.useState("New unfinished draft");
    const [attachments] = React.useState([{ id: "new", path: "new.txt" }]);
    const delivery = useQueuedPromptDelivery({ items: queue, setItems: setQueue, busy, submit, onFailure: () => { failures += 1; } });
    state = { queue, setQueue, busy, setBusy, draft, setDraft, attachments, ...delivery };
    return React.createElement("textarea", { value: draft, onChange: () => {} });
  }
  await React.act(async () => root.render(React.createElement(React.StrictMode, null, React.createElement(Harness))));
  return {
    get state() { return state; },
    get failures() { return failures; },
    async idle() { await React.act(async () => state.setBusy(false)); },
    async close() { await React.act(async () => root.unmount()); dom.window.close(); delete global.window; delete global.document; delete global.IS_REACT_ACT_ENVIRONMENT; },
  };
}

test("failed delivery keeps payloads, later messages and a new draft; retry drains in order", async () => {
  const requests = [];
  const pending = deferred();
  const f = await fixture((item) => {
    requests.push(item);
    return requests.length === 1 ? pending.promise : Promise.resolve(true);
  });
  try {
    assert.equal(requests.length, 0, "do not send while busy");
    await f.idle();
    assert.deepEqual(f.state.queue, [first, second], "do not discard a pending request");
    await React.act(async () => {
      f.state.setDraft("Another new draft while sending");
      pending.resolve(false);
    });
    assert.deepEqual(requests, [first], "failure must not start later messages or automatically retry");
    assert.equal(f.state.failedId, first.id);
    assert.deepEqual(f.state.queue, [first, second]);
    assert.equal(f.state.draft, "Another new draft while sending");
    assert.deepEqual(f.state.attachments, [{ id: "new", path: "new.txt" }]);
    assert.equal(f.failures, 1);
    await React.act(async () => { f.state.retry(); f.state.retry(); });
    assert.deepEqual(requests, [first, first, second], "double-click retry must only send once");
    assert.deepEqual(requests[1].contextItems, first.contextItems);
    assert.deepEqual(f.state.queue, []);
    assert.equal(f.state.failedId, null);
    assert.equal(f.state.draft, "Another new draft while sending");
  } finally { await f.close(); }
});

test("a rejected request pauses and removing it resumes the remaining queue", async () => {
  const requests = [];
  const f = await fixture(async (item) => {
    requests.push(item.id);
    if (item.id === first.id) throw new Error("Connection lost");
    return true;
  });
  try {
    await f.idle();
    assert.equal(f.state.failedId, first.id);
    assert.deepEqual(requests, [first.id]);
    await React.act(async () => f.state.setQueue((queue) => queue.filter((item) => item.id !== first.id)));
    assert.deepEqual(requests, [first.id, second.id]);
    assert.deepEqual(f.state.queue, []);
  } finally { await f.close(); }
});

test("busy transitions during delivery do not duplicate it or skip the next follow-up", async () => {
  const pending = deferred();
  const requests = [];
  const f = await fixture((item) => {
    requests.push(item.id);
    return item.id === first.id ? pending.promise : Promise.resolve(true);
  });
  try {
    await f.idle();
    await React.act(async () => f.state.setBusy(true));
    await f.idle();
    assert.deepEqual(requests, [first.id]);
    await React.act(async () => pending.resolve(true));
    assert.deepEqual(requests, [first.id, second.id]);
    assert.deepEqual(f.state.queue, []);
  } finally { await f.close(); }
});

test("clearing the queue during an in-flight failure does not resurrect removed messages", async () => {
  const pending = deferred();
  const f = await fixture(() => pending.promise);
  try {
    await f.idle();
    await React.act(async () => f.state.setQueue([]));
    await React.act(async () => pending.resolve(false));
    assert.deepEqual(f.state.queue, []);
    assert.equal(f.state.failedId, null);
    assert.equal(f.failures, 0);
  } finally { await f.close(); }
});

test("retry stays paused during another active turn and repeated failures stay recoverable", async () => {
  let calls = 0;
  const f = await fixture(async () => { calls += 1; return false; });
  try {
    await f.idle();
    await React.act(async () => f.state.setBusy(true));
    await React.act(async () => f.state.retry());
    assert.equal(calls, 1);
    await f.idle();
    assert.equal(calls, 1, "finishing a different turn must not bypass the paused failure");
    await React.act(async () => f.state.retry());
    assert.equal(calls, 2);
    assert.equal(f.state.failedId, first.id);
    assert.deepEqual(f.state.queue, [first, second]);
  } finally { await f.close(); }
});

test("a late completion after unmount does not update or report failure to another conversation", async () => {
  const pending = deferred();
  const f = await fixture(() => pending.promise);
  await f.idle();
  await f.close();
  pending.resolve(false);
  await pending.promise;
  assert.equal(f.failures, 0);
});
