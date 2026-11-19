const fs = require('node:fs');
const path = require('node:path');

let currentVault = null;
function setEnvironmentVault(vault) { currentVault = vault; }
function getSharedEnvironment() { return currentVault ? currentVault.shared() : {}; }

function createEnvironmentVault({ directory, safeStorage }) {
  const file = path.join(directory, 'environment-vault.json');
  const validateName = (name) => {
    if (typeof name !== 'string' || !/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name)) throw new Error('Variable names must start with a letter or underscore and contain only letters, numbers, and underscores.');
    return name;
  };
  function read() {
    try {
      const value = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (value.version !== 1 || !value.entries || typeof value.entries !== 'object' || Array.isArray(value.entries)) throw new Error('Invalid vault');
      return value.entries;
    } catch (error) {
      if (error.code === 'ENOENT') return {};
      throw new Error('Could not read the environment vault.');
    }
  }
  function write(entries) {
    fs.mkdirSync(directory, { recursive: true });
    const temp = `${file}.${process.pid}.${require('node:crypto').randomUUID()}.tmp`;
    try { fs.writeFileSync(temp, JSON.stringify({ version: 1, entries }), { mode: 0o600, flag: 'wx' }); fs.renameSync(temp, file); }
    finally { try { fs.unlinkSync(temp); } catch {} }
  }
  function list() { const entries = read(); return Object.keys(entries).sort().map(name => ({ name, shared: Boolean(entries[name]?.shared) })); }
  function save({ name, value, shared = false } = {}) {
    validateName(name);
    if (typeof value !== 'string' || !value.trim() || value.length > 10000 || value.includes('\0')) throw new Error('Enter a non-empty value of at most 10000 characters.');
    if (!safeStorage.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === 'basic_text') throw new Error('System encryption is unavailable; the variable was not saved.');
    if (shared && !/(?:_API_KEY|_TOKEN)$/.test(name)) throw new Error('Only names ending in _API_KEY or _TOKEN can be shared with agents and runs.');
    const entries = read();
    Object.defineProperty(entries, name, { value: { encrypted: safeStorage.encryptString(value).toString('base64'), shared: Boolean(shared) }, enumerable: true, configurable: true, writable: true });
    write(entries);
    return list();
  }
  function remove(name) { validateName(name); const entries = read(); delete entries[name]; write(entries); return list(); }
  function get(name) {
    validateName(name);
    const entry = read()[name];
    if (!entry) return "";
    try { return safeStorage.decryptString(Buffer.from(entry.encrypted, "base64")); }
    catch { throw new Error(`Could not decrypt environment variable ${name}.`); }
  }
  function shared() {
    const result = Object.create(null);
    for (const [name, entry] of Object.entries(read())) {
      if (!entry?.shared || !/(?:_API_KEY|_TOKEN)$/.test(name)) continue;
      try { result[name] = safeStorage.decryptString(Buffer.from(entry.encrypted, 'base64')); }
      catch { throw new Error(`Could not decrypt environment variable ${name}.`); }
    }
    return result;
  }
  return { list, save, remove, shared, get };
}
module.exports = { createEnvironmentVault, setEnvironmentVault, getSharedEnvironment };
