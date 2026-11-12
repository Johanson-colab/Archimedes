const { spawnSync } = require("node:child_process");
const path = require("node:path");

const candidates = process.platform === "win32" ? [["py", "-3"], ["python"], ["python3"]] : [["python3"], ["python"]];
const python = candidates.find(([executable, ...args]) => {
  const probe = spawnSync(executable, [...args, "-c", "import sys; sys.exit(0 if sys.version_info >= (3, 10) else 1)"], { windowsHide: true, timeout: 5000, stdio: "ignore" });
  return !probe.error && probe.status === 0;
});
if (!python) {
  console.error("Gallery maintenance requires Python 3.10 or newer. Install Python and enable its PATH entry or the Windows py launcher. Python is not required to start Archimedes.");
  process.exit(1);
}
const [executable, ...prefix] = python;
const result = spawnSync(executable, [...prefix, path.join(__dirname, "gallery-pipeline.py"), ...process.argv.slice(2)], {
  stdio: "inherit", windowsHide: true, env: { ...process.env, PYTHONUTF8: "1" },
});
if (result.error) console.error(result.error.message);
process.exit(result.status ?? 1);
