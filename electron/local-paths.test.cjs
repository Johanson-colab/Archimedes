const assert = require("node:assert/strict");
const test = require("node:test");
const { expandHomePath } = require("./local-paths.cjs");

test("Windows home expansion supports both separators and a Unicode user profile", () => {
  const options = { platform: "win32", home: "C:\\Users\\测试 User" };
  for (const input of ["~/.ssh/id_ed25519", "~\\.ssh\\id_ed25519"]) {
    assert.equal(expandHomePath(input, options), "C:\\Users\\测试 User\\.ssh\\id_ed25519");
  }
  assert.equal(expandHomePath("~", options), options.home);
});

test("Windows home expansion supports network profiles", () => {
  assert.equal(expandHomePath("~/.ssh/id_ed25519", { platform: "win32", home: "\\\\server\\profiles\\user" }), "\\\\server\\profiles\\user\\.ssh\\id_ed25519");
});

test("POSIX home expansion keeps POSIX path semantics", () => {
  const options = { platform: "darwin", home: "/Users/test user" };
  assert.equal(expandHomePath("~/.ssh/id_ed25519", options), "/Users/test user/.ssh/id_ed25519");
  assert.equal(expandHomePath("~", options), options.home);
  assert.throws(() => expandHomePath("~\\.ssh\\key", options), /not supported/);
});

test("explicit paths pass through without shell evaluation", () => {
  for (const input of ["C:\\Keys\\id_ed25519", "\\\\server\\keys\\key", "/keys/id_ed25519", "$HOME/.ssh/key", "C:\\Keys\\$(whoami)", ""]) {
    assert.equal(expandHomePath(input), input);
  }
});

test("unsupported named homes and missing home directories fail explicitly", () => {
  for (const platform of ["win32", "linux"]) {
    assert.throws(() => expandHomePath("~other/.ssh/key", { platform, home: platform === "win32" ? "C:\\Users\\me" : "/home/me" }), /~user paths are not supported/);
    assert.throws(() => expandHomePath("~/.ssh/key", { platform, home: "" }), /could not be determined/);
    assert.throws(() => expandHomePath("~/.ssh/key", { platform, home: "relative" }), /could not be determined/);
  }
});
