const { createCipheriv, createDecipheriv, randomBytes } = require("node:crypto");

const key = randomBytes(32);

module.exports = {
  isEncryptionAvailable: () => true,
  encryptString(value) {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const content = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return Buffer.concat([iv, cipher.getAuthTag(), content]);
  },
  decryptString(bytes) {
    const cipher = createDecipheriv("aes-256-gcm", key, bytes.subarray(0, 12));
    cipher.setAuthTag(bytes.subarray(12, 28));
    return Buffer.concat([cipher.update(bytes.subarray(28)), cipher.final()]).toString("utf8");
  },
};
