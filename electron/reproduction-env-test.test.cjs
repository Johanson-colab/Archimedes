const assert = require("node:assert/strict");
const test = require("node:test");

const { describeHuggingFaceWhoami, testHuggingFaceToken } = require("./reproduction/env-test.cjs");

function response({ ok = true, status = 200, json }) {
  return { ok, status, json: async () => json };
}

test("whoami identifies the token by its display name", () => {
  const result = describeHuggingFaceWhoami({
    name: "jackson",
    auth: {
      accessToken: {
        displayName: "RSI",
        role: "fineGrained",
        permissions: [{ type: "repo", name: "x", allowed: true }, { type: "repo", name: "y", allowed: true }],
      },
    },
  });
  assert.equal(result.ok, true);
  assert.equal(result.token, "RSI");
  assert.equal(result.role, "fineGrained");
  assert.equal(result.user, "jackson");
  assert.equal(result.permissions, 2);
});

test("a 401 says the token was rejected, not that the network failed", async () => {
  const result = await testHuggingFaceToken("bad", { fetchImpl: async () => response({ ok: false, status: 401 }) });
  assert.equal(result.ok, false);
  assert.equal(result.status, 401);
  assert.match(result.detail, /rejected this token/);
});

test("a network failure is reported as unreachable", async () => {
  const result = await testHuggingFaceToken("x", { fetchImpl: async () => { throw new Error("ENOTFOUND"); } });
  assert.equal(result.ok, false);
  assert.match(result.detail, /Could not reach/);
});

test("an empty saved value is refused before any request", async () => {
  let called = false;
  const result = await testHuggingFaceToken("", { fetchImpl: async () => { called = true; } });
  assert.equal(result.ok, false);
  assert.equal(called, false);
  assert.match(result.detail, /No value/);
});

test("the token is sent as a bearer header", async () => {
  let seen = "";
  await testHuggingFaceToken("hf_secret", {
    fetchImpl: async (_url, init) => { seen = init.headers.Authorization; return response({ json: { name: "u" } }); },
  });
  assert.equal(seen, "Bearer hf_secret");
});
