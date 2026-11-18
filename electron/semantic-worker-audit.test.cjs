const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const asar = require("@electron/asar");
const { prepareAudit } = require("../scripts/prepare-semantic-worker-audit.cjs");

test("prepares Windows-style archive entries and refuses stale staging files", async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-audit-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const source = path.join(root, "source");
  const assets = path.join(source, "dist", "assets");
  fs.mkdirSync(assets, { recursive: true });
  for (const name of ["semantic-worker-a.js", "ort-wasm.jsep-a.wasm", "ort-wasm.jsep-a.mjs"]) {
    fs.writeFileSync(path.join(assets, name), "");
  }
  const archive = path.join(root, "fixture.asar");
  await asar.createPackage(source, archive);
  const entries = asar.listPackage(archive).map(name => name.replaceAll("/", "\\"));
  t.mock.method(asar, "listPackage", () => entries);
  const args = { sourceArchive: archive, out: path.join(root, "audit") };
  assert.equal((await prepareAudit(args)).worker, "semantic-worker-a.js");
  await assert.rejects(prepareAudit(args), { code: "EEXIST" });
  entries.push("\\node_modules\\onnxruntime-node\\package.json");
  await assert.rejects(prepareAudit({ ...args, out: path.join(root, "second") }), /still includes onnxruntime-node/);
});
