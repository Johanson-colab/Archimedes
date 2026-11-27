// A deterministic retained-output measurement, not a machine-wide RSS benchmark.
const Module = require("node:module");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const assert = require("node:assert/strict");
const repository = path.resolve(__dirname, "../../../..");
const filename = path.join(repository, "electron/reproduction/docker.cjs");
const original = new Module(filename, module);
original.filename = filename; original.paths = Module._nodeModulePaths(path.dirname(filename));
const source = execFileSync("git", ["show", "1f4b37581c446770d576440f9ebb9bca5c55bfb7:electron/reproduction/docker.cjs"], { cwd: repository, encoding: "utf8" });
// Expose the intact original private function only in this isolated process.
original._compile(`${source}\nmodule.exports.reviewRunProcess = runProcess;`, filename);
const { runProcess } = require(path.join(repository, "electron/reproduction/process-runner.cjs"));
(async () => {
  const child = "const b=Buffer.alloc(65536,120);for(let i=0;i<128;i++)process.stdout.write(b);";
  const args = ["--max-old-space-size=64", "-e", child];
  const before = await original.exports.reviewRunProcess(process.execPath, args, { timeoutMs: 10000 });
  const after = await runProcess(process.execPath, args, { timeoutMs: 10000 });
  assert.equal(before.output.length, 8 * 1024 * 1024);
  assert.equal(after.outputBytes, 8 * 1024 * 1024);
  assert.equal(after.output.length, 64000); assert.equal(after.outputTruncated, true);
  process.stdout.write(JSON.stringify({ outputBytes: after.outputBytes, originalRetainedChars: before.output.length, currentRetainedChars: after.output.length, truncatedVisible: after.outputTruncated, completeTargetLog: "separately verified by real Docker/SSH and reproduction-backends.test.cjs" }) + "\n");
})().catch(error => { process.stderr.write(error.message + "\n"); process.exitCode = 1; });
