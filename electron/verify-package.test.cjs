const assert = require("node:assert/strict");
const test = require("node:test");
const { verify } = require("../scripts/verify-package.cjs");

for (const [platform, separator] of [["POSIX", "/"], ["Windows", "\\"]]) {
  test(`verify packed production dependencies with ${platform} ASAR entries`, () => {
    const archive = "test-app.asar";
    const parents = ["node_modules", "jsdom"];
    const child = ["node_modules", "tough-cookie", "package.json"].join(separator);
    const parent = [...parents, "package.json"].join(separator);
    const manifest = new Map([
      ["package.json", { version: "0.1.0", dependencies: { jsdom: "^29.0.0" } }],
      [parent, { version: "29.1.1", dependencies: { "tough-cookie": "^6.0.0" } }],
      [child, { version: "6.0.0" }],
    ]);
    const reads = [];
    const asar = {
      listPackage(file) {
        assert.equal(file, archive);
        return [...manifest.keys()].map(name => separator + name);
      },
      extractFile(file, name) {
        assert.equal(file, archive);
        reads.push(name);
        assert.ok(manifest.has(name), `unexpected ${platform} ASAR read: ${name}`);
        return Buffer.from(JSON.stringify(manifest.get(name)));
      },
    };

    assert.equal(verify(archive, { asar, separator }).checked, 2);
    assert.deepEqual(reads.splice(0), ["package.json", parent, child]);
    manifest.delete(child);
    assert.throws(() => verify(archive, { asar, separator }), /tough-cookie \(required by jsdom@29\.1\.1\)/);
    assert.deepEqual(reads, ["package.json", parent]);
  });
}
