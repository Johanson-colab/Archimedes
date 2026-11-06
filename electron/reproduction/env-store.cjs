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

function normalizeReproductionId(value) {
  const id = String(value || "").trim();
  if (!id) throw new Error("A reproduction id is required.");
  return id;
}

/** Names and whether they have a value. Never the values themselves. */
function list(reproductionId) {
  const bucket = read()[normalizeReproductionId(reproductionId)] || {};
  return Object.entries(bucket).map(([name, cipher]) => ({ name, hasValue: Boolean(cipher) }));
}

function setValue(reproductionId, name, value) {
  const id = normalizeReproductionId(reproductionId);
  const key = normalizeName(name);
  const text = String(value ?? "");
  if (!text) {
    removeValue(id, key);
    return list(id);
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
  return list(id);
}

function removeValue(reproductionId, name) {
  const id = normalizeReproductionId(reproductionId);
  const key = normalizeName(name);
  const data = read();
  if (!data[id]) return [];
  delete data[id][key];
  if (!Object.keys(data[id]).length) delete data[id];
  write(data);
  return list(id);
}

/** Decrypted values, for injection into a run. Never exposed over IPC. */
function values(reproductionId) {
  const bucket = read()[normalizeReproductionId(reproductionId)] || {};
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
