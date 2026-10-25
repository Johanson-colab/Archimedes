const assert = require("node:assert/strict");
const test = require("node:test");
const { runPaperReview } = require("./paper-review-orchestrator.cjs");

test("returns reviewer-specific failures instead of discarding an all-failed review", async () => {
  let active = 0;
  let peak = 0;
  const events = [];
  const result = await runPaperReview({
    paper: { id: "paper-1", title: "A paper" },
    pageCount: 12,
    workspace: process.cwd(),
    contextItems: [],
    emit: (event) => events.push(event),
    runAgentImpl: async ({ prompt }) => {
      assert.match(prompt, /read_attached_paper_pdf with attachment_id "paper:paper-1"/);
      active += 1;
      peak = Math.max(peak, active);
      await new Promise((resolve) => setTimeout(resolve, 8));
      active -= 1;
      return { status: "failed", response: "Model request failed (429): too many concurrent requests" };
    },
  });

  assert.equal(peak, 2);
  assert.equal(result.specialists.length, 4);
  assert(result.specialists.every((specialist) => specialist.status === "error"));
  assert.match(result.summary.error, /429/);
  assert(events.some((event) => event.stage === "specialist_failed"));
  assert(events.some((event) => event.stage === "failed"));
});
