// Evaluate electron-builder's real dependency matcher against installed bytes.
// This does not build or launch another application and never deletes dependencies.
const fs = require("node:fs");
const path = require("node:path");
const { getNodeModuleFileMatcher } = require("app-builder-lib/out/fileMatcher");
const root = path.join(__dirname, "..");
const config = require("../electron-builder.config.cjs");
const filter = getNodeModuleFileMatcher(root, "/unused-destination", value => value, {}, { config, debugLogger: { isEnabled: false } }).createFilter();
function bytes(directory) {
  let total = 0, kept = 0, files = 0;
  for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
    const file = path.join(directory, item.name);
    if (item.isDirectory()) { const next = bytes(file); total += next.total; kept += next.kept; files += next.files; }
    else if (item.isFile()) { const stat = fs.statSync(file); total += stat.size; files++; if (filter(file, stat)) kept += stat.size; }
  }
  return { total, kept, files };
}
const onnx = bytes(path.join(root, "node_modules/onnxruntime-node"));
const wasmFiles = fs.existsSync(path.join(root, "dist/assets")) ? fs.readdirSync(path.join(root, "dist/assets")).filter(file => file.endsWith(".wasm")).map(file => ({ file, bytes: fs.statSync(path.join(root, "dist/assets", file)).size })) : [];
const version = name => JSON.parse(fs.readFileSync(path.join(root, "node_modules", name, "package.json"), "utf8")).version;
console.log(JSON.stringify({ scope: "installed ONNX dependency bytes selected by electron-builder dependency matcher; not final installer size", onnxruntimeNode: onnx, excludedBytes: onnx.total - onnx.kept, rendererWasm: wasmFiles, sourceDependencyVersions: { transformers: version("@huggingface/transformers"), onnxruntimeNode: version("onnxruntime-node") } }, null, 2));
if (onnx.kept !== 0) process.exitCode = 1;
