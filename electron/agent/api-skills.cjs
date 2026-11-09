const fs = require('node:fs');
const path = require('node:path');

// Discover only direct workspace installations, without traversing the user's home.
function discoverSkills(workspace) {
  const root = fs.realpathSync(workspace);
  const found = [];
  for (const base of ['.archimedes/skills', '.agents/skills', '.claude/skills', '.opencode/skills']) {
    const directory = path.join(root, base);
    let entries;
    try {
      const real = fs.realpathSync(directory);
      if (!real.startsWith(root + path.sep)) continue;
      entries = fs.readdirSync(real, { withFileTypes: true });
    } catch { continue; }
    for (const entry of entries.slice(0, 100)) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const skillRoot = path.join(directory, entry.name);
      try {
        const file = fs.lstatSync(path.join(skillRoot, 'SKILL.md'));
        if (!file.isFile() || file.isSymbolicLink() || file.size > 128_000) continue;
        found.push({ id: `${base}/${entry.name}`, name: entry.name });
      } catch { /* Ignore incomplete installations. */ }
    }
  }
  return found;
}

function readSkillResource(workspace, skillId, resource) {
  const skill = discoverSkills(workspace).find(item => item.id === skillId);
  if (!skill) throw new Error('Skill is not installed in this workspace.');
  if (typeof resource !== 'string' || !resource || path.isAbsolute(resource) || resource.split(/[\\/]/).some(part => !part || part === '.' || part === '..' || part.startsWith('.'))) throw new Error('Invalid skill resource path.');
  const root = fs.realpathSync(path.join(workspace, skill.id));
  let target = root;
  for (const part of resource.split(/[\\/]/)) {
    target = path.join(target, part);
    const entry = fs.lstatSync(target);
    if (entry.isSymbolicLink()) throw new Error('Linked skill resources are not supported.');
  }
  const stat = fs.statSync(target);
  if (!stat.isFile() || stat.size > 128_000) throw new Error('Skill resource is not a readable text file or exceeds the size limit.');
  const content = fs.readFileSync(target);
  if (content.includes(0)) throw new Error('Skill resource must be UTF-8 text.');
  return { skill_id: skill.id, path: resource, content: content.toString('utf8') };
}

module.exports = { discoverSkills, readSkillResource };
