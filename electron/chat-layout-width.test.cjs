const assert = require("node:assert/strict");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const test = require("node:test");

test("wide chat content cannot push history and composer out of the viewport", { skip: process.platform === "linux" && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY ? "Electron layout check needs a display; run under xvfb-run" : false }, () => {
  const output = execFileSync(require("electron"), [path.join(__dirname, "../scripts/check-chat-width.cjs")], {
    encoding: "utf8", timeout: 20_000, maxBuffer: 64_000, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, ELECTRON_DISABLE_SECURITY_WARNINGS: "true" },
  });
  const results = JSON.parse(output.trim().split("\n").at(-1));
  assert.equal(results.length, 4);
  for (const result of results) {
    assert.equal(result.passed, true, `${result.theme}, width ${result.width}`);
    assert.ok(result.inputRight <= result.viewport);
  }
});
