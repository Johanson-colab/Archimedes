const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const identity = require("./local-identity.cjs");

test("local identity persists a stable user and device across launches", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-identity-"));
  try {
    const first = identity.initialize(directory);
    assert.match(first.userId, /^usr_/);
    assert.match(first.deviceId, /^dev_/);
    assert.ok(first.displayName);
    assert.ok(first.deviceName);
    assert.ok(fs.existsSync(identity.identityFile()));
    const second = identity.initialize(directory);
    assert.equal(second.userId, first.userId);
    assert.equal(second.deviceId, first.deviceId);
    assert.equal(second.displayName, first.displayName);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("display name updates are trimmed, validated, and persisted", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-identity-update-"));
  try {
    const first = identity.initialize(directory);
    const updated = identity.updateLocalIdentity({ displayName: "  Alice   Researcher  " });
    assert.equal(updated.displayName, "Alice Researcher");
    assert.equal(updated.userId, first.userId);
    const reloaded = identity.initialize(directory);
    assert.equal(reloaded.displayName, "Alice Researcher");
    assert.throws(() => identity.updateLocalIdentity({ displayName: "   " }), /display name/i);
    assert.throws(() => identity.updateLocalIdentity({ displayName: "x".repeat(81) }), /80/);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test("a corrupt identity file is backed up and replaced", () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-identity-corrupt-"));
  try {
    identity.initialize(directory);
    fs.writeFileSync(identity.identityFile(), "{ definitely not json", "utf8");
    const recovered = identity.initialize(directory);
    assert.match(recovered.userId, /^usr_/);
    const files = fs.readdirSync(directory);
    assert.ok(files.some((name) => name.startsWith("identity.json.corrupt-")));
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
