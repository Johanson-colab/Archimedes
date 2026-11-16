const assert = require("node:assert/strict");
const test = require("node:test");
const { toolchainError } = require("../scripts/check-toolchain.cjs");

test("declared toolchains accept compatible LTS and reject runtimes missing required TypeScript support", () => {
  assert.equal(toolchainError("22.18.0", "10.9.0"), "");
  assert.equal(toolchainError("24.22.3", "11.20.0"), "");
  assert.equal(toolchainError("26.13.0", "11.20.0"), "");
  assert.match(toolchainError("20.19.0", "11.20.0"), /Node/);
  assert.match(toolchainError("22.13.0", "11.20.0"), /Node/);
  assert.match(toolchainError("26.13.0", "9.0.0"), /npm/);
});
