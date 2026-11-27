const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { createHash } = require("node:crypto");
const repository = path.resolve(__dirname, "../../../..");
const originalHandoff = require(path.join(repository, "docs/reviews/2026-11-16-system-review/implementation-evidence/v03-resource-handoff.json"));
const handoff = require(path.join(path.dirname(originalHandoff.cache), "official-live-resource-handoff.json"));
const { createManagedCompiler } = require(path.join(repository, "electron/managed-latex-engine.cjs"));
const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-official-tex-cached-")));
(async () => {
  try {
    fs.mkdirSync(path.join(root, "paper"));
    fs.writeFileSync(path.join(root, "paper/main.tex"), "\\documentclass{article}\n\\font\\conferencefont=phvb at 8pt\n\\begin{document}{\\conferencefont Official cached Helvetica font.}\\end{document}\n");
    const compile = createManagedCompiler({ runtimeRoot: handoff.runtimeRoot, resourcesPath: handoff.resources, timeoutMs: 30_000,
      spawnImpl: (command, args, options) => spawn(command, ["--only-cached", ...args], options) });
    const result = await compile(root, "paper/main.tex");
    assert.equal(result.ok, true, result.log);
    assert.equal(createHash("sha256").update(fs.readFileSync(handoff.executable)).digest("hex"), handoff.executableSha256);
    const bytes = fs.readFileSync(path.join(root, result.pdf_path));
    assert.equal(bytes.subarray(0, 5).toString(), "%PDF-");
    process.stdout.write(JSON.stringify({ ok: result.ok, defaultBundle: handoff.defaultBundle, onlyCached: true, officialExecutableSha256: handoff.executableSha256,
      runtimeRoot: handoff.runtimeRoot, durationMs: result.duration_ms, pdfBytes: bytes.length, pdfSha256: createHash("sha256").update(bytes).digest("hex"), fixture: "article + Helvetica", limitation: "Other manuscript packages/fonts may need their first download." }) + "\n");
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
})().catch(error => { process.stderr.write(error.stack + "\n"); process.exitCode = 1; });
