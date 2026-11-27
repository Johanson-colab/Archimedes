const path = require('node:path');
let root = '';
const names = { codex: 'codex', claude: 'claude', opencode: 'opencode', antigravity: 'agy' };
function initialize(userData) { root = path.join(userData, 'harnesses'); }
function binaryPath(backend, platform = process.platform) {
  if (!Object.hasOwn(names, backend)) throw new Error('Unknown native harness.');
  return root ? path.join(root, backend, names[backend] + (platform === 'win32' ? '.exe' : '')) : '';
}
module.exports = { initialize, binaryPath, names };
