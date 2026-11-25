const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const { isDeepStrictEqual } = require("node:util");

function secretCodec(safeStorage) {
  const available = () => Boolean(safeStorage?.isEncryptionAvailable() && safeStorage.getSelectedStorageBackend?.() !== "basic_text");
  return {
    available,
    encrypt(value) {
      if (!available()) throw new Error("System encryption is unavailable. The secret was not saved.");
      return safeStorage.encryptString(value).toString("base64");
    },
    decrypt(ciphertext) {
      if (!available()) throw new Error("System encryption is unavailable. The secret could not be opened.");
      return safeStorage.decryptString(Buffer.from(ciphertext, "base64"));
    },
  };
}

function writePrivateJson(file, data, verify) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + "." + randomUUID() + ".tmp";
  try {
    fs.writeFileSync(temp, JSON.stringify(data), { mode: 0o600, flag: "wx" });
    if (verify) verify(JSON.parse(fs.readFileSync(temp, "utf8")));
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

function settingsSecrets(safeStorage, transform) {
  const codec = secretCodec(safeStorage);
  const open = (value) => {
    if (value == null || typeof value === "string") return value;
    if (typeof value.ciphertext !== "string") throw new Error("Encrypted settings contain an invalid secret.");
    return codec.decrypt(value.ciphertext);
  };
  return {
    available: codec.available,
    open(data) { return transform(data, open); },
    hasPlaintext(data) {
      let found = false;
      transform(data, value => { if (typeof value === "string" && value) found = true; return value; });
      return found;
    },
    write(file, data) {
      const encoded = transform(data, value => value ? { ciphertext: codec.encrypt(value) } : value);
      writePrivateJson(file, encoded, saved => {
        if (!isDeepStrictEqual(transform(saved, open), JSON.parse(JSON.stringify(data)))) {
          throw new Error("Encrypted settings could not be verified. The original file was kept.");
        }
      });
    },
  };
}

module.exports = { secretCodec, settingsSecrets, writePrivateJson };
