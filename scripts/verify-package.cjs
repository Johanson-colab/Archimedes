/**
 * Fail packaging when the packed app.asar is missing production dependencies.
 *
 * electron-builder collects node_modules from the locally installed tree. When
 * that tree is stale, junctioned, or otherwise inconsistent with the lockfile,
 * the collector can silently drop transitive packages and still produce an
 * installer. The resulting app crashes on launch with "Cannot find module ...".
 * v0.1.0 shipped that way: jsdom was packed without tough-cookie.
 *
 * This walks the dependency graph inside the finished asar, resolving every
 * package the way Node would, and fails if a required package is absent.
 *
 * Runs as an electron-builder afterPack hook, or standalone:
 *   node scripts/verify-package.cjs release/win-unpacked/resources/app.asar
 */
const fs = require("node:fs");
const path = require("node:path");

function normalize(p) {
  return p.split("\\").join("/").replace(/^\/+/, "").replace(/\/+$/, "");
}

/** Directories Node searches, nearest first: <pkg>/node_modules, parent, ... app root. */
function searchDirs(fromDir) {
  const dirs = [];
  let dir = fromDir;
  for (;;) {
    dirs.push(dir);
    if (!dir) break;
    const marker = dir.lastIndexOf("node_modules/");
    if (marker === -1) break;
    dir = dir.slice(0, marker).replace(/\/$/, "");
  }
  return dirs;
}

function verify(asarPath) {
  const asar = require("@electron/asar");
  const entries = new Set(asar.listPackage(asarPath).map(normalize));
  const readJson = (p) => JSON.parse(asar.extractFile(asarPath, p.split("/").join("\\")).toString("utf8"));

  const root = readJson("package.json");
  const failures = [];
  const optionalMissing = [];
  const visited = new Set();
  const seenEdges = new Set();
  let checked = 0;

  function visit(fromDir, name, requiredBy, optional) {
    const edge = `${fromDir}::${name}`;
    if (seenEdges.has(edge)) return;
    seenEdges.add(edge);

    const found = searchDirs(fromDir)
      .map((dir) => `${dir ? dir + "/" : ""}node_modules/${name}`)
      .find((candidate) => entries.has(candidate + "/package.json"));

    if (!found) {
      const entry = `${name} (required by ${requiredBy})`;
      if (optional) optionalMissing.push(entry);
      else failures.push(entry);
      return;
    }
    if (visited.has(found)) return;
    visited.add(found);
    checked += 1;

    const pkg = readJson(found + "/package.json");
    const deps = pkg.dependencies || {};
    const optionalDeps = pkg.optionalDependencies || {};
    for (const child of new Set([...Object.keys(deps), ...Object.keys(optionalDeps)])) {
      visit(found, child, `${name}@${pkg.version || "?"}`, Object.hasOwn(optionalDeps, child));
    }
  }

  for (const name of Object.keys(root.dependencies || {})) visit("", name, `app@${root.version || "?"}`, false);

  if (failures.length) {
    const shown = failures.slice(0, 40).map((entry) => `  - ${entry}`).join("\n");
    const more = failures.length > 40 ? `\n  ...and ${failures.length - 40} more` : "";
    throw new Error(
      `Packaged app is missing ${failures.length} required module(s) in ${asarPath}:\n${shown}${more}\n` +
        "Reinstall dependencies from the lockfile (npm ci) and pack again.",
    );
  }

  const optionalNote = optionalMissing.length ? `; ${optionalMissing.length} optional package(s) not packed` : "";
  console.log(`verify-package: ${checked} packages resolved from ${path.basename(asarPath)}${optionalNote}`);
  return { checked, failures, optionalMissing };
}

module.exports = async function afterPack(context) {
  const asarPath = path.join(context.appOutDir, "resources", "app.asar");
  if (!fs.existsSync(asarPath)) throw new Error(`verify-package: app.asar not found at ${asarPath}`);
  verify(asarPath);
};

module.exports.verify = verify;

if (require.main === module) {
  const target = path.resolve(process.argv[2] || path.join("release", "win-unpacked", "resources", "app.asar"));
  if (!fs.existsSync(target)) {
    console.error(`verify-package: ${target} does not exist`);
    process.exit(2);
  }
  try {
    verify(target);
  } catch (error) {
    console.error(String(error && error.message ? error.message : error));
    process.exit(1);
  }
}
