// Focused, no-network verification of the seven pre-existing suite failures.
// All Git/SQLite fixtures live under one temporary directory removed on exit.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const repo = path.resolve(__dirname, '../../../..');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-quality-failures-'));
const physical = fs.realpathSync(temporary);
const results = { platform: process.platform, node: process.version, aliasDiffers: temporary !== physical, runs: [] };

function run(name, files, tmpdir) {
  const result = spawnSync(process.execPath, ['--test', ...files], {
    cwd: repo, env: { ...process.env, TMPDIR: tmpdir }, encoding: 'utf8', timeout: 30_000,
  });
  fs.writeFileSync(path.join(__dirname, `${name}.log`), result.stdout + result.stderr);
  results.runs.push({ name, command: ['node', '--test', ...files], tmpdirKind: tmpdir === physical ? 'physical' : 'alias', exitCode: result.status, error: result.error?.message || null });
}

try {
  run('seven-failures-alias', ['electron/git-state.test.cjs', 'electron/workspace-session-model.test.cjs', 'electron/i18n-translations.test.cjs', 'electron/terminal-shell.test.cjs'], temporary);
  run('git-physical', ['electron/git-state.test.cjs', 'electron/workspace-session-model.test.cjs'], physical);

  const fixture = path.join(temporary, 'canonical-identity');
  fs.mkdirSync(fixture);
  const git = (...args) => {
    const out = spawnSync('git', ['-C', fixture, ...args], { encoding: 'utf8' });
    if (out.status !== 0) throw new Error(out.stderr);
    return out.stdout.trim();
  };
  git('init'); git('config', 'user.email', 'test@example.com'); git('config', 'user.name', 'Fixture');
  fs.writeFileSync(path.join(fixture, 'README.md'), '# Isolated test\n');
  git('add', 'README.md'); git('commit', '-m', 'Fixture');
  const { detectGitState } = require(path.join(repo, 'electron/git-state.cjs'));
  const topLevel = git('rev-parse', '--show-toplevel');
  const store = require(path.join(repo, 'electron/store.cjs'));
  const dataRoot = path.join(physical, 'database'); fs.mkdirSync(dataRoot);
  store.openWorkspace(dataRoot);
  const project = store.createResearchProject({ name: 'Alias fixture', workspacePath: fixture });
  let worktreeError = null;
  try { store.createProjectWorkspace({ projectId: project.id, kind: 'worktree' }); } catch (error) { worktreeError = error.message; }
  results.gitIdentity = { lexicalPathsDiffer: path.resolve(topLevel) !== path.resolve(fixture), canonicalPathsEqual: fs.realpathSync(topLevel) === fs.realpathSync(fixture), aliasState: detectGitState(fixture), physicalState: detectGitState(fs.realpathSync(fixture)), worktreeError };

  const { resolveTerminalShell } = require(path.join(repo, 'electron/terminal-shell.cjs'));
  const expected = 'C:\\Program Files\\PowerShell\\7\\pwsh.exe';
  const seen = [];
  const shell = resolveTerminalShell({ platform: 'win32', env: { ProgramFiles: 'C:\\Program Files', SystemRoot: 'C:\\Windows' }, userShell: '', exists: candidate => { seen.push(candidate); return candidate === expected; } });
  results.shellSimulation = { hostSeparator: path.sep, selected: shell.shell, expected, checkedCandidates: [...new Set(seen)], targetPlatformJoin: path.win32.join('C:\\Program Files', 'PowerShell', '7', 'pwsh.exe') };
  fs.writeFileSync(path.join(__dirname, 'failure-causes.json'), `${JSON.stringify(results, null, 2)}\n`);
  console.log(JSON.stringify(results, null, 2));
} finally {
  fs.rmSync(temporary, { recursive: true, force: true });
}
