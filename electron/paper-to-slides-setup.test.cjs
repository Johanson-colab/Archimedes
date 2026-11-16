const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const test = require("node:test");
const { checkPaperToSlidesSetup } = require("./paper-to-slides-setup.cjs");

const python = execFileSync(process.platform === "win32" ? "python" : "python3", ["-c", "import sys; print(sys.executable)"], { encoding: "utf8" }).trim();
function fixture(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-slides-setup-")));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}

test("the actual existing prerequisite script reports local presence without exposing token values or treating optional QA as a generation blocker", async () => {
  const result = await checkPaperToSlidesSetup({ backend: "codex", hasTaskToken: false }, { python,
    env: { ...process.env, MINERU_API_TOKEN: "fake-setup-token-never-return-this" } });
  assert.equal(result.checks.find(check => check.id === "python").status, "ready");
  assert.equal(result.checks.find(check => check.id === "command:node").status, "ready");
  assert.equal(result.checks.find(check => check.id === "mineru-token").status, "ready");
  assert.ok(!JSON.stringify(result).includes("fake-setup-token-never-return-this"));
  assert.ok(result.checks.some(check => check.id === "node:pptxgenjs"));
  assert.ok(result.checks.some(check => check.id === "python:requests"));
  assert.ok(result.checks.some(check => check.id === "python:markitdown"));
  assert.equal(result.checks.find(check => check.id === "fonts").status, "optional");
  assert.equal(typeof result.canStart, "boolean");
});

test("missing Python and missing PATH tools produce explicit actionable checks rather than a ready result", async t => {
  const root = fixture(t);
  const noPython = await checkPaperToSlidesSetup({ backend: "claude", hasTaskToken: true }, { python: path.join(root, "absent-python"), env: { PATH: root } });
  assert.equal(noPython.canStart, false); assert.match(noPython.checks[0].detail, /not verified/);
  const noTools = await checkPaperToSlidesSetup({ backend: "claude", hasTaskToken: true }, { python, env: { PATH: root, PYTHONDONTWRITEBYTECODE: "1" } });
  assert.equal(noTools.checks.find(check => check.id === "command:node").status, "missing");
  assert.equal(noTools.checks.find(check => check.id === "command:npm").status, "missing");
  assert.equal(noTools.checks.find(check => check.id === "command:soffice").status, "optional");
  assert.equal(noTools.checks.find(check => check.id === "mineru-token").status, "ready");
  assert.equal(noTools.canStart, false);
  await assert.rejects(checkPaperToSlidesSetup({ backend: "api" }), /Codex or Claude/);
});

test("the real presence script can permit a limited generation environment while preview and QA tools remain optional", { skip: process.platform === "win32" ? "POSIX-only isolated interpreter inventory fixture" : false }, async t => {
  const root = fixture(t), bin = path.join(root, "bin"), modules = path.join(root, "python-modules"), globalModules = path.join(root, "global-node-modules");
  for (const folder of [bin, modules, globalModules]) fs.mkdirSync(folder);
  // This is an inventory fixture, not a claim these empty modules execute.
  // The production script deliberately checks presence only.
  for (const name of ["requests", "dotenv", "PIL"]) fs.writeFileSync(path.join(modules, `${name}.py`), "");
  fs.mkdirSync(path.join(globalModules, "pptxgenjs"));
  fs.symlinkSync(process.execPath, path.join(bin, "node"));
  fs.writeFileSync(path.join(bin, "npm"), `#!/bin/sh\nprintf '%s\\n' '${globalModules}'\n`, { mode: 0o755 });
  const isolatedPython = path.join(bin, "python3");
  fs.writeFileSync(isolatedPython, `#!/bin/sh\nexec '${python.replaceAll("'", "'\\''")}' -S "$@"\n`, { mode: 0o755 });
  const options = { python: isolatedPython, env: { PATH: bin, PYTHONPATH: modules } };
  const limited = await checkPaperToSlidesSetup({ backend: "claude", hasTaskToken: true }, options);
  assert.equal(limited.checks.find(check => check.id === "command:soffice").status, "optional");
  assert.equal(limited.checks.find(check => check.id === "python:markitdown").status, "optional");
  assert.equal(limited.checks.find(check => check.id === "node:react-icons").status, "optional");
  assert.equal(limited.canStart, true);
  const noToken = await checkPaperToSlidesSetup({ backend: "claude", hasTaskToken: false }, options);
  assert.equal(noToken.canStart, false); assert.equal(noToken.checks.find(check => check.id === "mineru-token").status, "missing");
});

test("a stalled npm root subprocess is bounded and killed with the real Python probe process group", { skip: process.platform === "win32" ? "POSIX descendant fixture; Windows uses the existing taskkill runner path" : false }, async t => {
  const root = fixture(t), orphan = path.join(root, "orphan"), started = path.join(root, "npm-started");
  fs.symlinkSync(process.execPath, path.join(root, "node"));
  fs.writeFileSync(path.join(root, "npm"), `#!/bin/sh\necho started > '${started}'\n/bin/sleep 2\n/usr/bin/touch '${orphan}'\n`, { mode: 0o755 });
  const before = Date.now();
  const result = await checkPaperToSlidesSetup({ backend: "codex", hasTaskToken: true }, { python, env: { PATH: root }, timeoutMs: 1_000 });
  assert.equal(result.canStart, false); assert.match(result.checks[0].detail, /timed out/);
  assert.ok(Date.now() - before < 2_000);
  assert.equal(fs.existsSync(started), true, "the real script must actually reach npm before timing out");
  await new Promise(resolve => setTimeout(resolve, 2_200));
  assert.equal(fs.existsSync(orphan), false, "the npm descendant must not continue after the check returns");
});
