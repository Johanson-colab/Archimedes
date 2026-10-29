const assert = require("node:assert/strict");
const test = require("node:test");

const { planChapterMerges } = require("../src/journeyMergePlan.ts");

test("does not merge when chapters already fit", () => {
  assert.deepEqual(planChapterMerges(10, 10), { keepFrom: 10, batches: [] });
  assert.deepEqual(planChapterMerges(0, 10), { keepFrom: 0, batches: [] });
});

test("splits early chapters into several batches and keeps the recent ones", () => {
  const plan = planChapterMerges(110, 10);
  assert.equal(plan.batches.length, 5);
  assert.equal(plan.keepFrom, 105);
  assert.deepEqual(plan.batches[0], { start: 0, end: 21 });
  assert.deepEqual(plan.batches.at(-1), { start: 84, end: 105 });
  assert.equal(plan.batches.length + (110 - plan.keepFrom), 10);
});

test("never exceeds the chapter limit and covers every chunk exactly once", () => {
  for (const count of [11, 12, 20, 41, 110, 250]) {
    for (const limit of [2, 3, 5, 10]) {
      const plan = planChapterMerges(count, limit);
      const visible = plan.batches.length + (count - plan.keepFrom);
      assert.ok(visible <= Math.max(1, limit), `${count}/${limit} produced ${visible} chapters`);
      let cursor = 0;
      for (const batch of plan.batches) {
        assert.equal(batch.start, cursor);
        assert.ok(batch.end > batch.start);
        cursor = batch.end;
      }
      assert.equal(cursor, plan.keepFrom);
    }
  }
});

test("a single visible chapter folds everything into one batch", () => {
  const plan = planChapterMerges(20, 1);
  assert.deepEqual(plan.batches, [{ start: 0, end: 20 }]);
  assert.equal(plan.keepFrom, 20);
});
