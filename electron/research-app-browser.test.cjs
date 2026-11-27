const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
test('real Chromium validates both scaffolds, repairs a failed workflow, catches JS errors and restores source', { timeout: 90000, skip: process.platform === 'linux' && !process.env.DISPLAY && !process.env.WAYLAND_DISPLAY ? 'Electron needs a display' : false }, () => {
  const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
  const output = execFileSync(require('electron'), [path.join(__dirname, '../scripts/check-research-app-delivery.cjs')], { encoding: 'utf8', timeout: 80000, maxBuffer: 100000, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const results = JSON.parse(output.trim().split('\n').at(-1));
  assert.equal(results.length, 2); assert.ok(results.every(result => result.passed)); assert.equal(results[0].repairs, 1);
});
