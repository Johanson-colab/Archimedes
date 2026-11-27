const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { electronBinary } = require('./electron-runtime.cjs');

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
