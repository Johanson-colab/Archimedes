const assert = require("node:assert/strict");
const test = require("node:test");
const { moveSidebarId, moveSidebarOrder, orderSidebarIds, readSidebarOrder, reconcileSidebarOrder, writeSidebarOrder, SIDEBAR_ORDER_STORAGE_KEY } = require("../src/sidebar-order.ts");

test("saved IDs sort available entries while preserving unseen new entries", () => {
  assert.deepEqual(orderSidebarIds([{ id: "a" }, { id: "b" }, { id: "c" }], ["c", "stale", "a"]).map((item) => item.id), ["c", "a", "b"]);
});

test("drag moves before or after target without duplicating entries", () => {
  assert.deepEqual(moveSidebarId(["a", "b", "c"], "a", "c", true), ["b", "c", "a"]);
  assert.deepEqual(moveSidebarId(["a", "b", "c"], "c", "a", false), ["c", "a", "b"]);
  assert.deepEqual(moveSidebarId(["a", "b"], "missing", "b"), ["a", "b"]);
  assert.deepEqual(moveSidebarId(["a", "b"], "a", "a"), ["a", "b"]);
});

test("workspaces reorder per parent without changing the other lists", () => {
  const start = { version: 1, apps: ["x"], projects: ["p", "q"], archivedProjects: [], workspaces: { p: ["a", "b"], q: ["c", "d"] } };
  assert.deepEqual(moveSidebarOrder(start, "workspaces", "b", "a", false, "p").workspaces, { p: ["b", "a"], q: ["c", "d"] });
  assert.equal(moveSidebarOrder(start, "workspaces", "c", "a", false, "p"), start);
});

test("stale order IDs are pruned and storage handles invalid JSON/failures", () => {
  const value = { version: 1, apps: ["gone", "a"], projects: ["p", "gone"], archivedProjects: ["old"], workspaces: { p: ["b", "gone"], removed: ["z"] } };
  assert.deepEqual(reconcileSidebarOrder(value, { apps: ["a", "b"], projects: ["p", "q"], archivedProjects: [], workspaces: { p: ["a", "b"], q: ["c"] } }), { version: 1, apps: ["a", "b"], projects: ["p", "q"], archivedProjects: [], workspaces: { p: ["b", "a"], q: ["c"] } });
  assert.deepEqual(readSidebarOrder({ getItem: () => "{" }), { version: 1, apps: [], projects: [], archivedProjects: [], workspaces: {} });
  const storage = { value: "", setItem(key, value) { assert.equal(key, SIDEBAR_ORDER_STORAGE_KEY); this.value = value; }, getItem() { return this.value; } };
  writeSidebarOrder(value, storage);
  assert.deepEqual(readSidebarOrder(storage), value);
});
