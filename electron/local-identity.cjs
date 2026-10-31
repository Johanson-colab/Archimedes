const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

const IDENTITY_FILE = "identity.json";
const VERSION = 1;
let identityPath = "";
let identityState = null;

function clone(value) {
  return structuredClone(value);
}

function defaultDisplayName() {
  try {
    const username = os.userInfo().username?.trim();
    if (username) return username.slice(0, 80);
  } catch {
    // userInfo can fail in restricted environments.
  }
  return "Local researcher";
}

function defaultDeviceName() {
  try {
    return (os.hostname() || "This device").slice(0, 120);
  } catch {
    return "This device";
  }
}

function createIdentity({ displayName = defaultDisplayName(), deviceName = defaultDeviceName() } = {}) {
  const now = new Date().toISOString();
  return {
    version: VERSION,
    userId: `usr_${randomUUID()}`,
    displayName: normalizeDisplayName(displayName),
    deviceId: `dev_${randomUUID()}`,
    deviceName: String(deviceName || defaultDeviceName()).trim().slice(0, 120) || defaultDeviceName(),
    createdAt: now,
    updatedAt: now,
  };
}

function normalizeDisplayName(value) {
  const name = String(value || "").replace(/\s+/g, " ").trim();
  if (!name) throw new Error("A display name is required.");
  if (name.length > 80) throw new Error("Display names must be 80 characters or fewer.");
  return name;
}

function normalizeIdentity(input, fallback) {
  const source = input && typeof input === "object" ? input : {};
  const base = fallback || createIdentity();
  return {
    version: VERSION,
    userId: typeof source.userId === "string" && source.userId.trim() ? source.userId.trim() : base.userId,
    displayName: typeof source.displayName === "string" && source.displayName.trim()
      ? source.displayName.replace(/\s+/g, " ").trim().slice(0, 80)
      : base.displayName,
    deviceId: typeof source.deviceId === "string" && source.deviceId.trim() ? source.deviceId.trim() : base.deviceId,
    deviceName: typeof source.deviceName === "string" && source.deviceName.trim()
      ? source.deviceName.trim().slice(0, 120)
      : base.deviceName,
    createdAt: typeof source.createdAt === "string" && source.createdAt ? source.createdAt : base.createdAt,
    updatedAt: typeof source.updatedAt === "string" && source.updatedAt ? source.updatedAt : base.updatedAt,
  };
}

function persist() {
  if (!identityPath || !identityState) return;
  fs.mkdirSync(path.dirname(identityPath), { recursive: true });
  const temporary = `${identityPath}.${process.pid}.tmp`;
  fs.writeFileSync(temporary, `${JSON.stringify(identityState, null, 2)}\n`, "utf8");
  fs.renameSync(temporary, identityPath);
}

function readIdentityFile() {
  if (!identityPath || !fs.existsSync(identityPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(identityPath, "utf8"));
    return normalizeIdentity(parsed);
  } catch {
    try {
      fs.renameSync(identityPath, `${identityPath}.corrupt-${Date.now()}`);
    } catch {
      // If the backup fails, still replace the corrupt file with a valid identity.
    }
    return null;
  }
}

function initialize(userDataPath) {
  identityPath = path.join(userDataPath, IDENTITY_FILE);
  identityState = readIdentityFile() || createIdentity();
  persist();
  return localIdentity();
}

function localIdentity() {
  if (!identityState) identityState = createIdentity();
  return clone(identityState);
}

function updateLocalIdentity(patch = {}) {
  if (!identityState) identityState = createIdentity();
  const next = {
    ...identityState,
    displayName: patch.displayName === undefined ? identityState.displayName : normalizeDisplayName(patch.displayName),
    updatedAt: new Date().toISOString(),
  };
  identityState = normalizeIdentity(next, identityState);
  persist();
  return localIdentity();
}

function identityFile() {
  return identityPath;
}

module.exports = {
  IDENTITY_FILE,
  createIdentity,
  identityFile,
  initialize,
  localIdentity,
  normalizeDisplayName,
  updateLocalIdentity,
};
