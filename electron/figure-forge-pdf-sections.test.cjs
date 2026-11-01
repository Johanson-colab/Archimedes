const test = require("node:test");
const assert = require("node:assert/strict");

test("paper extraction prefers relevant pages and retains page labels within the budget", async () => {
  const { selectRelevantPdfPages } = await import("../src/figureforge/pdf-sections.mjs");
  const text = selectRelevantPdfPages(["[Page 1] general background", "[Page 2] architecture pipeline method input output"], "", 48);
  assert.ok(text.startsWith("[Page 2]"));
  assert.ok(text.length <= 48);
});
