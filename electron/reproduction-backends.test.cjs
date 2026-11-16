const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { getEventListeners } = require("node:events");
const test = require("node:test");
const { createDockerBackend } = require("./reproduction/docker.cjs");
const { createSshBackend } = require("./reproduction/remote.cjs");
const { runProcess, CAPTURE_CHARS } = require("./reproduction/process-runner.cjs");
const { loggedCommand } = require("./reproduction/target-log.cjs");
const { outputPathFor } = require("./reproduction/paths.cjs");
const { shellQuote } = require("./reproduction/remote-quotes.cjs");
const { ownedCommand, cleanupCommand } = require("./reproduction/remote-owner.cjs");

function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-backend-boundary-")));
  const checkout = path.join(root, "checkout"), outside = path.join(root, "outside");
  fs.mkdirSync(checkout); fs.mkdirSync(outside);
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return { root, checkout, outside };
}

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
  const backend = createSshBackend({ server: { user: "fixture", host: "127.0.0.1", workspace: f.root }, repoUrl: "https://github.com/example/fixture", execute: (_program, args, options) => runProcess("/bin/bash", ["-c", args.at(-1)], options) });
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

test("large command output is complete on the target and bounded in the process capture, with its real exit code", { skip: process.platform === "win32" }, async t => {
  const token = randomUUID(), outputPath = outputPathFor(token, 1);
  t.after(() => fs.rmSync(path.dirname(outputPath), { recursive: true, force: true }));
  const source = `const {once}=require('node:events');(async()=>{process.stdout.write('FIRST\\n');const chunk='x'.repeat(65536);for(let i=0;i<64;i++)if(!process.stdout.write(chunk))await once(process.stdout,'drain');process.stdout.write('\\nLAST\\n');process.exitCode=7;})();`;
  const command = `${shellQuote(process.execPath)} -e ${shellQuote(source)}`;
  const result = await runProcess("/bin/sh", ["-c", loggedCommand(command, outputPath)], { timeoutMs: 10_000 });
  assert.equal(result.exitCode, 7);
  assert.equal(result.output.length <= CAPTURE_CHARS, true);
  assert.equal(result.outputTruncated, true);
  assert.equal(result.outputBytes, 4 * 1024 * 1024 + "FIRST\n\nLAST\n".length);
  const complete = fs.readFileSync(outputPath, "utf8");
  assert.match(complete, /^FIRST\n/); assert.match(complete, /\nLAST\n$/);
  assert.equal(Buffer.byteLength(complete), result.outputBytes);
});

test("local process cancellation stops its descendant group and removes abort listeners", { skip: process.platform === "win32" }, async t => {
  const f = fixture(t), marker = path.join(f.root, "must-not-appear");
  const controller = new AbortController();
  const child = `setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(marker)},'orphan'),1000);`;
  const parent = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(child)}],{stdio:'ignore'});process.stdout.write('READY\\n');setInterval(()=>{},1000);`;
  const result = await runProcess(process.execPath, ["-e", parent], { signal: controller.signal, timeoutMs: 5000, onData: data => { if (data.includes("READY")) controller.abort(); } });
  assert.equal(result.aborted, true);
  assert.equal(getEventListeners(controller.signal, "abort").length, 0);
  await new Promise(resolve => setTimeout(resolve, 1200));
  assert.equal(fs.existsSync(marker), false);
  const reused = new AbortController();
  for (let index = 0; index < 4; index++) assert.equal((await runProcess(process.execPath, ["-e", "process.stdout.write('OK')"], { signal: reused.signal })).exitCode, 0);
  assert.equal(getEventListeners(reused.signal, "abort").length, 0);
});

test("remote cleanup only signals the matching owned process group and leaves unrelated PIDs untouched", { skip: process.platform === "win32" }, async t => {
  const f = fixture(t), runId = randomUUID(), ownerToken = randomUUID();
  const controller = new AbortController();
  let ready;
  const entered = new Promise(resolve => { ready = resolve; });
  const pending = runProcess("/bin/bash", ["-c", ownedCommand("printf 'READY\\n'; sleep 30", { root: f.root, runId, ownerToken })], { signal: controller.signal, onData: data => { if (data.includes("READY")) ready(); } });
  await entered;
  assert.equal((await runProcess("/bin/bash", ["-c", cleanupCommand({ root: f.root, runId, ownerToken })], { timeoutMs: 2000 })).exitCode, 0);
  const result = await pending;
  assert.notEqual(result.exitCode, 0);
  const ownedDirectory = path.join(f.root, "active-runs", runId);
  fs.writeFileSync(path.join(ownedDirectory, "owner"), `${ownerToken}:${runId}`);
  fs.writeFileSync(path.join(ownedDirectory, "pid"), String(process.pid));
  assert.equal((await runProcess("/bin/bash", ["-c", cleanupCommand({ root: f.root, runId, ownerToken })], { timeoutMs: 2000 })).exitCode, 0);
  assert.doesNotThrow(() => process.kill(process.pid, 0));
});

test("Docker cleanup verifies exact labels even after prepare fails and never removes another owner's container", async t => {
  const f = fixture(t), runId = randomUUID(), ownerToken = randomUUID();
  const requests = [];
  let foreign = false;
  const execute = async (_program, args, options) => {
    requests.push({ args, options });
    if (args[0] === "info") return { exitCode: 0, output: "fixture version" };
    if (args[0] === "run") return { exitCode: 1, output: "Fake interrupted create" };
    if (args[0] === "inspect") return { exitCode: 0, output: JSON.stringify({ "com.archimedes.reproduction.run": runId, "com.archimedes.reproduction.owner": foreign ? "other" : ownerToken }) };
    return { exitCode: 0, output: "" };
  };
  const backend = createDockerBackend({ checkoutDir: f.checkout, runId, ownerToken, execute });
  await assert.rejects(backend.prepare(), /Could not start/);
  await backend.dispose(); await backend.dispose();
  assert.equal(requests.filter(item => item.args[0] === "rm").length, 1);
  const second = createDockerBackend({ checkoutDir: f.checkout, runId, ownerToken, execute });
  foreign = true;
  await assert.rejects(second.dispose(), /different run/);
  assert.equal(requests.filter(item => item.args[0] === "rm").length, 1);
});
