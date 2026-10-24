const assert = require("node:assert/strict");
const test = require("node:test");
const api = import("../src/pdf-table-regions.ts");

test("uses the caption-adjacent rule group, not a page header or following prose", async () => {
  const { findRuledTableRect } = await api;
  const caption = { left: 109, top: 82, width: 395, height: 32 };
  const rect = findRuledTableRect(caption, [
    { left: 109, right: 504, y: 39 }, // page header rule
    { left: 110, right: 502, y: 131 }, { left: 110, right: 502, y: 146 },
    { left: 110, right: 502, y: 237 }, { left: 110, right: 502, y: 274 },
  ], 612, 792);
  assert.deepEqual(rect, { left: 105, top: 126, width: 402, height: 153 });
});

test("handles captions below a table and does not include the caption", async () => {
  const { findRuledTableRect } = await api;
  const caption = { left: 100, top: 400, width: 350, height: 14 };
  const rect = findRuledTableRect(caption, [
    { left: 102, right: 500, y: 198 }, { left: 102, right: 500, y: 260 }, { left: 102, right: 500, y: 376 },
    { left: 40, right: 540, y: 690 },
  ], 612, 792);
  assert.equal(rect.top, 193);
  assert.equal(rect.top + rect.height, 381);
});

test("falls back to a compact cluster of repeated table cells for borderless tables", async () => {
  const { findTextTableRect } = await api;
  const caption = { left: 80, top: 60, width: 420, height: 18 };
  const fragments = [
    { left: 80, top: 92, width: 60, height: 10, text: "Method" }, { left: 170, top: 92, width: 60, height: 10, text: "Score" }, { left: 300, top: 92, width: 60, height: 10, text: "Cost" }, { left: 410, top: 92, width: 60, height: 10, text: "Total" },
    { left: 80, top: 108, width: 60, height: 10, text: "A" }, { left: 170, top: 108, width: 60, height: 10, text: "92" }, { left: 300, top: 108, width: 60, height: 10, text: "3" }, { left: 410, top: 108, width: 60, height: 10, text: "95" },
    { left: 80, top: 124, width: 60, height: 10, text: "B" }, { left: 170, top: 124, width: 60, height: 10, text: "89" }, { left: 300, top: 124, width: 60, height: 10, text: "2" }, { left: 410, top: 124, width: 60, height: 10, text: "91" },
    { left: 80, top: 160, width: 350, height: 10, text: "Following prose must stay out." },
  ];
  const rect = findTextTableRect(caption, fragments, 612, 792);
  assert(rect && rect.top < 90 && rect.top + rect.height < 145);
});

test("does not treat grid lines from an adjacent-column chart as a table", async () => {
  const { findRuledTableRect } = await api;
  const caption = { left: 65, top: 90, width: 220, height: 28 };
  const rect = findRuledTableRect(caption, [
    { left: 340, right: 560, y: 150 },
    { left: 340, right: 560, y: 190 },
    { left: 340, right: 560, y: 230 },
  ], 612, 792);
  assert.equal(rect, null);
});
