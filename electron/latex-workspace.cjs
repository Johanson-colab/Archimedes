const fs = require("node:fs");
const path = require("node:path");
const { createHash } = require("node:crypto");
const { spawn } = require("node:child_process");
const workspaceFiles = require("./workspace-files.cjs");

const PAPER_EXTENSIONS = new Set([".tex", ".bib", ".bst", ".cls", ".sty", ".cfg"]);
const SKIPPED_DIRECTORIES = new Set([".archimedes", ".git", "node_modules", "dist", "build", ".next"]);
const SKIPPED_IMPORT_FILES = new Set([".DS_Store"]);
const MAX_IMPORT_FILES = 10_000;
const MAX_IMPORT_BYTES = 500 * 1024 * 1024;
const DEFAULT_DOCUMENT = String.raw`\documentclass[11pt]{article}
\usepackage[margin=1in]{geometry}
\usepackage{amsmath,amssymb,booktabs,graphicx,hyperref}

\title{Untitled Research Paper}
\author{}
\date{\today}

\begin{document}
\maketitle

\begin{abstract}
Write a concise summary of the problem, method, and main evidence.
\end{abstract}

\section{Introduction}
Describe the problem and the paper's contribution.

\section{Related Work}
Position the work against the most relevant literature.

\section{Method}
Present the method with enough detail to reproduce it.

\section{Experiments}
Describe datasets, baselines, metrics, and results.

\section{Conclusion}
Summarize the findings and limitations.

\end{document}
`;

function normalizePaperPath(value) {
  const normalized = String(value || "").replaceAll("\\", "/").replace(/^\/+/, "").replace(/\/+/g, "/");
  if (!normalized || normalized === "." || normalized.split("/").includes("..") || path.posix.extname(normalized).toLowerCase() !== ".tex") {
    throw new Error("Choose a workspace-relative .tex document to compile.");
  }
  return normalized;
}

function listLatexProjects(root, { maxFiles = 4_000, maxDepth = 10 } = {}) {
  const documents = [];
  const workspace = workspaceFiles.workspacePath(root);
  let visited = 0;
  function visit(directory, depth) {
    if (depth > maxDepth || visited >= maxFiles) return;
    let entries;
    try { entries = fs.readdirSync(directory, { withFileTypes: true }); } catch { return; }
    for (const entry of entries) {
      if (visited >= maxFiles || entry.isSymbolicLink() || SKIPPED_DIRECTORIES.has(entry.name)) continue;
      visited += 1;
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) {
        visit(target, depth + 1);
        continue;
      }
      if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".tex") continue;
      let content = "";
      try {
        const stats = fs.statSync(target);
        if (stats.size <= 2_000_000) content = fs.readFileSync(target, "utf8");
      } catch { /* Ignore unreadable candidates. */ }
      const relativePath = path.relative(workspace, target).split(path.sep).join("/");
      const title = /\\title\s*\{([^{}]{1,240})\}/s.exec(content)?.[1]?.replace(/\s+/g, " ").trim() || path.basename(entry.name, ".tex");
      documents.push({ path: relativePath, title, main: /\\documentclass(?:\[[^\]]*\])?\s*\{/s.test(content) });
    }
  }
  visit(workspace, 0);
  return documents.sort((left, right) => Number(right.main) - Number(left.main) || left.path.localeCompare(right.path));
}

function createLatexProject(root, requestedDirectory = "paper") {
  const base = String(requestedDirectory || "paper").replaceAll("\\", "/").replace(/^\/+|\/+$/g, "").replace(/[^\p{L}\p{N}._/-]+/gu, "-") || "paper";
  let directory = base;
  let index = 2;
  while (fs.existsSync(workspaceFiles.workspacePath(root, directory, { mustExist: false }))) directory = `${base}-${index++}`;
  const mainPath = `${directory}/main.tex`;
  return workspaceFiles.writeWorkspaceTextFile(root, mainPath, DEFAULT_DOCUMENT);
}

function normalizeWorkspaceEntryPath(value, label) {
  const normalized = String(value || "").trim().replaceAll("\\", "/").replace(/^\/+|\/+$/g, "").replace(/\/+/g, "/");
  if (!normalized || normalized === "." || normalized.split("/").some((part) => !part || part === "." || part === "..")) {
    throw new Error(`Enter a workspace-relative ${label}.`);
  }
  return normalized;
}

function createLatexFile(root, requestedPath) {
  let relative = normalizeWorkspaceEntryPath(requestedPath, "file name");
  if (!path.posix.extname(relative)) relative = `${relative}.tex`;
  if (!PAPER_EXTENSIONS.has(path.posix.extname(relative).toLowerCase())) {
    throw new Error("LaTeX workspace files must use .tex, .bib, .bst, .cls, .sty, or .cfg.");
  }
  const target = workspaceFiles.workspacePath(root, relative, { mustExist: false });
  if (fs.existsSync(target)) throw new Error("A file or folder with that name already exists.");
  const content = path.posix.extname(relative).toLowerCase() === ".tex" ? "% New LaTeX source\n" : "";
  return workspaceFiles.writeWorkspaceTextFile(root, relative, content);
}

function createLatexDirectory(root, requestedPath) {
  const relative = normalizeWorkspaceEntryPath(requestedPath, "folder name");
  const target = workspaceFiles.workspacePath(root, relative, { mustExist: false });
  if (fs.existsSync(target)) throw new Error("A file or folder with that name already exists.");
  fs.mkdirSync(target, { recursive: true });
  return { name: path.basename(target), path: relative, type: "directory" };
}

function importLatexProject(root, sourceDirectory) {
  const workspace = fs.realpathSync(workspaceFiles.workspacePath(root));
  const source = fs.realpathSync(path.resolve(String(sourceDirectory || "")));
  if (!fs.statSync(source).isDirectory()) throw new Error("Choose a folder containing a LaTeX project.");
  if (source === workspace || source.startsWith(`${workspace}${path.sep}`) || workspace.startsWith(`${source}${path.sep}`)) {
    throw new Error("Choose a project folder outside the active workspace.");
  }

  const directories = [""];
  const files = [];
  let totalBytes = 0;
  function scan(directory, relative = "") {
    const entries = fs.readdirSync(directory, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.isSymbolicLink() || SKIPPED_IMPORT_FILES.has(entry.name)) continue;
      if (entry.isDirectory() && SKIPPED_DIRECTORIES.has(entry.name)) continue;
      const target = path.join(directory, entry.name);
      const nextRelative = relative ? path.join(relative, entry.name) : entry.name;
      if (entry.isDirectory()) {
        directories.push(nextRelative);
        scan(target, nextRelative);
        continue;
      }
      if (!entry.isFile()) continue;
      const size = fs.statSync(target).size;
      totalBytes += size;
      files.push({ source: target, relative: nextRelative, size });
      if (files.length > MAX_IMPORT_FILES) throw new Error(`LaTeX folder imports are limited to ${MAX_IMPORT_FILES.toLocaleString()} files.`);
      if (totalBytes > MAX_IMPORT_BYTES) throw new Error("LaTeX folder imports are limited to 500 MB.");
    }
  }
  scan(source);

  const rawName = path.basename(source).replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^\.+$/, "") || "paper";
  let directory = rawName;
  let index = 2;
  while (fs.existsSync(workspaceFiles.workspacePath(root, directory, { mustExist: false }))) directory = `${rawName}-${index++}`;
  const destination = workspaceFiles.workspacePath(root, directory, { mustExist: false });
  try {
    for (const relative of directories) fs.mkdirSync(path.join(destination, relative), { recursive: true });
    for (const file of files) {
      const target = path.join(destination, file.relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(file.source, target);
    }
  } catch (error) {
    fs.rmSync(destination, { recursive: true, force: true });
    throw error;
  }
  // Search the imported directory itself.  Looking through the whole
  // workspace can hit the discovery cap before reaching a newly imported
  // folder in a large research checkout, which used to produce a false
  // "no .tex document" result.
  const projects = listLatexProjects(destination);
  const selected = projects.find((project) => project.main) || projects[0];
  const mainPath = selected ? `${directory}/${selected.path}` : "";
  return { name: path.basename(destination), directory, file_count: files.length, total_bytes: totalBytes, main_path: mainPath };
}

function findExecutable(names, env = process.env) {
  const pathEntries = String(env.PATH || "").split(path.delimiter).filter(Boolean);
  const candidates = [];
  for (const name of names) {
    if (path.isAbsolute(name)) candidates.push(name);
    else for (const directory of pathEntries) candidates.push(path.join(directory, name));
  }
  for (const candidate of candidates) {
    try {
      fs.accessSync(candidate, fs.constants.X_OK);
      return candidate;
    } catch { /* Continue searching. */ }
  }
  return "";
}

function parseLatexDiagnostics(output) {
  const diagnostics = [];
  const seen = new Set();
  const add = (line, message) => {
    const normalized = String(message || "").replace(/\s+/g, " ").trim().slice(0, 500);
    const lineNumber = Number(line) || null;
    const key = `${lineNumber}:${normalized}`;
    if (!normalized || seen.has(key) || diagnostics.length >= 30) return;
    seen.add(key);
    diagnostics.push({ line: lineNumber, message: normalized });
  };
  const lines = String(output || "").split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const located = /(?:^|:)(\d+):\s*(.+)$/.exec(lines[index]);
    if (located && /(?:error|warning|undefined|missing|emergency|fatal)/i.test(located[2])) add(located[1], located[2]);
    if (lines[index].startsWith("!")) {
      const nearby = lines.slice(index + 1, index + 4).join(" ");
      add(/l\.(\d+)/.exec(nearby)?.[1], lines[index].slice(1));
    }
  }
  return diagnostics;
}

function runCompiler(command, args, options = {}) {
  const timeoutMs = Math.min(180_000, Math.max(10_000, Number(options.timeoutMs) || 90_000));
  const spawnImpl = options.spawnImpl || spawn;
  return new Promise((resolve, reject) => {
    const child = spawnImpl(command, args, { cwd: options.cwd, env: options.env || process.env, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    const append = (chunk) => { output = `${output}${String(chunk)}`.slice(-120_000); };
    child.stdout?.on("data", append);
    child.stderr?.on("data", append);
    child.once("error", reject);
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("LaTeX compilation timed out."));
    }, timeoutMs);
    child.once("close", (code, signal) => {
      clearTimeout(timer);
      resolve({ code: Number.isInteger(code) ? code : 1, signal: signal || null, output });
    });
  });
}

async function compileLatexDocument(root, requestedPath, options = {}) {
  const sourcePath = normalizePaperPath(requestedPath);
  const absoluteSource = workspaceFiles.workspacePath(root, sourcePath);
  if (!fs.statSync(absoluteSource).isFile()) throw new Error("The selected LaTeX document is not a file.");
  const sourceDirectory = path.dirname(absoluteSource);
  const documentName = path.basename(absoluteSource, ".tex");
  const buildKey = createHash("sha1").update(sourcePath).digest("hex").slice(0, 12);
  const buildDirectory = workspaceFiles.workspacePath(root, `.archimedes/latex-build/${buildKey}`, { mustExist: false });
  fs.mkdirSync(buildDirectory, { recursive: true });

  const compilerEnv = { ...process.env, ...(options.env || {}), LANG: "en_US.UTF-8", LC_ALL: "en_US.UTF-8" };
  const latexmk = options.executable || findExecutable(["latexmk", "latexmk.exe", "/Library/TeX/texbin/latexmk"], compilerEnv);
  const pdflatex = latexmk ? "" : findExecutable(["pdflatex", "pdflatex.exe", "/Library/TeX/texbin/pdflatex"], compilerEnv);
  const executable = latexmk || pdflatex;
  if (!executable) throw new Error("No LaTeX compiler was found. Install latexmk or pdflatex, then try again.");
  // A manual compile is expected to reflect changes outside the .tex source
  // as well (for example, a TeX package that was just installed).  latexmk's
  // dependency cache otherwise preserves an earlier failed build indefinitely.
  const args = latexmk
    ? ["-g", "-pdf", "-no-shell-escape", "-interaction=nonstopmode", "-halt-on-error", "-file-line-error", `-outdir=${buildDirectory}`, path.basename(absoluteSource)]
    : ["-no-shell-escape", "-interaction=nonstopmode", "-halt-on-error", "-file-line-error", `-output-directory=${buildDirectory}`, path.basename(absoluteSource)];
  const startedAt = Date.now();
  let run = await runCompiler(executable, args, { ...options, cwd: sourceDirectory, env: compilerEnv });
  if (!latexmk && run.code === 0) {
    const secondPass = await runCompiler(executable, args, { ...options, cwd: sourceDirectory, env: compilerEnv });
    run = { ...secondPass, output: `${run.output}\n${secondPass.output}` };
  }
  const absolutePdf = path.join(buildDirectory, `${documentName}.pdf`);
  const hasPdf = fs.existsSync(absolutePdf) && fs.statSync(absolutePdf).isFile();
  const logPath = path.join(buildDirectory, `${documentName}.log`);
  const log = fs.existsSync(logPath) ? fs.readFileSync(logPath, "utf8").slice(-80_000) : run.output;
  const ok = run.code === 0 && hasPdf;
  const diagnostics = parseLatexDiagnostics(`${run.output}\n${log}`);
  if (!ok && !diagnostics.length) {
    const summary = String(run.output || log).split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(-4).join(" ").slice(0, 500);
    diagnostics.push({ line: null, message: summary || `LaTeX exited with code ${run.code}.` });
  }
  return {
    ok,
    engine: path.basename(executable),
    source_path: sourcePath,
    pdf_path: hasPdf ? path.relative(root, absolutePdf).split(path.sep).join("/") : "",
    duration_ms: Date.now() - startedAt,
    diagnostics,
    log: String(run.output || log).slice(-12_000),
  };
}

module.exports = {
  DEFAULT_DOCUMENT,
  PAPER_EXTENSIONS,
  compileLatexDocument,
  createLatexDirectory,
  createLatexFile,
  createLatexProject,
  findExecutable,
  importLatexProject,
  listLatexProjects,
  normalizePaperPath,
  parseLatexDiagnostics,
  runCompiler,
};
