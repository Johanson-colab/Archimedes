// Explicit opt-in real local integration. Never run by npm test.
// --ssh: temporary keys/config/localhost port, no user SSH configuration.
// --docker: only this script's labeled CPU/memory-bounded container is removed.
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const net = require("node:net");
const { spawn, spawnSync } = require("node:child_process");
const { randomUUID } = require("node:crypto");
const assert = require("node:assert/strict");
const repository = path.resolve(__dirname, "../../../..");
const { runProcess, terminateProcess } = require(path.join(repository, "electron/reproduction/process-runner.cjs"));
const { shellQuote } = require(path.join(repository, "electron/reproduction/remote-quotes.cjs"));
const { outputPathFor } = require(path.join(repository, "electron/reproduction/paths.cjs"));
const { ownerPaths } = require(path.join(repository, "electron/reproduction/remote-owner.cjs"));

async function availablePort() {
  const server = net.createServer();
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port;
}
function connects(port) {
  return new Promise(resolve => {
    const socket = net.connect({ host: "127.0.0.1", port });
    socket.once("connect", () => { socket.destroy(); resolve(true); });
    socket.once("error", () => { socket.destroy(); resolve(false); });
  });
}

async function sshSmoke(root) {
  const port = await availablePort(), hostKey = path.join(root, "host-key"), clientKey = path.join(root, "client-key");
  for (const file of [hostKey, clientKey]) assert.equal(spawnSync("/usr/bin/ssh-keygen", ["-q", "-t", "ed25519", "-N", "", "-f", file], { stdio: "ignore" }).status, 0);
  const config = path.join(root, "sshd.conf");
  fs.writeFileSync(config, [
    `Port ${port}`, "ListenAddress 127.0.0.1", `HostKey ${hostKey}`, `PidFile ${path.join(root, "sshd.pid")}`,
    `AuthorizedKeysFile ${clientKey}.pub`, "StrictModes no", "PasswordAuthentication no", "KbdInteractiveAuthentication no",
    "UsePAM no", "UseDNS no", "PrintMotd no", "LogLevel ERROR", `AllowUsers ${os.userInfo().username}`,
  ].join("\n") + "\n");
  const daemon = spawn("/usr/sbin/sshd", ["-D", "-e", "-f", config], { detached: true, stdio: ["ignore", "ignore", "pipe"] });
  let daemonLog = ""; daemon.stderr.on("data", chunk => { daemonLog = (daemonLog + chunk.toString()).slice(-2000); });
  let backend;
  try {
    let ready = false;
    for (let attempt = 0; attempt < 40; attempt++) {
      if (await connects(port)) { ready = true; break; }
      if (daemon.exitCode !== null) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!ready) throw new Error(`Temporary localhost sshd could not start: ${daemonLog.trim() || `exit ${daemon.exitCode}`}`);
    const controller = new AbortController(), runId = randomUUID(), ownerToken = randomUUID();
    const { createSshBackend } = require(path.join(repository, "electron/reproduction/remote.cjs"));
    backend = createSshBackend({ server: { host: "127.0.0.1", user: os.userInfo().username, port, identityFile: clientKey, workspace: root }, runId, ownerToken, signal: controller.signal, secrets: { ARCHIMEDES_SMOKE_VALUE: "fake-smoke-only" }, repoUrl: "https://github.com/example/local-only",
      execute: (program, args, options) => runProcess(program, ["-F", "/dev/null", "-o", "IdentitiesOnly=yes", "-o", `UserKnownHostsFile=${path.join(root, "known-hosts")}`, "-o", "GlobalKnownHostsFile=/dev/null", ...args], options),
    });
    const repo = path.join(backend.remoteRoot, "repo"); fs.mkdirSync(repo, { recursive: true });
    const gitEnv = { ...process.env, GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" };
    for (const args of [["init"], ["-c", "user.name=Fixture", "-c", "user.email=fixture@example.invalid", "-c", "commit.gpgsign=false", "commit", "--allow-empty", "-m", "fixture"]]) {
      const result = await runProcess("git", args, { cwd: repo, env: gitEnv, timeoutMs: 5000 }); assert.equal(result.exitCode, 0, result.output);
    }
    const preparation = await backend.prepare();
    assert.match(preparation.commit, /^[a-f0-9]{40}$/);
    await backend.writeRepoFile("notes/quote's.txt", "Real localhost SSH content\n");
    assert.equal(await backend.readFile("notes/quote's.txt"), "Real localhost SSH content\n");
    const external = path.join(root, "external"); fs.mkdirSync(external); fs.writeFileSync(path.join(external, "input.txt"), "unchanged");
    fs.symlinkSync(external, path.join(repo, "linked"), "dir");
    await assert.rejects(backend.writeRepoFile("linked/input.txt", "wrong"));
    assert.equal(fs.readFileSync(path.join(external, "input.txt"), "utf8"), "unchanged");
    let entered;
    const running = new Promise(resolve => { entered = resolve; });
    const marker = path.join(root, "orphan-marker");
    const script = `process.stdout.write('SSH-RUNNING\\n');setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(marker)},'orphan'),1800);`;
    const pending = backend.exec(`test "$ARCHIMEDES_SMOKE_VALUE" = fake-smoke-only || exit 9; ${shellQuote(process.execPath)} -e ${shellQuote(script)}`, { timeoutMs: 10000, onData: chunk => { if (chunk.includes("SSH-RUNNING")) entered(); } });
    await Promise.race([running, pending.then(() => { throw new Error("The SSH command ended before its readiness marker."); })]);
    const pid = fs.readFileSync(ownerPaths(backend.remoteRoot, runId).pid, "utf8").trim();
    controller.abort(); await pending; await backend.dispose();
    await new Promise(resolve => setTimeout(resolve, 2000));
    assert.equal(fs.existsSync(marker), false);
    assert.equal(fs.existsSync(backend.resource().envPath), false);
    assert.match(fs.readFileSync((await pending).logReference.path, "utf8"), /SSH-RUNNING/);
    process.stdout.write(JSON.stringify({ service: "localhost-ssh", status: "passed", prepareCommit: preparation.commit, structuredFile: true, symlinkWriteRejected: true, cancelledOwnedPid: Number(pid), orphanMarker: false, fakeEnvironmentCleaned: true }) + "\n");
  } finally {
    try { await backend?.dispose(); } catch {}
    if (backend) fs.rmSync(path.dirname(outputPathFor(backend.resource().runId, 1)), { recursive: true, force: true });
    terminateProcess(daemon, "SIGTERM");
    let timer;
    try { if (daemon.exitCode === null) await Promise.race([new Promise(resolve => daemon.once("close", resolve)), new Promise(resolve => { timer = setTimeout(() => { terminateProcess(daemon, "SIGKILL"); resolve(); }, 1000); })]); }
    finally { clearTimeout(timer); }
  }
}

async function dockerSmoke(root) {
  const { createDockerBackend } = require(path.join(repository, "electron/reproduction/docker.cjs"));
  const controller = new AbortController(), runId = randomUUID(), ownerToken = randomUUID();
  const overrideIndex = process.argv.indexOf('--image');
  const smokeImage = overrideIndex >= 0 ? process.argv[overrideIndex + 1] : null;
  const execute = (program, args, options) => {
    // Explicit evidence-only launch override: reuse an installed Linux image,
    // disable its service entrypoint, and isolate this bounded shell task.
    if (smokeImage && program === 'docker' && args[0] === 'run') {
      args = ['run', '--entrypoint', '', '--user', '0', '--network', 'none', ...args.slice(1).map(value => value === 'python:3.11-slim' ? smokeImage : value)];
    }
    return runProcess(program, args, options);
  };
  const backend = createDockerBackend({ checkoutDir: root, runId, ownerToken, signal: controller.signal, execute, limits: { cpus: 1, memory: "256m", pids: 64 } });
  try {
    await backend.prepare();
    const result = await backend.exec("printf 'REAL-DOCKER\\n'; head -c 1048576 /dev/zero | tr '\\0' x", { timeoutMs: 10000 });
    assert.equal(result.exitCode, 0); assert.equal(result.outputTruncated, true); assert.ok(result.outputBytes > 1048576);
    let entered;
    const running = new Promise(resolve => { entered = resolve; });
    const pending = backend.exec("printf 'DOCKER-RUNNING\\n'; sleep 30", { timeoutMs: 10000, onData: chunk => { if (chunk.includes("DOCKER-RUNNING")) entered(); } });
    await Promise.race([running, pending.then(() => { throw new Error("The Docker command ended before its readiness marker."); })]); controller.abort(); await pending; await backend.dispose();
    const inspect = await runProcess("docker", ["inspect", backend.container], { timeoutMs: 5000 });
    assert.notEqual(inspect.exitCode, 0);
    const persistedLog = fs.readFileSync(path.join(root, result.logReference.path), "utf8");
    assert.match(persistedLog, /^REAL-DOCKER/);
    assert.ok(Buffer.byteLength(persistedLog) > 1048576);
    process.stdout.write(JSON.stringify({ service: "docker", status: "passed", configuredImage: backend.image, smokeImage: smokeImage || backend.image, launchOverride: Boolean(smokeImage), container: backend.container, outputBytes: result.outputBytes, boundedCapture: result.output.length, removedOwnedContainer: true }) + "\n");
  } finally { await backend.dispose(); }
}

(async () => {
  const mode = process.argv[2];
  if (!["--ssh", "--docker"].includes(mode)) throw new Error("Choose --ssh or --docker explicitly.");
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-local-service-")));
  try { await (mode === "--ssh" ? sshSmoke(root) : dockerSmoke(root)); }
  finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(error => { process.stderr.write(JSON.stringify({ status: "failed", error: error.message }) + "\n"); process.exitCode = 1; });
