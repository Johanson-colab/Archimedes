const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const repository = path.resolve(__dirname, "../../../..");
const filename = path.join(repository, "electron/reproduction/pilot.cjs");
const loaded = new Module(filename, module); loaded.filename = filename; loaded.paths = Module._nodeModulePaths(path.dirname(filename));
loaded._compile(execFileSync("git", ["show", "1f4b37581c446770d576440f9ebb9bca5c55bfb7:electron/reproduction/pilot.cjs"], { cwd: repository, encoding: "utf8" }), filename);
const { runPilot } = require(path.join(repository, "electron/reproduction/pilot.cjs"));
const { freshContract } = require(path.join(repository, "electron/reproduction/run-snapshot.cjs"));
(async () => {
  const contract = { steps: [{ id: "check", title: "Check", command: "old-check", status: "passed", evidence: "PRIOR_RUN_OUTPUT", exit_code: 0 }] };
  let executed = 0;
  const backend = { exec: async () => { executed++; throw new Error("No command was requested"); } };
  const before = await loaded.exports.runPilot({ steps: contract.steps, backend, complete: async () => ({ json: { action: "done" } }) });
  const decisions = [{ action: "done" }, { action: "ask", question: "Need execution for this run" }];
  const after = await runPilot({ steps: freshContract(contract).steps, backend, complete: async () => ({ json: decisions.shift() }) });
  assert.equal(before.status, "verified"); assert.notEqual(after.status, "verified"); assert.equal(executed, 0);
  process.stdout.write(JSON.stringify({ originalNewRunInput: "previous contract with passed verdict", before: before.status, currentNewRunInput: "freshContract used by production run-manager", after: after.status, executedCommands: executed,
    scope: "Intact original pilot; original main passed the saved steps. Actual current manager/store ownership and history are additionally tested in electron/reproduction-snapshot.test.cjs." }) + "\n");
})().catch(error => { process.stderr.write(error.stack + "\n"); process.exitCode = 1; });
