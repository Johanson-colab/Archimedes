const fs = require("node:fs");
const path = require("node:path");
const { runProcess } = require("./reproduction/process-runner.cjs");

const SCRIPT = path.join(__dirname, "assets/research-skills/paper2slides/codex/scripts/check_env.py");
const REQUIRED_PYTHON = new Set(["requests", "dotenv", "PIL"]);

async function checkPaperToSlidesSetup(input = {}, { python = process.platform === "win32" ? "python" : "python3", env = process.env, timeoutMs = 8_000, execute = runProcess, scriptPath = SCRIPT } = {}) {
  if (!["codex", "claude"].includes(input.backend)) throw new Error("Paper to Slides requires Codex or Claude Code.");
  const script = fs.readFileSync(scriptPath, "utf8");
  // Node/Electron can read ASAR resources; the external Python process cannot.
  // stdin also avoids importing the skill package's dotenv initialization.
  const result = await execute(python, ["-B", "-"], { stdin: script, env: { ...env, NPM_CONFIG_UPDATE_NOTIFIER: "false", NPM_CONFIG_LOGS_MAX: "0" },
    timeoutMs, separateOutput: true, captureChars: 32_000 });
  if (result.exitCode !== 0 || result.timedOut || result.aborted || result.error) {
    return { checks: [{ id: "dependency-probe", label: "Slide dependencies", status: "missing",
      detail: result.timedOut ? "The dependency check timed out and its process group was stopped. No setup was changed."
        : "Python 3 could not complete the dependency check. Dependencies were not verified; no setup was changed." }], canStart: false };
  }
  let report;
  try { report = JSON.parse(result.stdout); }
  catch { return { checks: [{ id: "dependency-probe", label: "Slide dependencies", status: "missing", detail: "The dependency check returned an unreadable report. Dependencies were not verified." }], canStart: false }; }
  const checks = [{ id: "python", label: "Python 3", status: "ready", detail: "The existing slide prerequisite script ran in this Python environment." }];
  const add = (id, label, exists, required, detail) => checks.push({ id, label, status: exists ? "ready" : required ? "missing" : "optional", detail: exists ? "Present in the current app environment; execution was not validated." : detail });
  for (const name of ["node", "npm", "pdftoppm", "soffice"]) add(`command:${name}`, name, Boolean(report.commands?.[name]), ["node", "npm"].includes(name),
    ["node", "npm"].includes(name) ? `Make ${name} available on the app PATH.` : `${name} is unavailable. PDF preview or visual QA may be limited; PPTX generation is still possible.`);
  for (const name of ["requests", "dotenv", "PIL", "markitdown"]) add(`python:${name}`, `Python ${name}`, report.python_packages?.[name] === true, REQUIRED_PYTHON.has(name),
    REQUIRED_PYTHON.has(name) ? `Add ${name} to the Python environment used by the slide skill.` : "Content QA is unavailable in this Python environment. Its results must not be claimed as checked.");
  for (const name of ["pptxgenjs", "react", "react-dom", "react-icons", "sharp"]) add(`node:${name}`, name, report.global_node_modules?.[name] === true, name === "pptxgenjs",
    name === "pptxgenjs" ? "Make pptxgenjs available in the global npm directory used by the existing slide renderer."
      : `${name} is unavailable. Icon or image rendering may be limited.`);
  const token = input.hasTaskToken === true || report.mineru_token_configured === true;
  checks.push({ id: "mineru-token", label: "MinerU token", status: token ? "ready" : "missing",
    detail: token ? "Configured for this task or environment; authentication and network access were not checked."
      : "Configure a MinerU token for this task before starting PDF parsing." });
  checks.push({ id: "fonts", label: "Fonts and visual output", status: "optional", detail: "Installed fonts, CJK rendering and visual output were not checked. CLI login is checked separately." });
  return { checks, canStart: checks.every(check => check.status !== "missing") };
}

module.exports = { checkPaperToSlidesSetup };
