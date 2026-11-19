const path = require("node:path");

function windowsEnvironmentValue(env, name) {
  const key = Object.keys(env).find((entry) => entry.toLowerCase() === name.toLowerCase());
  return key ? env[key] : "";
}

function windowsPathCandidates(executable, env = process.env) {
  return String(windowsEnvironmentValue(env, "PATH") || "")
    .split(";")
    .map((directory) => directory.trim().replace(/^"(.*)"$/, "$1"))
    .filter((directory) => path.win32.isAbsolute(directory))
    .map((directory) => path.win32.join(directory, executable));
}

module.exports = { windowsEnvironmentValue, windowsPathCandidates };
