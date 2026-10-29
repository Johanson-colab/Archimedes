// Coding agents usually write files through shell commands instead of a
// dedicated write tool. Journey's evidence ledger needs to understand both
// shapes, otherwise a trace that rewrote a whole project reports "0 files".

const WRITE_TOOL = /write|edit|patch|replace|create_file|file_change|apply/i;
const SHELL_TOOL = /^(?:bash|sh|shell|zsh|run|run_command|execute|exec|terminal|command)$/i;

const SYSTEM_PATH = /^(?:\/dev\/|\/proc\/|\/sys\/|\/tmp\/|\/var\/tmp\/)/;
const UNSAFE_PATH = /[*?$<>|&()`]/;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asText(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function normalizeEvidencePath(raw: string): string {
  let path = raw.trim().replace(/^['"`]+/, "").replace(/['"`]+$/, "");
  if (!path) return "";
  if (SYSTEM_PATH.test(path)) return "";
  if (UNSAFE_PATH.test(path)) return "";
  path = path.replace(/^file:\/\//, "").replace(/^\.\//, "");
  path = path.replace(/^\/workspace\//, "").replace(/^workspace\//, "");
  path = path.replaceAll("\\", "/");
  if (!path || path === "." || path === "/") return "";
  return path.replace(/\/+$/, "");
}

// Drop heredoc bodies so C/Python operators such as `x > 3` are not read as
// shell redirections. The heredoc opener stays on its line.
function stripHeredocBodies(command: string): string {
  const lines = command.split(/\r?\n/);
  const kept: string[] = [];
  let marker: string | null = null;
  for (const line of lines) {
    if (marker) {
      if (line.trim() === marker) marker = null;
      continue;
    }
    kept.push(line);
    const match = line.match(/<<-?\s*['"]?([A-Za-z_][A-Za-z0-9_]*)['"]?/);
    if (match) marker = match[1];
  }
  return kept.join("\n");
}

// Split on real shell separators only; `|`, `;`, `&&` inside quotes belong to
// the command's payload (PHP snippets, sed scripts, python -c, ...).
function splitSegments(source: string): string[] {
  const segments: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (quote) {
      current += character;
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      current += character;
      continue;
    }
    if (character === "\n" || character === ";") {
      segments.push(current);
      current = "";
      continue;
    }
    if (character === "&" && source[index + 1] === "&") {
      segments.push(current);
      current = "";
      index += 1;
      continue;
    }
    if (character === "|") {
      segments.push(current);
      current = "";
      if (source[index + 1] === "|") index += 1;
      continue;
    }
    current += character;
  }
  segments.push(current);
  return segments;
}

// Quote-aware `>` / `>>` / `>|` scanner, so operators inside quoted payloads
// (`python3 -c "... x > 0.05 ..."`) are not mistaken for file writes.
function redirectionTargets(source: string): string[] {
  const targets: string[] = [];
  let quote: string | null = null;
  for (let index = 0; index < source.length; index++) {
    const character = source[index];
    if (quote) {
      if (character === quote) quote = null;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (character !== ">") continue;
    let cursor = index + 1;
    if (source[cursor] === ">" || source[cursor] === "|") cursor += 1;
    while (cursor < source.length && /\s/.test(source[cursor])) cursor += 1;
    if (source[cursor] === "&") {
      index = cursor;
      continue;
    }
    let target = "";
    if (source[cursor] === "'" || source[cursor] === '"') {
      const closing = source[cursor];
      cursor += 1;
      while (cursor < source.length && source[cursor] !== closing) {
        target += source[cursor];
        cursor += 1;
      }
    } else {
      while (cursor < source.length && !/[\s;&|<>()`]/.test(source[cursor])) {
        target += source[cursor];
        cursor += 1;
      }
    }
    index = cursor;
    if (target) targets.push(target);
  }
  return targets;
}

function shellTokens(segment: string): string[] {  const tokens: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const character of segment) {
    if (quote) {
      if (character === quote) quote = null;
      else current += character;
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
      continue;
    }
    if (/\s/.test(character)) {
      if (current) {
        tokens.push(current);
        current = "";
      }
      continue;
    }
    current += character;
  }
  if (current) tokens.push(current);
  return tokens;
}

function addTarget(targets: string[], raw: string | undefined): void {
  if (!raw) return;
  const path = normalizeEvidencePath(raw);
  if (path) targets.push(path);
}

export function shellWriteTargets(command: string): string[] {
  const source = stripHeredocBodies(asText(command));
  if (!source.trim()) return [];
  const targets: string[] = [];
  for (const target of redirectionTargets(source)) addTarget(targets, target);

  for (const segment of splitSegments(source)) {
    const tokens = shellTokens(segment);
    if (!tokens.length) continue;
    const commandName = tokens[0].split("/").pop() || tokens[0];

    if (commandName === "tee") {
      for (const token of tokens.slice(1)) if (!token.startsWith("-")) addTarget(targets, token);
      continue;
    }

    if (commandName === "sed" && tokens.some((token) => /^-i/.test(token))) {
      const positional = tokens.slice(1).filter((token) => !token.startsWith("-"));
      for (const token of positional.slice(1)) addTarget(targets, token);
      continue;
    }

    if (commandName === "cp" || commandName === "mv" || commandName === "install") {
      const positional = tokens.slice(1).filter((token) => !token.startsWith("-"));
      if (positional.length >= 2) addTarget(targets, positional.at(-1));
      continue;
    }

    if (commandName === "touch") {
      for (const token of tokens.slice(1)) if (!token.startsWith("-")) addTarget(targets, token);
    }
  }

  return [...new Set(targets)];
}

const PATCH_FILE = /^\*\*\* (?:Add|Update|Delete) File:\s*(.+)$/gm;
const DIFF_FILE = /^\+\+\+ (?:b\/)?(.+)$/gm;

export function patchTargets(content: string): string[] {
  const text = asText(content);
  if (!text.trim()) return [];
  const targets: string[] = [];
  let match: RegExpExecArray | null;
  PATCH_FILE.lastIndex = 0;
  while ((match = PATCH_FILE.exec(text))) addTarget(targets, match[1]);
  DIFF_FILE.lastIndex = 0;
  while ((match = DIFF_FILE.exec(text))) {
    if (!match[1].startsWith("/dev/null")) addTarget(targets, match[1]);
  }
  return [...new Set(targets)];
}

function explicitPaths(value: unknown, paths: string[], depth = 0): void {
  if (!value || typeof value !== "object" || depth > 4) return;
  if (Array.isArray(value)) {
    for (const item of value) explicitPaths(item, paths, depth + 1);
    return;
  }
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (["path", "file", "filePath", "file_path", "target_file", "targetFile", "filename"].includes(key) && typeof entry === "string") {
      addTarget(paths, entry);
    } else if (key === "files" || key === "changes") {
      explicitPaths(entry, paths, depth + 1);
    }
  }
}

function patchContent(args: Record<string, unknown>): string {
  for (const key of ["patch", "diff", "input"]) {
    const value = asText(args[key]);
    if (value) return value;
  }
  const content = asText(args.content);
  return content.includes("*** Begin Patch") || content.includes("\n+++ ") || content.startsWith("+++ ") ? content : "";
}

export function toolNameOf(payload: unknown): string {
  return asText(asRecord(payload).name);
}

export function toolArgumentsOf(payload: unknown): Record<string, unknown> {
  return asRecord(asRecord(payload).arguments);
}

export function artifactPaths(toolName: string, args: Record<string, unknown>): string[] {
  const name = asText(toolName);
  if (!name) return [];
  if (WRITE_TOOL.test(name)) {
    const paths: string[] = [];
    explicitPaths(args, paths);
    for (const path of patchTargets(patchContent(args))) paths.push(path);
    return [...new Set(paths)];
  }
  if (SHELL_TOOL.test(name) || name === "bash") {
    const command = asText(args.command);
    return command ? shellWriteTargets(command) : [];
  }
  return [];
}

// Every path a tool call or result mentions or writes. Used for the "Files"
// counter, while `artifactPaths` only reports produced files.
export function collectTouchedPaths(payload: unknown): Set<string> {
  const files = new Set<string>();
  const walk = (value: unknown, depth: number) => {
    if (!value || typeof value !== "object" || depth > 5) return;
    if (Array.isArray(value)) {
      for (const item of value) walk(item, depth + 1);
      return;
    }
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (["path", "file", "filePath", "file_path", "target_file", "targetFile", "filename"].includes(key) && typeof entry === "string") {
        const path = normalizeEvidencePath(entry);
        if (path) files.add(path);
      } else if (key === "files" || key === "changes") {
        walk(entry, depth + 1);
      } else if (key === "command" && typeof entry === "string") {
        for (const path of shellWriteTargets(entry)) files.add(path);
      } else if (["patch", "diff", "input"].includes(key) && typeof entry === "string") {
        for (const path of patchTargets(entry)) files.add(path);
      } else {
        walk(entry, depth + 1);
      }
    }
  };
  walk(payload, 0);
  return files;
}
