const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { checkoutBranchOf, checkoutDirectory, readRepositoryCheckoutFile, listRepositoryCheckoutDirectory } = require("./repository-checkout.cjs");

const URL = "https://github.com/A-EVO-Lab/a-evolve";

function workspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-branch-"));
}

function makeCheckout(root, files) {
  fs.mkdirSync(path.join(root, ".git"), { recursive: true });
  for (const [relative, content] of Object.entries(files)) {
    const target = path.join(root, relative);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, content);
  }
}

test("two branches of one repository are two checkouts", () => {
  const root = workspace();
  try {
    const main = checkoutDirectory(root, URL, "");
    const release = checkoutDirectory(root, URL, "release/evo-harness");
    assert.notEqual(main.root, release.root, "the branch is part of the directory identity");
    assert.equal(release.target.repo, "a-evolve");
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("a reader with the branch reads that branch and nothing else", async () => {
  const root = workspace();
  try {
    const main = checkoutDirectory(root, URL, "");
    const release = checkoutDirectory(root, URL, "release/evo-harness");
    makeCheckout(main.root, { "examples/run.sh": "from main" });
    makeCheckout(release.root, { "evo_harness/cl_bench.py": "from release" });

    const fromRelease = await readRepositoryCheckoutFile(root, URL, "evo_harness/cl_bench.py", "release/evo-harness");
    assert.equal(fromRelease.content, "from release");

    // The same path read without the branch lands in the default checkout, where
    // that file does not exist - the failure mode this threads the branch to fix.
    const fromMain = await readRepositoryCheckoutFile(root, URL, "examples/run.sh");
    assert.equal(fromMain.content, "from main");
    await assert.rejects(readRepositoryCheckoutFile(root, URL, "examples/run.sh", "release/evo-harness"), /ENOENT/);

    const listing = await listRepositoryCheckoutDirectory(root, URL, "", "release/evo-harness");
    assert.deepEqual(listing.entries.map((entry) => entry.name), ["evo_harness"]);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("an attachment without a branch means the default checkout", () => {
  assert.equal(checkoutBranchOf({ checkout: { requested_branch: "" } }), "");
  assert.equal(checkoutBranchOf({ checkout: { requested_branch: "release/evo-harness" } }), "release/evo-harness");
  assert.equal(checkoutBranchOf({ checkout: null }), "");
  assert.equal(checkoutBranchOf(null), "");
});
