const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { readLines, searchWorkspace, prepareWrite, prepareEdit, applyApprovedWrite, readCommandLog } = require('./workspace-tools.cjs');
const agent = require('../agent.cjs');
const store = require('../store.cjs');

function directory(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-workspace-tools-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function call(name, args) { return { id: name, function: { name, arguments: JSON.stringify(args) } }; }

test('line ranges handle large text and explicit pagination', t => {
  const root = directory(t);
  const lines = Array.from({ length: 1000 }, (_, i) => `line ${i + 1} ${'x'.repeat(90)}`);
  fs.writeFileSync(path.join(root, 'large.txt'), lines.join('\n'));
  const result = readLines(root, 'large.txt', 450, 452);
  assert.equal(result.start_line, 450);
  assert.equal(result.end_line, 452);
  assert.equal(result.next_line, 453);
  assert.match(result.content, /^line 450/);
  assert.throws(() => readLines(root, 'large.txt', 0, 2), /valid line range/);
  assert.throws(() => readLines(root, '../outside', 1, 2), /outside/);
});

test('workspace search finds literal line matches while skipping hidden and linked files', { skip: process.platform === 'win32' }, t => {
  const root = directory(t), external = directory(t);
  fs.mkdirSync(path.join(root, 'src'));
  fs.writeFileSync(path.join(root, 'src/a.txt'), 'first\nNeedle here\nlast');
  fs.writeFileSync(path.join(root, '.secret'), 'Needle hidden');
  fs.writeFileSync(path.join(external, 'outside.txt'), 'Needle outside');
  fs.symlinkSync(external, path.join(root, 'linked'));
  const result = searchWorkspace(root, { query: 'needle' });
  assert.deepEqual(result.matches.map(({ path, line }) => [path, line]), [['src/a.txt', 2]]);
  assert.deepEqual(searchWorkspace(root, { query: 'needle', caseSensitive: true }).matches, []);
  assert.throws(() => searchWorkspace(root, { query: 'needle', directory: 'linked' }), /outside/);
});

test('precise edit requires a unique match and detects changes before approval', t => {
  const root = directory(t), file = path.join(root, 'code.py');
  fs.writeFileSync(file, 'alpha\nbeta\nalpha\n');
  assert.throws(() => prepareEdit(root, 'code.py', 'alpha', 'new'), /matched 2/);
  const proposal = prepareEdit(root, 'code.py', 'beta', 'gamma');
  assert.equal(proposal.replacementCount, 1);
  assert.deepEqual(proposal.editPreview, { before: 'beta', after: 'gamma' });
  assert.equal(fs.readFileSync(file, 'utf8'), 'alpha\nbeta\nalpha\n');
  fs.writeFileSync(file, 'changed by someone else\n');
  assert.throws(() => applyApprovedWrite(proposal), error => error.code === 'WORKSPACE_CONFLICT');
  assert.equal(fs.readFileSync(file, 'utf8'), 'changed by someone else\n');
  const fresh = prepareEdit(root, 'code.py', 'someone else', 'reviewer');
  applyApprovedWrite(fresh);
  assert.equal(fs.readFileSync(file, 'utf8'), 'changed by reviewer\n');
});

test('approval applies the edit to the project workspace, even when its data store is elsewhere', async t => {
  const data = directory(t), project = directory(t);
  fs.writeFileSync(path.join(project, 'paper.py'), 'a = 1\nb = 2\n');
  store.openWorkspace(data);
  const task = store.startTask({ prompt: 'edit' });
  const thread = store.createResearchThread({ prompt: 'edit', mode: 'free-chat', workspacePath: project });
  const result = await agent.executeTool({ root: project, taskId: task.id, threadId: thread.id, call: call('edit_workspace_file', { path: 'paper.py', old_text: 'b = 2', new_text: 'b = 3' }), capabilities: { write: 'ask' }, emit: event => {
    if (event.type === 'approval') {
      assert.equal(fs.readFileSync(path.join(project, 'paper.py'), 'utf8'), 'a = 1\nb = 2\n');
      assert.equal(event.action.payload.change.status, 'modified');
      store.approveAction(event.action.id);
      agent.resolveApproval(event.action.id, true);
    }
  } });
  assert.equal(JSON.parse(result.content).approved, true);
  assert.equal(fs.readFileSync(path.join(project, 'paper.py'), 'utf8'), 'a = 1\nb = 3\n');
  assert.equal(fs.existsSync(path.join(data, 'paper.py')), false);
});

test('new files created while awaiting approval and symlinked paths are preserved', { skip: process.platform === 'win32' }, t => {
  const root = directory(t), outside = directory(t);
  const proposal = prepareWrite(root, 'new.txt', 'agent');
  fs.writeFileSync(path.join(root, 'new.txt'), 'external');
  assert.throws(() => applyApprovedWrite(proposal), error => error.code === 'WORKSPACE_CONFLICT');
  assert.equal(fs.readFileSync(path.join(root, 'new.txt'), 'utf8'), 'external');
  fs.writeFileSync(path.join(outside, 'new.txt'), 'outside');
  fs.symlinkSync(outside, path.join(root, 'link'));
  assert.throws(() => prepareWrite(root, 'link/new.txt', 'agent'), /symbolic link/);
  assert.throws(() => readLines(root, 'link/new.txt'), /outside/);
});

test('approved writes create new nested files and rejected edits leave their source untouched', async t => {
  const root = directory(t);
  applyApprovedWrite(prepareWrite(root, 'notes/new.md', 'first draft'));
  assert.equal(fs.readFileSync(path.join(root, 'notes/new.md'), 'utf8'), 'first draft');
  store.openWorkspace(root);
  const task = store.startTask({ prompt: 'edit' });
  const thread = store.createResearchThread({ prompt: 'edit', mode: 'free-chat' });
  const result = await agent.executeTool({ root, taskId: task.id, threadId: thread.id, call: call('edit_workspace_file', { path: 'notes/new.md', old_text: 'first', new_text: 'second' }), capabilities: { write: 'ask' }, emit: event => {
    if (event.type === 'approval') { store.resolveAction(event.action.id, 'rejected'); agent.resolveApproval(event.action.id, false); }
  } });
  assert.equal(JSON.parse(result.content).approved, false);
  assert.equal(fs.readFileSync(path.join(root, 'notes/new.md'), 'utf8'), 'first draft');
});

test('command log pages preserve UTF-8 characters at byte boundaries', t => {
  const root = directory(t);
  const relative = '.archimedes/agent-command-logs/01234567-89ab-cdef-0123-456789abcdef.log';
  fs.mkdirSync(path.dirname(path.join(root, relative)), { recursive: true });
  fs.writeFileSync(path.join(root, relative), '中abc');
  const first = readCommandLog(root, relative, 0, 1);
  assert.equal(first.content, '中');
  assert.equal(first.next_offset, 3);
  assert.equal(readCommandLog(root, relative, first.next_offset, 8).content, 'abc');
});
