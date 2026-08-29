const assert = require("node:assert/strict");
const test = require("node:test");
const { fetchWithRetry, normalizeDailyOptions } = require("./literature.cjs");

test("retries a timed-out literature request", async () => {
  let attempts = 0;
  const response = await fetchWithRetry("https://example.test", {}, {
    attempts: 2,
    timeoutMs: 50,
    retryDelayMs: 0,
    provider: "Test provider",
    fetchImpl: async () => {
      attempts += 1;
      if (attempts === 1) throw new DOMException("The operation timed out", "TimeoutError");
      return { ok: true, status: 200 };
    },
  });

  assert.equal(attempts, 2);
  assert.equal(response.status, 200);
});

test("bounds daily discovery options", () => {
  const options = normalizeDailyOptions({
    mode: "latest",
    range: "7d",
    categories: ["cs.AI", "invalid", "cs.AI"],
    query: "agent memory",
    limit: 5_000,
  });
  assert.deepEqual(options.categories, ["cs.AI"]);
  assert.equal(options.limit, 100);
  assert.equal(options.query, "agent memory");
});
