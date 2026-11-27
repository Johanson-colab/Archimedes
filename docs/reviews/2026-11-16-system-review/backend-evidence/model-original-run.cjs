// Compile the original provider/orchestrator modules in an isolated process.
// Their dependencies and the new behavior assertions are unchanged. No checkout
// or product file is written; this runner is expected to fail on the old code.
const path = require("node:path");
const Module = require("node:module");
const { execFileSync } = require("node:child_process");
const repository = path.resolve(__dirname, "../../../..");
const revision = "1f4b37581c446770d576440f9ebb9bca5c55bfb7";
for (const relative of ["electron/agent/anthropic.cjs", "electron/agent.cjs", "electron/paper-review-model.cjs"]) {
  const filename = path.join(repository, relative);
  const source = execFileSync("git", ["show", `${revision}:${relative}`], { cwd: repository, encoding: "utf8" });
  const original = new Module(filename, module);
  original.filename = filename;
  original.paths = Module._nodeModulePaths(path.dirname(filename));
  original._compile(source, filename);
  require.cache[filename] = original;
}
require(path.join(repository, "electron/model-completion.test.cjs"));
