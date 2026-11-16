const fs = require("node:fs");
const path = require("node:path");

function toolchainError(nodeVersion, npmVersion) {
  const [major, minor] = String(nodeVersion).replace(/^v/, "").split(".").map(Number);
  const [npmMajor, npmMinor] = String(npmVersion).split(".").map(Number);
  if (!((major === 22 && minor >= 18) || major >= 24)) return "Node.js 22.18+ (22.x), or 24+ is required for the locked dependencies and native TypeScript tests.";
  if (!((npmMajor === 10 && npmMinor >= 9) || npmMajor === 11)) return "npm 10.9+ (10.x), or 11.x is required.";
  return "";
}

function checkToolchain() {
  const userAgent = process.env.npm_config_user_agent || "";
  const npmVersion = userAgent.match(/npm\/([^ ]+)/)?.[1] || require("node:child_process").execFileSync(process.platform === "win32" ? "npm.cmd" : "npm", ["--version"], { encoding: "utf8", timeout: 10000 }).trim();
  const error = toolchainError(process.versions.node, npmVersion);
  if (error) throw new Error(`${error}\nReproduction toolchain: Node ${fs.readFileSync(path.join(__dirname, "../.node-version"), "utf8").trim()}, npm 11.20.0. Then run npm ci and npm run prepare:desktop.`);
  console.log(`Toolchain ready: Node ${process.versions.node}, npm ${npmVersion}.`);
}

if (require.main === module) {
  try { checkToolchain(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { toolchainError, checkToolchain };
