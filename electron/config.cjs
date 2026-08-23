const fs = require("node:fs");
const path = require("node:path");

function loadLocalAgentEnvironment() {
  const envPath = path.join(__dirname, "..", ".env.local");
  if (!fs.existsSync(envPath)) return;

  const currentPrefix = "ARCHIMEDES_";
  const legacyPrefix = ["AX", "IOM_"].join("");
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z][A-Z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (!match) continue;
    const prefix = [currentPrefix, legacyPrefix].find((candidate) => match[1].startsWith(candidate));
    if (!prefix) continue;
    const canonicalKey = `${currentPrefix}${match[1].slice(prefix.length)}`;
    if (process.env[canonicalKey]) continue;
    process.env[canonicalKey] = match[2].replace(/^(["'])(.*)\1$/, "$2");
  }
}

module.exports = { loadLocalAgentEnvironment };
