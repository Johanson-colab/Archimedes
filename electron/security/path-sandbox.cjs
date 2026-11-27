const fs = require("node:fs");
const path = require("node:path");

function isWithinRoot(root, target) {
  const relative = path.relative(root, target);
  return relative !== ".." && !relative.startsWith(".." + path.sep) && !path.isAbsolute(relative);
}

function resolveWorkspaceTarget(root, relative, mustExist = true) {
  const realRoot = fs.realpathSync(root);
  const target = path.resolve(realRoot, relative);
  if (!isWithinRoot(realRoot, target)) throw new Error("The requested path is outside the active workspace.");
  let ancestor = target;
  if (!mustExist) {
    while (!fs.lstatSync(ancestor, { throwIfNoEntry: false })) ancestor = path.dirname(ancestor);
  }
  const resolved = fs.realpathSync(ancestor);
  if (!isWithinRoot(realRoot, resolved)) throw new Error("The requested path resolves outside the active workspace.");
  return { root: realRoot, target: path.join(resolved, path.relative(ancestor, target)) };
}

module.exports = { isWithinRoot, resolveWorkspaceTarget };
