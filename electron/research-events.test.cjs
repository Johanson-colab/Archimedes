const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

async function load() {
  const { transformWithOxc } = await import("vite");
  const filename = path.join(__dirname, "../src/research-events.ts");
  const source = fs.readFileSync(filename, "utf8").replace(/^export /gm, "");
  const { code } = await transformWithOxc(source, filename);
  return new Function(`${code}\nreturn { sameResearchEventList };`)();
}

const event = (id, sequence, createdAt = `2026-11-27T00:00:0${sequence}.000Z`) => ({
  id, turn_id: "turn", sequence, type: "status", payload: {}, created_at: createdAt,
});

test("unchanged poll results keep the existing trajectory array", async () => {
  const { sameResearchEventList } = await load();
  const current = [event("a", 0), event("b", 1)];
  assert.equal(sameResearchEventList(current, [event("a", 0), event("b", 1)]), true);
  assert.equal(sameResearchEventList(current, current), true);
});

test("appended or replaced event tails are detected", async () => {
  const { sameResearchEventList } = await load();
  const current = [event("a", 0)];
  assert.equal(sameResearchEventList(current, [event("a", 0), event("b", 1)]), false);
  assert.equal(sameResearchEventList(current, [event("a", 2)]), false);
  assert.equal(sameResearchEventList([], [event("a", 0)]), false);
  assert.equal(sameResearchEventList([], []), true);
});
