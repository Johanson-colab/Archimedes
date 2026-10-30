const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const { getRepositoryCheckout, listRepositoryCheckoutDirectory, readRepositoryCheckoutFile, resolveRepositoryCodeReference, searchRepositoryCheckout } = require("./repository-checkout.cjs");

function checkoutRoot(workspace, url) {
  const suffix = createHash("sha256").update(url).digest("hex").slice(0, 10);
  return path.join(workspace, ".archimedes", "code-audits", `owner--repo--${suffix}`);
}

test("inspects only files inside a cloned code audit checkout", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-audit-"));
  const url = "https://github.com/owner/repo";
  const root = checkoutRoot(workspace, url);
  fs.mkdirSync(path.join(root, "src"), { recursive: true });
  fs.writeFileSync(path.join(root, "src", "runner.py"), "def run_method(config):\n    return config['method']\n");
  fs.writeFileSync(path.join(root, "README.md"), "# Audit fixture\n");
  execFileSync("git", ["init", "-q", root]);
  execFileSync("git", ["-C", root, "config", "user.email", "test@example.com"]);
  execFileSync("git", ["-C", root, "config", "user.name", "Test"]);
  execFileSync("git", ["-C", root, "add", "."]);
  execFileSync("git", ["-C", root, "commit", "-qm", "fixture"]);

  try {
    const checkout = await getRepositoryCheckout(workspace, url);
    assert.equal(checkout?.file_count, 2);
    const listing = await listRepositoryCheckoutDirectory(workspace, url);
    assert.deepEqual(listing.entries.map((entry) => entry.name), ["src", "README.md"]);
    const file = await readRepositoryCheckoutFile(workspace, url, "src/runner.py");
    assert.equal(file.line_count, 3);
    const matches = await searchRepositoryCheckout(workspace, url, "run_method");
    assert.deepEqual(matches.matches.map((match) => `${match.path}:${match.line}`), ["src/runner.py:1"]);
    await assert.rejects(() => readRepositoryCheckoutFile(workspace, url, "../outside.txt"));
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});

test("resolves exact and unique code references, but never guesses ambiguous paths", async () => {
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-reference-"));
  const url = "https://github.com/owner/repo";
  const root = checkoutRoot(workspace, url);
  fs.mkdirSync(path.join(root, "inference", "models", "qwen"), { recursive: true });
  fs.mkdirSync(path.join(root, "other", "qwen"), { recursive: true });
  fs.writeFileSync(path.join(root, "inference", "models", "qwen", "model.py"), "first\nsecond\n");
  fs.writeFileSync(path.join(root, "other", "qwen", "model.py"), "other\n");
  fs.writeFileSync(path.join(root, "inference", "models", "qwen", "layer.py"), "layer\n");
  fs.writeFileSync(path.join(workspace, "outside.py"), "outside\n");
  fs.symlinkSync(path.join(workspace, "outside.py"), path.join(root, "inference", "models", "qwen", "escape.py"));
  execFileSync("git", ["init", "-q", root]);
  try {
    assert.deepEqual(await resolveRepositoryCodeReference(workspace, url, "qwen/layer.py"), { status: "unique", paths: ["inference/models/qwen/layer.py"] });
    assert.deepEqual(await resolveRepositoryCodeReference(workspace, url, "qwen/model.py"), { status: "ambiguous", paths: ["inference/models/qwen/model.py", "other/qwen/model.py"] });
    assert.deepEqual(await resolveRepositoryCodeReference(workspace, url, "other/qwen/model.py"), { status: "exact", paths: ["other/qwen/model.py"] });
    assert.deepEqual(await resolveRepositoryCodeReference(workspace, url, "missing/model.py"), { status: "missing", paths: [] });
    assert.deepEqual(await resolveRepositoryCodeReference(workspace, url, "qwen/escape.py"), { status: "missing", paths: [] });
    await assert.rejects(() => resolveRepositoryCodeReference(workspace, url, "inference/models/qwen/escape.py"), /outside the checkout/);
    await assert.rejects(() => resolveRepositoryCodeReference(workspace, url, "../outside.py"));
  } finally {
    fs.rmSync(workspace, { recursive: true, force: true });
  }
});
