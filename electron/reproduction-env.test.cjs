const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const envStore = require("./reproduction/env-store.cjs");

// Stand-in for the OS keychain codec: enough to prove values are not stored as
// plain text, without needing Electron in a Node test.
const codec = {
  encrypt: (value) => `enc:${Buffer.from(value, "utf8").toString("base64")}`,
  decrypt: (value) => (String(value).startsWith("enc:") ? Buffer.from(String(value).slice(4), "base64").toString("utf8") : ""),
};

const scope = { workspace: "/fixture/a", ownerId: "researcher", id: "repro-1" };

function freshStore(t) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "repro-env-"));
  envStore.initialize(directory, codec);
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }));
  return { directory, file: path.join(directory, "reproduction-env.json") };
}

test("values round-trip and are not written in clear text", t => {
  const { file } = freshStore(t);
  envStore.setValue(scope, "HF_TOKEN", "hf_secret_value");
  envStore.setValue(scope, "WANDB_API_KEY", "wandb_secret");
  assert.deepEqual(envStore.list(scope), [
    { name: "HF_TOKEN", hasValue: true },
    { name: "WANDB_API_KEY", hasValue: true },
  ]);
  assert.deepEqual(envStore.values(scope), { HF_TOKEN: "hf_secret_value", WANDB_API_KEY: "wandb_secret" });
  const raw = fs.readFileSync(file, "utf8");
  assert.equal(raw.includes("hf_secret_value"), false);
  assert.equal(raw.includes("wandb_secret"), false);
});

test("removing one variable leaves the others alone", t => {
  freshStore(t);
  envStore.setValue(scope, "A_KEY", "a");
  envStore.setValue(scope, "B_KEY", "b");
  assert.deepEqual(envStore.removeValue(scope, "A_KEY"), [{ name: "B_KEY", hasValue: true }]);
  assert.deepEqual(envStore.values(scope), { B_KEY: "b" });
});

test("an empty value clears the variable", t => {
  freshStore(t);
  envStore.setValue(scope, "HF_TOKEN", "x");
  assert.deepEqual(envStore.setValue(scope, "HF_TOKEN", ""), []);
  assert.deepEqual(envStore.values(scope), {});
});

test("names are normalised and invalid ones are refused", t => {
  freshStore(t);
  envStore.setValue(scope, "hf_token", "x");
  assert.deepEqual(envStore.list(scope).map((entry) => entry.name), ["HF_TOKEN"]);
  assert.throws(() => envStore.setValue(scope, "not a name", "x"), /must look like/);
  assert.throws(() => envStore.setValue(scope, "9LIVES", "x"), /must look like/);
});

test("one reproduction cannot read another's values", t => {
  freshStore(t);
  envStore.setValue(scope, "HF_TOKEN", "one");
  envStore.setValue({ ...scope, id: "repro-2" }, "HF_TOKEN", "two");
  assert.deepEqual(envStore.values(scope), { HF_TOKEN: "one" });
  assert.deepEqual(envStore.values({ ...scope, id: "repro-2" }), { HF_TOKEN: "two" });
});

test("the file is private to the user", { skip: process.platform === "win32" }, t => {
  const { file } = freshStore(t);
  envStore.setValue(scope, "HF_TOKEN", "x");
  const mode = fs.statSync(file).mode & 0o777;
  assert.equal(mode, 0o600);
});


test("copied records and different owners get separate values without claiming legacy ciphertext", t => {
  const { file, directory } = freshStore(t);
  const originalCiphertext = codec.encrypt("synthetic-legacy");
  fs.writeFileSync(file, JSON.stringify({ [scope.id]: { HF_TOKEN: originalCiphertext } }));
  const copy = { ...scope, workspace: "/fixture/b" };
  const viewer = { ...scope, ownerId: "viewer" };
  assert.deepEqual(envStore.values(scope), {});
  assert.deepEqual(envStore.values(copy), {});
  envStore.setValue(scope, "HF_TOKEN", "synthetic-a");
  envStore.setValue(copy, "HF_TOKEN", "synthetic-b");
  envStore.initialize(directory, codec);
  assert.deepEqual(envStore.values(scope), { HF_TOKEN: "synthetic-a" });
  assert.deepEqual(envStore.values(copy), { HF_TOKEN: "synthetic-b" });
  assert.deepEqual(envStore.values(viewer), {});
  envStore.removeValue(copy, "HF_TOKEN");
  assert.deepEqual(envStore.values(scope), { HF_TOKEN: "synthetic-a" });
  assert.equal(JSON.parse(fs.readFileSync(file, "utf8"))[scope.id].HF_TOKEN, originalCiphertext);
});
