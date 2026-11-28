/**
 * Per-reproduction environment variables (API keys, tokens).
 *
 * Values are encrypted with the OS keychain-backed codec, the same one the SSH
 * passwords use, and never leave the main process: the renderer only ever learns
 * whether a variable is set. The agent sees names too, never values.
 */

const fs = require("node:fs");
const path = require("node:path");

const FILE_NAME = "reproduction-env.json";
const MAX_VALUE_CHARS = 12_000;
const MAX_VARS = 40;
const NAME = /^[A-Z_][A-Z0-9_]{0,63}$/;

let filePath = "";
let codec = { encrypt: () => "", decrypt: () => "" };

function initialize(userDataDir, provided = null) {
  filePath = path.join(String(userDataDir || ""), FILE_NAME);
  if (provided?.encrypt && provided?.decrypt) codec = provided;
}

function requirePath() {
  if (!filePath) throw new Error("Reproduction environment storage is not initialised yet.");
  return filePath;
}

function read() {
  try {
    const parsed = JSON.parse(fs.readFileSync(requirePath(), "utf8"));
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function write(data) {
  const target = requirePath();
  const temporary = `${target}.${process.pid}.tmp`;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`, { mode: 0o600 });
  fs.renameSync(temporary, target);
  try { fs.chmodSync(target, 0o600); } catch { /* Windows ignores POSIX modes. */ }
}

function normalizeName(value) {
  const name = String(value || "").trim().toUpperCase();
  if (!NAME.test(name)) throw new Error("A variable name must look like HF_TOKEN (letters, digits, underscore).");
  return name;
}

function scopeKey({ workspace, ownerId, id } = {}) {
  if (!workspace || !ownerId || !id) throw new Error("Open a data workspace before using reproduction credentials.");
  // Legacy entries use a bare reproduction ID. A copied database cannot prove
  // which directory previously owned those values, so keep that bucket intact.
  return JSON.stringify([workspace, ownerId, id]);
}

/** Names and whether they have a value. Never the values themselves. */
function list(scope) {
  const bucket = read()[scopeKey(scope)] || {};
  return Object.entries(bucket).map(([name, cipher]) => ({ name, hasValue: Boolean(cipher) }));
}

function setValue(scope, name, value) {
  const id = scopeKey(scope);
  const key = normalizeName(name);
  const text = String(value ?? "");
  if (!text) {
    return removeValue(scope, key);
  }
  if (text.length > MAX_VALUE_CHARS) throw new Error("That value is too long to store.");
  const data = read();
  const bucket = data[id] && typeof data[id] === "object" ? data[id] : {};
  if (!Object.hasOwn(bucket, key) && Object.keys(bucket).length >= MAX_VARS) {
    throw new Error(`At most ${MAX_VARS} variables can be stored for one reproduction.`);
  }
  const cipher = codec.encrypt(text);
  if (!cipher) {
    throw new Error("This machine cannot store secrets securely, so the value was not saved.");
  }
  bucket[key] = cipher;
  data[id] = bucket;
  write(data);
  return list(scope);
}

function removeValue(scope, name) {
  const id = scopeKey(scope);
  const key = normalizeName(name);
  const data = read();
  if (!data[id]) return [];
  delete data[id][key];
  if (!Object.keys(data[id]).length) delete data[id];
  write(data);
  return list(scope);
}

/** Decrypted values, for injection into a run. Never exposed over IPC. */
function values(scope) {
  const bucket = read()[scopeKey(scope)] || {};
  const out = {};
  for (const [name, cipher] of Object.entries(bucket)) {
    if (!cipher) continue;
    const value = codec.decrypt(cipher);
    if (value) out[name] = value;
  }
  return out;
}

module.exports = {
  FILE_NAME,
  MAX_VALUE_CHARS,
  initialize,
  list,
  normalizeName,
  removeValue,
  setValue,
  values,
};
