const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("LAN host launcher binds explicitly and prints reachable URLs", () => {
  const launcher = read("server/index-lan.cjs");
  const pkg = JSON.parse(read("package.json"));
  const docs = read("docs/collaboration/lan.md");
  assert.match(launcher, /HOST \|\| "0\.0\.0\.0"/);
  assert.match(launcher, /networkInterfaces/);
  assert.match(launcher, /createCollabServer/);
  assert.equal(pkg.scripts["server:lan"], "node server/index-lan.cjs");
  assert.match(docs, /host-authoritative/);
  assert.match(docs, /DEV_AUTH=false/);
});

test("governance documents export, audit, and open enterprise gaps", () => {
  const docs = read("docs/collaboration/governance.md");
  assert.match(docs, /Admin\/owner project export/);
  assert.match(docs, /SHA-256/);
  assert.match(docs, /SSO\/SAML\/SCIM/);
  assert.match(docs, /Retention/);
});
