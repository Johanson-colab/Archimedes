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

function freshStore() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "repro-env-"));
  envStore.initialize(directory, codec);
  return { directory, file: path.join(directory, "reproduction-env.json") };
}

test("values round-trip and are not written in clear text", () => {
  const { file } = freshStore();
  envStore.setValue("repro-1", "HF_TOKEN", "hf_secret_value");
  envStore.setValue("repro-1", "WANDB_API_KEY", "wandb_secret");
  assert.deepEqual(envStore.list("repro-1"), [
    { name: "HF_TOKEN", hasValue: true },
    { name: "WANDB_API_KEY", hasValue: true },
  ]);
  assert.deepEqual(envStore.values("repro-1"), { HF_TOKEN: "hf_secret_value", WANDB_API_KEY: "wandb_secret" });
  const raw = fs.readFileSync(file, "utf8");
  assert.equal(raw.includes("hf_secret_value"), false);
  assert.equal(raw.includes("wandb_secret"), false);
});

test("removing one variable leaves the others alone", () => {
  freshStore();
  envStore.setValue("repro-1", "A_KEY", "a");
  envStore.setValue("repro-1", "B_KEY", "b");
  assert.deepEqual(envStore.removeValue("repro-1", "A_KEY"), [{ name: "B_KEY", hasValue: true }]);
  assert.deepEqual(envStore.values("repro-1"), { B_KEY: "b" });
});

test("an empty value clears the variable", () => {
  freshStore();
  envStore.setValue("repro-1", "HF_TOKEN", "x");
  assert.deepEqual(envStore.setValue("repro-1", "HF_TOKEN", ""), []);
  assert.deepEqual(envStore.values("repro-1"), {});
});

test("names are normalised and invalid ones are refused", () => {
  freshStore();
  envStore.setValue("repro-1", "hf_token", "x");
  assert.deepEqual(envStore.list("repro-1").map((entry) => entry.name), ["HF_TOKEN"]);
  assert.throws(() => envStore.setValue("repro-1", "not a name", "x"), /must look like/);
  assert.throws(() => envStore.setValue("repro-1", "9LIVES", "x"), /must look like/);
});

test("one reproduction cannot read another's values", () => {
  freshStore();
  envStore.setValue("repro-1", "HF_TOKEN", "one");
  envStore.setValue("repro-2", "HF_TOKEN", "two");
  assert.deepEqual(envStore.values("repro-1"), { HF_TOKEN: "one" });
  assert.deepEqual(envStore.values("repro-2"), { HF_TOKEN: "two" });
});

test("the file is private to the user", { skip: process.platform === "win32" }, () => {
  const { file } = freshStore();
  envStore.setValue("repro-1", "HF_TOKEN", "x");
  const mode = fs.statSync(file).mode & 0o777;
  assert.equal(mode, 0o600);
});
