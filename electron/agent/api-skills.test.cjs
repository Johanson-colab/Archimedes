const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { discoverSkills, readSkillResource } = require('./api-skills.cjs');

test('discovers skills lazily and reads only bounded resources beneath their root', t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'api-skills-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const directory = path.join(root, '.agents/skills/example');
  fs.mkdirSync(path.join(directory, 'references'), { recursive: true });
  fs.writeFileSync(path.join(directory, 'SKILL.md'), 'skill instructions');
  fs.writeFileSync(path.join(directory, 'references/rubric.md'), 'rubric');
  fs.writeFileSync(path.join(root, 'secret'), 'secret');
  assert.deepEqual(discoverSkills(root), [{ id: '.agents/skills/example', name: 'example' }]);
  assert.equal(readSkillResource(root, '.agents/skills/example', 'references/rubric.md').content, 'rubric');
  assert.throws(() => readSkillResource(root, '.agents/skills/example', '../../../secret'), /Invalid/);
  assert.throws(() => readSkillResource(root, '.agents/skills/example', '.env'), /Invalid/);
  assert.throws(() => readSkillResource(root, 'missing', 'SKILL.md'), /not installed/);
  fs.symlinkSync(path.join(root, 'secret'), path.join(directory, 'references/link'));
  assert.throws(() => readSkillResource(root, '.agents/skills/example', 'references/link'), /Linked/);
});
