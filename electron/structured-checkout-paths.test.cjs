const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const test = require("node:test");
const { createDockerBackend } = require("./reproduction/docker.cjs");
const { createSshBackend } = require("./reproduction/remote.cjs");

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-backend-boundary-")));
  const checkout = path.join(root, "checkout"), outside = path.join(root, "outside");
  fs.mkdirSync(checkout); fs.mkdirSync(outside);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, checkout, outside };
}

async function waitFor(check, message, timeoutMs = 6_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (check()) return;
    await new Promise(resolve => setTimeout(resolve, 25));
  }
  throw new Error(message);
}

test("reproduction run passes its abort signal into Docker preparation", () => {
  const source = fs.readFileSync(path.join(__dirname, "main.cjs"), "utf8");
  const start = source.indexOf("const backend = createDockerBackend(");
  assert.ok(start >= 0, "Docker reproduction wiring was not found");
  assert.match(source.slice(start, start + 1_200), /await backend\.prepare\(\{\s*signal: controller\.signal\s*\}\)/);
});

test("cancelling Docker preparation kills docker run and still removes a possible container", { skip: process.platform === "win32" ? "POSIX fake docker fixture" : false, timeout: 15_000 }, async t => {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-docker-cancel-")));
  const checkout = path.join(root, "checkout"), bin = path.join(root, "bin");
  const trace = path.join(root, "trace.log"), ready = path.join(root, "ready");
  fs.mkdirSync(checkout); fs.mkdirSync(bin);
  fs.writeFileSync(path.join(bin, "docker"), [
    "#!/bin/sh",
    'case "$1" in',
    '  info) echo 24.0 ;;',
    '  run) echo run >> "$ARCHIMEDES_DOCKER_TRACE"; : > "$ARCHIMEDES_DOCKER_READY"; exec sleep 8 ;;',
    '  rm) echo "rm $2 $3" >> "$ARCHIMEDES_DOCKER_TRACE" ;;',
    "esac",
    "exit 0",
  ].join("\n"), { mode: 0o755 });

  const originalPath = process.env.PATH;
  const originalTrace = process.env.ARCHIMEDES_DOCKER_TRACE;
  const originalReady = process.env.ARCHIMEDES_DOCKER_READY;
  process.env.PATH = `${bin}${path.delimiter}${originalPath || ""}`;
  process.env.ARCHIMEDES_DOCKER_TRACE = trace;
  process.env.ARCHIMEDES_DOCKER_READY = ready;

  const controller = new AbortController();
  let preparing;
  t.after(async () => {
    controller.abort();
    if (preparing) await preparing.catch(() => {});
    process.env.PATH = originalPath;
    if (originalTrace === undefined) delete process.env.ARCHIMEDES_DOCKER_TRACE;
    else process.env.ARCHIMEDES_DOCKER_TRACE = originalTrace;
    if (originalReady === undefined) delete process.env.ARCHIMEDES_DOCKER_READY;
    else process.env.ARCHIMEDES_DOCKER_READY = originalReady;
    fs.rmSync(root, { recursive: true, force: true });
  });

  const backend = createDockerBackend({ checkoutDir: checkout, name: "fixture-container" });
  let added = 0, removed = 0;
  const add = controller.signal.addEventListener.bind(controller.signal);
  const remove = controller.signal.removeEventListener.bind(controller.signal);
  controller.signal.addEventListener = (...args) => { added++; return add(...args); };
  controller.signal.removeEventListener = (...args) => { removed++; return remove(...args); };

  preparing = backend.prepare({ signal: controller.signal });
  await waitFor(() => fs.existsSync(ready), "docker run never started");
  const start = Date.now();
  controller.abort();
  await assert.rejects(preparing);
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 3_000, `cancelled preparation took ${elapsed}ms`);
  assert.equal(added, removed, "an abort listener was retained");
  await backend.dispose();
  assert.equal(fs.readFileSync(trace, "utf8").trim(), "run\nrm -f fixture-container");
});

test("Docker structured files reject external directory/final symlinks and preserve ordinary nested edits", async t => {
  const f = fixture(t), external = path.join(f.outside, "input.txt");
  fs.writeFileSync(external, "Shared dataset must remain intact");
  fs.symlinkSync(f.outside, path.join(f.checkout, "data"), "dir");
  fs.symlinkSync(external, path.join(f.checkout, "result.txt"));
  const backend = createDockerBackend({ checkoutDir: f.checkout });
  await assert.rejects(backend.writeRepoFile("data/input.txt", "overwrite"), /symbolic link/);
  await assert.rejects(backend.writeRepoFile("result.txt", "overwrite"), /symbolic link/);
  await assert.rejects(backend.readFile("data/input.txt"), /outside/);
  await backend.writeRepoFile("notes/it's a file.txt", "UTF-8 科研\n");
  assert.equal(await backend.readFile("notes/it's a file.txt"), "UTF-8 科研\n");
  assert.equal(fs.readFileSync(external, "utf8"), "Shared dataset must remain intact");
  assert.equal(await backend.readFile("missing.txt"), null);
  fs.symlinkSync(path.join(f.checkout, "notes"), path.join(f.checkout, "inside"), "dir");
  assert.equal(await backend.readFile("inside/it's a file.txt"), "UTF-8 科研\n", "a read-only link resolving inside the checkout remains usable");
});

test("SSH production file scripts preserve stdin/quoting, refuse linked paths and never truncate a complete-read result silently", { skip: process.platform === "win32" }, async t => {
  const f = fixture(t);
  const backend = createSshBackend({ server: { user: "fixture", host: "127.0.0.1", workspace: f.root }, repoUrl: "https://github.com/example/fixture", spawnImpl: (_program, args, options) => spawn("/bin/bash", ["-c", args.at(-1)], options) });
  const repo = path.join(backend.remoteRoot, "repo"); fs.mkdirSync(repo, { recursive: true });
  fs.writeFileSync(path.join(f.outside, "data.txt"), "External input");
  fs.symlinkSync(f.outside, path.join(repo, "shared"), "dir");
  await backend.writeRepoFile("new dir/it's code.py", "value = '保留'\n");
  assert.equal(await backend.readFile("new dir/it's code.py"), "value = '保留'\n");
  await assert.rejects(backend.writeRepoFile("shared/data.txt", "wrong"), /symbolic link/);
  await assert.rejects(backend.readFile("shared/data.txt"), /symbolic link/);
  assert.equal(fs.readFileSync(path.join(f.outside, "data.txt"), "utf8"), "External input");
  fs.writeFileSync(path.join(repo, "large.json"), "x".repeat(2 * 1024 * 1024 + 10));
  await assert.rejects(backend.readFile("large.json"), /complete structured-read limit/);
  await backend.dispose();
});

test("the real pilot never falls back to another file after a structured read-limit error", async t => {
  const f = fixture(t), { runPilot } = require("./reproduction/pilot.cjs");
  fs.mkdirSync(path.join(f.checkout, "demo"));
  const requested = path.join(f.checkout, "demo/config.json"), fallback = path.join(f.checkout, "config.json");
  const large = '"value":"old"\n' + "x".repeat(2 * 1024 * 1024);
  fs.writeFileSync(requested, large);
  const backend = createDockerBackend({ checkoutDir: f.checkout });
  for (const action of ["edit_file", "read_file"]) {
    fs.writeFileSync(fallback, '"value":"old"\n');
    const decisions = [{ action, path: "demo/config.json", old: '"old"', new: '"new"' }, { action: "ask", question: "stop" }];
    const result = await runPilot({ repoName: "demo", steps: [{ id: "edit", title: "Edit config" }], backend,
      complete: async () => ({ json: decisions.shift() }),
    });
    assert.equal(result.status, "failed");
    assert.match(result.summary, /structured-read limit/);
    assert.equal(result.steps[0].id, "edit");
    assert.equal(fs.readFileSync(fallback, "utf8"), '"value":"old"\n');
    assert.equal(fs.readFileSync(requested, "utf8"), large);
  }
});
