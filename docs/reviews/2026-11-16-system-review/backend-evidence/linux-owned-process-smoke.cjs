const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const path = require("node:path");
const repository = path.resolve(__dirname, "../../../..");
const { runProcess } = require(path.join(repository, "electron/reproduction/process-runner.cjs"));
const { ownedCommand, cleanupCommand, ownerPaths } = require(path.join(repository, "electron/reproduction/remote-owner.cjs"));
const { loginCommand } = require(path.join(repository, "electron/reproduction/remote.cjs"));
const docker = "/usr/local/bin/docker";
const runId = randomUUID(), ownerToken = randomUUID(), name = `archimedes-linux-owner-${runId}`, root = "/tmp/archimedes-owned-fixture";
async function command(args) { return runProcess(docker, args, { timeoutMs: 15_000 }); }
(async () => {
  try {
    // Existing image is used solely for Linux bash + real ps, never Neo4j.
    let result = await command(["run", "-d", "--rm", "--name", name, "--network", "none", "--cpus", "1", "--memory", "128m", "--pids-limit", "64", "--entrypoint", "sh", "neo4j:5.26.2", "-c", "sleep 60"]);
    assert.equal(result.exitCode, 0, result.output);
    const files = ownerPaths(root, runId);
    const active = command(["exec", name, "sh", "-c", loginCommand(ownedCommand(`sleep 3; printf orphan > ${root}/orphan`, { root, runId, ownerToken }))]);
    let ready = false;
    for (let index = 0; index < 30; index++) {
      result = await command(["exec", name, "sh", "-c", `test -f ${files.pid}`]);
      if (result.exitCode === 0) { ready = true; break; }
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    assert.equal(ready, true);
    const processState = await command(["exec", name, "sh", "-c", `ps -p "$(cat ${files.pid})" -o pid=,pgid=,args=`]);
    assert.equal(processState.exitCode, 0, processState.output);
    const values = processState.output.trim().split(/\s+/);
    assert.equal(values[0], values[1], "the real production Bash wrapper must create a process group");
    result = await command(["exec", name, "bash", "-c", cleanupCommand({ root, runId, ownerToken })]);
    assert.equal(result.exitCode, 0, result.output);
    await active;
    await new Promise(resolve => setTimeout(resolve, 3300));
    result = await command(["exec", name, "sh", "-c", `test ! -e ${root}/orphan && test ! -e ${files.marker}`]);
    assert.equal(result.exitCode, 0, result.output);
    const missingPs = await command(["run", "--rm", "--network", "none", "--cpus", "1", "--memory", "128m", "--pids-limit", "64", "python:3.11-slim", "bash", "-c",
      `mkdir -p ${files.directory}; printf '%s' '${ownerToken}:${runId}' > ${files.marker}; printf '%s' "$BASHPID" > ${files.pid}; ${cleanupCommand({ root, runId, ownerToken })}`]);
    assert.equal(missingPs.exitCode, 73); assert.match(missingPs.output, /ps is required/);
    process.stdout.write(JSON.stringify({ platform: "Linux container", shellEntry: "non-TTY /bin/sh -> production bash -lc", processGroupMatchesPid: true,
      descendantsStopped: true, orphanMarker: false, missingPsReportsFailure: true, image: "neo4j:5.26.2 (entrypoint sh; no service)", pythonImage: "python:3.11-slim missing-ps case" }) + "\n");
  } finally {
    const removed = await command(["rm", "-f", name]);
    assert.equal(removed.exitCode, 0, removed.output);
  }
})().catch(error => { process.stderr.write(`${error.stack}\n`); process.exitCode = 1; });
