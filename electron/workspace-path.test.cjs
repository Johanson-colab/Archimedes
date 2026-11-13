const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

let isWorkspacePath;
let workspacePathName;
test.before(async () => {
  const { transformWithOxc } = await import("vite");
  const file = path.join(__dirname, "../src/workspace-path.ts");
  const source = fs.readFileSync(file, "utf8").replaceAll("export function", "function");
  const { code } = await transformWithOxc(source, file);
  ({ isWorkspacePath, workspacePathName } = new Function(`${code}\nreturn { isWorkspacePath, workspacePathName };`)());
});

test("workspace skills accept Windows separators and path casing", () => {
  for (const target of ["C:\\Research\\Agent\\.agents\\skills\\demo", "c:/research/agent/.agents/skills/demo", "C:\\Research/Agent\\.agents/skills/demo"]) {
    assert.equal(isWorkspacePath("C:\\Research\\Agent\\", target), true, target);
  }
  assert.equal(isWorkspacePath("C:/Research/Agent", "C:\\Research\\Agent"), true);
});

test("workspace classification respects directory and drive boundaries", () => {
  for (const target of ["C:\\Research\\Agent-old\\skill", "D:\\Research\\Agent\\skill", "C:\\Research\\Global\\skill", "C:\\Research\\Agent\\..\\Global\\skill"]) {
    assert.equal(isWorkspacePath("C:\\Research\\Agent", target), false, target);
  }
  assert.equal(isWorkspacePath("C:\\", "c:/Research/Agent"), true);
  assert.equal(isWorkspacePath("C:\\Research\\Agent", "C:/Research/Agent/./.agents/../skills/demo"), true);
});

test("UNC paths preserve the server and share boundary", () => {
  assert.equal(isWorkspacePath("\\\\server\\share\\Agent", "//SERVER/SHARE/agent/.agents/skills/demo"), true);
  assert.equal(isWorkspacePath("\\\\server\\share", "\\\\server\\share\\demo"), true);
  assert.equal(isWorkspacePath("\\\\server\\share", "//server/other/demo"), false);
  assert.equal(isWorkspacePath("\\\\server\\share", "//other/share/demo"), false);
  assert.equal(isWorkspacePath("\\\\server\\share", "//server/share/../other/demo"), false);
});

test("extended Windows paths compare to their ordinary spelling", () => {
  assert.equal(isWorkspacePath("\\\\?\\C:\\Research\\Agent", "c:/Research/Agent/skills/demo"), true);
  assert.equal(isWorkspacePath("C:\\Research\\Agent", "\\\\?\\C:\\Research\\Agent\\skills\\demo"), true);
  assert.equal(isWorkspacePath("\\\\?\\UNC\\server\\share\\Agent", "//server/share/Agent/demo"), true);
});

test("POSIX paths retain case sensitivity and literal backslashes", () => {
  assert.equal(isWorkspacePath("/home/user/Agent", "/home/user/Agent/.agents/demo"), true);
  assert.equal(isWorkspacePath("/home/user/Agent", "/home/user/agent/.agents/demo"), false);
  assert.equal(isWorkspacePath("/home/user/Agent", "/home/user/Agent-old/demo"), false);
  assert.equal(isWorkspacePath("/home/user/Agent", "/home/user/Agent\\demo"), false);
  assert.equal(isWorkspacePath("/", "/home/user/Agent"), true);
});

test("relative, empty, malformed and above-root paths are not workspace paths", () => {
  for (const target of ["", "skills/demo", "C:skills/demo", "C:/../skills/demo", "\\\\.\\pipe\\demo", "C:/Agent/\u0000demo", "C:/Agent/\ndemo"]) {
    assert.equal(isWorkspacePath("C:/Agent", target), false, JSON.stringify(target));
  }
  assert.equal(isWorkspacePath("", "C:/Agent/demo"), false);
  assert.equal(isWorkspacePath("Agent", "Agent/demo"), false);
});

test("workspace labels use the final directory without altering its case or Unicode", () => {
  for (const workspace of ["C:\\Research\\视觉 Agent", "c:/Research/视觉 Agent/", "\\\\server\\share\\视觉 Agent\\", "\\\\?\\C:\\Research\\视觉 Agent", "/home/user/视觉 Agent/"]) {
    assert.equal(workspacePathName(workspace), "视觉 Agent");
  }
  assert.equal(workspacePathName("/home/user/Literal\\Name"), "Literal\\Name");
});

test("root labels and empty-workspace fallbacks remain meaningful", () => {
  assert.equal(workspacePathName("C:\\"), "C:\\");
  assert.equal(workspacePathName("/"), "/");
  assert.equal(workspacePathName("\\\\server\\share\\"), "share");
  assert.equal(workspacePathName("", "No workspace"), "No workspace");
  assert.equal(workspacePathName(""), "Workspace");
});
