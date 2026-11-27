const fs = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const { spawnSync } = require("node:child_process");
const test = require("node:test");
const assert = require("node:assert/strict");
const { createResearchAppRuntime, readApp } = require("./research-app-runtime.cjs");

function certify(workspace, id = 'sample-app') {
  const app = readApp(workspace, id), records = require('./research-app-delivery-store.cjs');
  // Unit fixture isolates the runtime consent/lifecycle contract; full acceptance is tested in Chromium separately.
  records.markVerified(app, { scope: 'host-http-and-browser', checks: [{ path: '/', passed: true }], browser: { passed: true, checks: [{ action: 'expect', passed: true }] } }, records.identity(app));
}
function fixture(t, { kind = "static", source, approve = async () => true, ...options } = {}) {
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-managed-app-")));
  const directory = path.join(workspace, "research-apps", "sample-app");
  fs.mkdirSync(path.join(directory, "public"), { recursive: true });
  const manifest = { schemaVersion: 1, id: "sample-app", name: "Sample App", version: "0.1.0", category: "analysis", runtime: { kind, entry: kind === "static" ? "public/index.html" : "app.py" } };
  fs.writeFileSync(path.join(directory, "research-app.json"), JSON.stringify(manifest));
  fs.writeFileSync(path.join(directory, manifest.runtime.entry), source || "<h1>Sample research app</h1>");
  if (kind === "static") certify(workspace);
  const runtime = createResearchAppRuntime({ approve, startupTimeoutMs: 1500, healthIntervalMs: 10000, ...options });
  t.after(async () => { await runtime.shutdown(); fs.rmSync(workspace, { recursive: true, force: true }); });
  return { workspace, directory, runtime, manifest };
}

test("a workspace draft previews, installs, pins, reopens and stops without a native turn", async (t) => {
  let approvals = 0;
  const f = fixture(t, { approve: async () => { approvals++; return true; } });
  assert.equal(f.runtime.list(f.workspace)[0].installed, false);
  const running = await f.runtime.start(f.workspace, "sample-app");
  assert.equal(running.status, "running");
  assert.match(await (await fetch(running.url)).text(), /Sample research app/);
  assert.equal((await f.runtime.start(f.workspace, "sample-app")).url, running.url);
  const installed = await f.runtime.install(f.workspace, "sample-app");
  assert.equal(installed[0].pinned, true);
  assert.equal(installed[0].installed, true);
  await f.runtime.stop(f.workspace, "sample-app");
  await assert.rejects(fetch(running.url));
  const reopened = createResearchAppRuntime({ approve: async () => { throw new Error("Unchanged installed App should retain approval"); } });
  t.after(() => reopened.shutdown());
  assert.equal(reopened.list(f.workspace)[0].pinned, true);
  assert.equal(reopened.status(f.workspace, "sample-app").status, "stopped");
  const restarted = await reopened.start(f.workspace, "sample-app");
  assert.equal(restarted.status, "running");
  await reopened.remove(f.workspace, "sample-app");
  assert.ok(fs.existsSync(path.join(f.directory, "public/index.html")));
  assert.equal(reopened.list(f.workspace)[0].installed, false);
  assert.equal(approvals, 2);
});

test("static assets exclude hidden files, source outside public and path traversal", async (t) => {
  const f = fixture(t);
  fs.writeFileSync(path.join(f.directory, "private.json"), '{"secret":"not-public"}');
  fs.writeFileSync(path.join(f.directory, "public/.env"), "not-public");
  const running = await f.runtime.start(f.workspace, "sample-app");
  for (const resource of ["/.env", "/private.json", "/%2e%2e%2fprivate.json", "/research-app.json"]) assert.equal((await fetch(new URL(resource, running.url))).status, 404);
  assert.equal((await fetch(running.url, { method: "POST" })).status, 405);
  assert.match((await fetch(running.url)).headers.get("content-security-policy"), /object-src 'none'/);
});

test("declining approval does not install or start an App", async (t) => {
  const f = fixture(t, { approve: async () => false });
  assert.equal((await f.runtime.start(f.workspace, "sample-app")).status, "failed");
  assert.equal(f.runtime.status(f.workspace, "sample-app").url, null);
  await assert.rejects(f.runtime.install(f.workspace, "sample-app"), /not approved/);
  assert.equal(f.runtime.list(f.workspace)[0].installed, false);
});

test("changed installed source requires new approval; workspaces keep separate installations", async (t) => {
  let allowed = true, approvals = 0;
  const f = fixture(t, { approve: async () => { approvals++; return allowed; } });
  const other = fixture(t);
  await f.runtime.install(f.workspace, "sample-app");
  assert.equal(f.runtime.list(other.workspace)[0].installed, false);
  fs.writeFileSync(path.join(f.directory, "public/index.html"), "Changed source");
  allowed = false;
  assert.equal((await f.runtime.start(f.workspace, "sample-app")).status, "failed");
  assert.match(f.runtime.status(f.workspace, "sample-app").error, /Validate this App version/);
  assert.equal(approvals, 1);
  certify(f.workspace);
  assert.equal((await f.runtime.start(f.workspace, "sample-app")).status, "failed");
  assert.equal(approvals, 2);
});

test("invalid manifests and linked source cannot escape the app directory", async (t) => {
  const f = fixture(t);
  const manifest = path.join(f.directory, "research-app.json");
  for (const entry of ["../outside.py", "/tmp/entry.py", ".venv/script.py"]) {
    fs.writeFileSync(manifest, JSON.stringify({ ...f.manifest, runtime: { kind: "python-http", entry } }));
    assert.throws(() => readApp(f.workspace, "sample-app"));
  }
  fs.writeFileSync(manifest, JSON.stringify(f.manifest));
  fs.symlinkSync(path.join(f.directory, "public/index.html"), path.join(f.directory, "public/linked.html"));
  assert.equal((await f.runtime.start(f.workspace, "sample-app")).status, "failed");
});

test("missing Python dependencies report a recoverable failure instead of a dead URL", async (t) => {
  const f = fixture(t, { kind: "python-http", source: "print('not started')" });
  await assert.rejects(f.runtime.install(f.workspace, 'sample-app'), /Set up this App's Python environment/);
  const result = await f.runtime.start(f.workspace, "sample-app");
  assert.equal(result.status, "failed");
  assert.equal(result.url, null);
  assert.match(result.error, /Python environment is missing/);
  assert.equal((await f.runtime.stop(f.workspace, 'sample-app')).error, '');
});

const python = spawnSync("python3", ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" });
test("stopping during approval cancels startup without creating a service", async (t) => {
  let release;
  const f = fixture(t, { approve: () => new Promise((resolve) => { release = resolve; }) });
  const pending = f.runtime.start(f.workspace, "sample-app");
  await new Promise(setImmediate);
  assert.equal(f.runtime.status(f.workspace, "sample-app").status, "starting");
  await f.runtime.stop(f.workspace, "sample-app");
  release(true);
  assert.equal((await pending).status, "stopped");
  assert.equal(f.runtime.status(f.workspace, "sample-app").url, null);
});

test("source changed while approval is open is not installed", async (t) => {
  let directory;
  const f = fixture(t, { approve: async () => { fs.writeFileSync(path.join(directory, "public/index.html"), "changed during review"); return true; } });
  directory = f.directory;
  await assert.rejects(f.runtime.install(f.workspace, "sample-app"), /changed during approval/);
  assert.equal(f.runtime.list(f.workspace)[0].installed, false);
});

test("a cancelled approval cannot stop a newer runtime", async (t) => {
  let release, approvals = 0;
  const f = fixture(t, { approve: () => ++approvals === 1 ? new Promise((resolve) => { release = resolve; }) : Promise.resolve(true) });
  const pending = f.runtime.start(f.workspace, "sample-app");
  await new Promise(setImmediate);
  await f.runtime.stop(f.workspace, "sample-app");
  const replacement = await f.runtime.start(f.workspace, "sample-app");
  assert.equal(replacement.status, "running");
  release(true);
  assert.equal((await pending).status, "stopped");
  assert.equal(f.runtime.status(f.workspace, "sample-app").url, replacement.url);
  assert.equal((await fetch(replacement.url)).status, 200);
});

test("Python service belongs to the host, uses assigned port/readiness identity and excludes credentials", { skip: python.status !== 0 || process.platform === "win32" }, async (t) => {
  const source = `import os, json\nfrom http.server import BaseHTTPRequestHandler, HTTPServer\nclass Handler(BaseHTTPRequestHandler):\n def do_GET(self):\n  self.send_response(200)\n  self.send_header('X-Archimedes-App-Token',os.environ['ARCHIMEDES_APP_TOKEN'])\n  self.end_headers()\n  self.wfile.write(json.dumps({'credentialPresent':'ARCHIMEDES_TEST_SECRET' in os.environ}).encode())\n def log_message(self,*args): pass\nHTTPServer(('127.0.0.1',int(os.environ['PORT'])),Handler).serve_forever()\n`;
  const f = fixture(t, { kind: "python-http", source });
  fs.mkdirSync(path.join(f.directory, ".venv/bin"), { recursive: true });
  fs.symlinkSync(python.stdout.trim(), path.join(f.directory, ".venv/bin/python"));
  const previous = process.env.ARCHIMEDES_TEST_SECRET;
  process.env.ARCHIMEDES_TEST_SECRET = "test-value-never-injected";
  t.after(() => { if (previous === undefined) delete process.env.ARCHIMEDES_TEST_SECRET; else process.env.ARCHIMEDES_TEST_SECRET = previous; });
  const running = await f.runtime.start(f.workspace, "sample-app");
  assert.equal(running.status, "running", running.error);
  assert.deepEqual(await (await fetch(running.url)).json(), { credentialPresent: false });
  await f.runtime.stop(f.workspace, "sample-app");
  await assert.rejects(fetch(running.url));
});

test("declared keys require approval and reach only the App process; logs do not expose them", { skip: python.status !== 0 || process.platform === "win32" }, async (t) => {
  const source = `import os\nfrom http.server import BaseHTTPRequestHandler, HTTPServer\nclass H(BaseHTTPRequestHandler):\n def do_GET(self):\n  self.send_response(200); self.send_header('X-Archimedes-App-Token',os.environ['ARCHIMEDES_APP_TOKEN']); self.end_headers(); self.wfile.write(str('EXAMPLE_API_KEY' in os.environ).encode())\n def log_message(self,*args): pass\nprint(os.environ['EXAMPLE_API_KEY'],flush=True)\nHTTPServer(('127.0.0.1',int(os.environ['PORT'])),H).serve_forever()\n`;
  let approvals = 0;
  const f = fixture(t, { kind: 'python-http', source, readSecret: name => name === 'EXAMPLE_API_KEY' ? 'secret-value-for-test' : '', approve: async ({ app }) => { approvals++; assert.deepEqual(app.environment, ['EXAMPLE_API_KEY']); return true; } });
  fs.writeFileSync(path.join(f.directory, 'research-app.json'), JSON.stringify({ ...f.manifest, environment: ['EXAMPLE_API_KEY'] }));
  fs.mkdirSync(path.join(f.directory, '.venv/bin'), { recursive: true }); fs.symlinkSync(python.stdout.trim(), path.join(f.directory, '.venv/bin/python'));
  const run = await f.runtime.start(f.workspace, 'sample-app');
  assert.equal(run.status, 'running', run.error); assert.equal(await (await fetch(run.url)).text(), 'True');
  assert.doesNotMatch(f.runtime.status(f.workspace, 'sample-app').logs, /secret-value-for-test/); assert.equal(approvals, 1);
});

test('missing declared key reports its name without starting Python', { skip: python.status !== 0 || process.platform === 'win32' }, async t => {
  const f = fixture(t, { kind: 'python-http', source: 'raise SystemExit("must not run")', readSecret: () => '' });
  fs.writeFileSync(path.join(f.directory, 'research-app.json'), JSON.stringify({ ...f.manifest, environment: ['EXAMPLE_API_KEY'] }));
  fs.mkdirSync(path.join(f.directory, '.venv/bin'), { recursive: true }); fs.symlinkSync(python.stdout.trim(), path.join(f.directory, '.venv/bin/python'));
  const result = await f.runtime.start(f.workspace, 'sample-app');
  assert.equal(result.status, 'failed'); assert.match(result.error, /EXAMPLE_API_KEY/); assert.doesNotMatch(result.logs, /must not run/);
});
