const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");

function secretCodec(safeStorage) {
  return {
    encrypt(value) {
      if (!safeStorage?.isEncryptionAvailable() || safeStorage.getSelectedStorageBackend?.() === "basic_text")
        throw new Error("System encryption is unavailable. The secret was not saved.");
      return safeStorage.encryptString(value).toString("base64");
    },
    decrypt(ciphertext) {
      return safeStorage.decryptString(Buffer.from(ciphertext, "base64"));
    },
  };
}

function writePrivateJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = file + "." + randomUUID() + ".tmp";
  try {
    fs.writeFileSync(temp, JSON.stringify(data), { mode: 0o600, flag: "wx" });
    fs.renameSync(temp, file);
  } finally {
    fs.rmSync(temp, { force: true });
  }
}

module.exports = { secretCodec, writePrivateJson };
