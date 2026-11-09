const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const test = require('node:test');
const { prepareResearchSkill, skillReadActivity, SKILL_DIRS, SKILL_NAME } = require('./research-skills.cjs');

function workspace(t) {
  const root = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-skills-test-')));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
function setup(root, extra = {}) {
  const records = [], events = [];
  const skill = prepareResearchSkill({ workspace: root, backend: 'codex', thread: { id: 'thread', events: [] }, requested: 'idea-spark', recordEvent: e => records.push(e), emit: e => events.push(e), ...extra });
  return { skill, records, events };
}

test('Standard turns do not install skills or allocate a run; API research is explicit', t => {
  const root = workspace(t);
  assert.equal(setup(root, { requested: undefined }).skill, null);
  assert.deepEqual(fs.readdirSync(root), []);
  assert.throws(() => setup(root, { backend: 'unknown' }), /Unsupported/);
  assert.deepEqual(fs.readdirSync(root), []);
  assert.throws(() => setup(root, { requested: 'other' }), /Unknown/);
});

test('all native harnesses receive the complete relocatable package without credentials', t => {
  const root = workspace(t);
  for (const backend of ['codex', 'claude', 'opencode']) {
    const { skill, records, events } = setup(root, { backend });
    const directory = path.dirname(skill.skillFile);
    assert.ok(skill.skillFile.startsWith(path.join(root, SKILL_DIRS[backend])));
    assert.match(fs.readFileSync(skill.skillFile, 'utf8'), /name: archimedes-idea-spark/);
    assert.ok(fs.existsSync(path.join(directory, 'scripts/run.py')));
    assert.ok(fs.existsSync(path.join(directory, 'references/system-prompts/coherence_trace.txt')));
    assert.match(fs.readFileSync(path.join(directory, 'LICENSE'), 'utf8'), /Copyright \(c\) 2026 Happy/);
    assert.equal(fs.existsSync(path.join(directory, '.env')), false);
    assert.match(skill.instructions, /isolated contexts/);
    assert.match(skill.instructions, /native permissions/);
    assert.equal(records[0].type, 'research_skill');
    assert.equal(events[0].type, 'status');
    assert.match(events[0].detail, /files ready/);
    assert.equal(events.some(e => e.type === 'native_activity'), false);
  }
});

test('Research resumes its original run after a restart and never overwrites phase output', t => {
  const root = workspace(t);
  const original = setup(root);
  fs.mkdirSync(path.join(original.skill.runDirectory, 'phase0'));
  fs.writeFileSync(path.join(original.skill.runDirectory, 'phase0/lit_table.md'), 'preserve');
  const skillStat = fs.statSync(original.skill.skillFile);
  const resumed = setup(root, { requested: undefined, thread: { id: 'thread', events: original.records } });
  assert.equal(resumed.skill.runDirectory, original.skill.runDirectory);
  assert.equal(fs.readFileSync(path.join(resumed.skill.runDirectory, 'phase0/lit_table.md'), 'utf8'), 'preserve');
  assert.equal(fs.statSync(resumed.skill.skillFile).mtimeMs, skillStat.mtimeMs);
  const fork = setup(root, { requested: undefined, thread: { id: 'fork', events: original.records } });
  assert.notEqual(fork.skill.runDirectory, original.skill.runDirectory);
});

test('workspace changes allocate a new run and tampered persisted paths fail before traversal', t => {
  const root = workspace(t), other = workspace(t);
  const first = setup(root);
  const moved = setup(other, { requested: undefined, thread: { id: 'thread', events: first.records } });
  assert.ok(moved.skill.runDirectory.startsWith(other + path.sep));
  const events = structuredClone(first.records);
  events[0].payload.runRelative = 'ideaspark_run/../../outside';
  assert.throws(() => setup(root, { thread: { id: 'thread', events } }), /invalid/);
});

test('user-owned or modified skill folders are preserved and never silently replaced', t => {
  const root = workspace(t);
  const target = path.join(root, SKILL_DIRS.codex, SKILL_NAME);
  fs.mkdirSync(target, { recursive: true });
  fs.writeFileSync(path.join(target, 'SKILL.md'), 'user-owned');
  assert.throws(() => setup(root), /unmanaged/);
  assert.equal(fs.readFileSync(path.join(target, 'SKILL.md'), 'utf8'), 'user-owned');
  const other = workspace(t);
  const first = setup(other);
  fs.writeFileSync(first.skill.skillFile, 'edited');
  assert.throws(() => setup(other), /modified/);
  assert.equal(fs.readFileSync(first.skill.skillFile, 'utf8'), 'edited');
});

test('linked skill roots and linked run directories are rejected', { skip: process.platform === 'win32' }, t => {
  const root = workspace(t), outside = workspace(t);
  fs.symlinkSync(outside, path.join(root, '.agents'));
  assert.throws(() => setup(root), /real directory/);
  assert.deepEqual(fs.readdirSync(outside), []);
  const other = workspace(t);
  const first = setup(other);
  fs.rmdirSync(first.skill.runDirectory);
  fs.symlinkSync(outside, first.skill.runDirectory);
  assert.throws(() => setup(other, { thread: { id: 'thread', events: first.records } }), /real directory/);
});

test('read labels require a native read of the installed skill rather than just mentioning it', () => {
  const file = `/tmp/work/.agents/skills/${SKILL_NAME}/SKILL.md`;
  assert.equal(skillReadActivity({ tool: 'Read', input: { file_path: file } }).kind, 'skill');
  assert.equal(skillReadActivity({ command: `sed -n '1,160p' '${file}'` }).kind, 'skill');
  assert.equal(skillReadActivity({ command: `/bin/zsh -lc \"sed -n '1,120p' ${file}\"` }).kind, 'skill');
  assert.equal(skillReadActivity({ command: `ls '${file}'` }), null);
  assert.equal(skillReadActivity({ command: 'cat /tmp/other/SKILL.md' }), null);
  assert.equal(skillReadActivity({ tool: 'Write', input: { file_path: file } }), null);
  assert.equal(skillReadActivity({ tool: 'skill', input: { name: SKILL_NAME } }).kind, 'skill');
});

test('bundled navigator executes from a foreign cwd and reports the first stage without retrieval', t => {
  const root = workspace(t);
  const { skill } = setup(root);
  const run = spawnSync(process.platform === 'win32' ? 'python' : 'python3', [path.join(path.dirname(skill.skillFile), 'scripts/run.py'), 'next', '--dir', skill.runDirectory, '--query', 'Validation overfitting in small-budget recursive self improvement'], {
    cwd: os.tmpdir(), encoding: 'utf8', timeout: 20_000, env: { ...process.env, PYTHONDONTWRITEBYTECODE: '1' },
  });
  if (run.error?.code === 'ENOENT') return t.skip('Python is not installed');
  assert.equal(run.status, 0, run.stderr);
  assert.match(run.stdout, /phase0/);
  assert.match(run.stdout, /phase0 --query/);
  assert.deepEqual(fs.readdirSync(skill.runDirectory), []);
});

test('API Research installs and resumes its own IdeaSpark package', t => {
  const root = workspace(t);
  const first = setup(root, { backend: 'api' });
  assert.match(first.skill.instructions, /run_isolated_phase/);
  assert.ok(first.skill.skillFile.startsWith(path.join(root, '.archimedes/skills')));
  const resumed = setup(root, { backend: 'api', requested: undefined, thread: { id: 'thread', events: first.records } });
  assert.equal(resumed.skill.runDirectory, first.skill.runDirectory);
});
