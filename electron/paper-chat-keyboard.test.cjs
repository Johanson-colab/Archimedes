const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

test("Enter submits, Shift+Enter and IME composition do not", async () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "src", "paperChatKeyboard.ts"), "utf8");
  const { transformWithOxc } = await import("vite");
  const { code } = await transformWithOxc(source.replace("export function", "function"), "paperChatKeyboard.ts");
  const shouldSubmit = new Function(`${code}\nreturn shouldSubmitPaperChatKey;`)();
  const event = { key: "Enter", shiftKey: false, nativeEvent: { isComposing: false, keyCode: 13 } };
  assert.equal(shouldSubmit(event), true);
  assert.equal(shouldSubmit({ ...event, shiftKey: true }), false);
  assert.equal(shouldSubmit({ ...event, key: "a" }), false);
  assert.equal(shouldSubmit({ ...event, nativeEvent: { isComposing: true, keyCode: 13 } }), false);
  assert.equal(shouldSubmit({ ...event, nativeEvent: { isComposing: false, keyCode: 229 } }), false);
});
