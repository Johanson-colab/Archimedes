const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
function electronBinary() {
  const moduleRoot = path.dirname(require.resolve('electron/package.json'));
  const relative = fs.readFileSync(path.join(moduleRoot, 'path.txt'), 'utf8').trim();
  const binary = path.join(moduleRoot, 'dist', relative);
  if (!fs.existsSync(binary)) throw new Error('Install the locked Electron desktop runtime before running the resource audit.');
  return binary;
}

const directory = process.argv[2];
if (!directory || !fs.existsSync(path.join(directory, 'entry.cjs'))) {
  console.error('Pass the audit directory produced by prepare-semantic-worker-audit.cjs.');
  process.exitCode = 1;
} else {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  const result = spawnSync(electronBinary(), [path.resolve(directory, 'entry.cjs')], { env, stdio: 'inherit', timeout: 45000 });
  if (result.error) console.error(result.error.message);
  process.exitCode = result.status ?? 1;
}
