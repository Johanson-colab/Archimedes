const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const SOURCE = path.join(__dirname, '../assets/research-skills/paper2slides');
const NAME = 'archimedes-paper2slides';
const DIRS = { codex: '.agents/skills', claude: '.claude/skills' };
const hash = data => crypto.createHash('sha256').update(data).digest('hex');

function ensureDirectory(root, relative) {
  let current = root;
  for (const segment of relative.split('/')) {
    if (!segment || segment === '.' || segment === '..') throw new Error('Invalid skill directory.');
    current = path.join(current, segment);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error(`Expected a real directory: ${current}`);
    if (!stat) fs.mkdirSync(current);
  }
  return current;
}
function filesAt(base, relative = '') {
  const result = [];
  for (const entry of fs.readdirSync(path.join(base, relative), { withFileTypes: true })) {
    if (entry.name.startsWith('.')) continue;
    const name = relative ? `${relative}/${entry.name}` : entry.name;
    if (entry.isSymbolicLink()) throw new Error(`Linked skill resource: ${name}`);
    if (entry.isDirectory()) result.push(...filesAt(base, name));
    else if (entry.isFile()) result.push(name);
  }
  return result.sort();
}
function preparePaperSlidesSkill({ workspace, backend, thread, requested, emit = () => {}, recordEvent = () => {} }) {
  const previous = [...(thread.events || [])].reverse().find(e => e.type === 'research_skill' && e.payload?.skill === 'paper-to-slides')?.payload;
  if (requested !== 'paper-to-slides' && !(requested == null && previous)) return null;
  if (!DIRS[backend]) throw new Error('Paper to Slides requires Codex or Claude Code.');
  const root = fs.realpathSync(workspace), base = ensureDirectory(root, DIRS[backend]);
  const source = path.join(SOURCE, backend), target = path.join(base, NAME);
  const entries = filesAt(source);
  const files = new Map(entries.map(name => {
    let content = fs.readFileSync(path.join(source, name));
    if (name === 'SKILL.md') content = Buffer.from(content.toString('utf8').replace(/^name: paper2slides$/m, `name: ${NAME}`));
    return [name, content];
  }));
  const hashes = Object.fromEntries([...files].map(([name, data]) => [name, hash(data)]));
  const existing = fs.lstatSync(target, { throwIfNoEntry: false });
  if (existing) {
    if (!existing.isDirectory() || existing.isSymbolicLink()) throw new Error('The Paper to Slides skill path is not a real directory.');
    const markerPath = path.join(target, '.archimedes-skill.json');
    const markerStat = fs.lstatSync(markerPath, { throwIfNoEntry: false });
    if (!markerStat?.isFile() || markerStat.isSymbolicLink()) throw new Error('An unmanaged Paper to Slides skill already exists; it was not replaced.');
    let marker; try { marker = JSON.parse(fs.readFileSync(markerPath, 'utf8')); } catch { throw new Error('An unmanaged Paper to Slides skill already exists; it was not replaced.'); }
    if (marker.owner !== 'archimedes' || JSON.stringify(marker.files) !== JSON.stringify(hashes)) throw new Error('The installed Paper to Slides skill differs from this version; it was not replaced.');
    for (const [name, expected] of Object.entries(hashes)) {
      let current = target;
      for (const segment of name.split('/')) { current = path.join(current, segment); const stat = fs.lstatSync(current, { throwIfNoEntry: false }); if (!stat || stat.isSymbolicLink()) throw new Error(`Skill resource missing or linked: ${name}`); }
      if (hash(fs.readFileSync(current)) !== expected) throw new Error(`Skill resource was modified: ${name}`);
    }
  } else {
    const staging = fs.mkdtempSync(path.join(base, '.paper2slides-'));
    try {
      for (const [name, data] of files) { const file = path.join(staging, name); fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, data); }
      fs.writeFileSync(path.join(staging, '.archimedes-skill.json'), JSON.stringify({ owner: 'archimedes', files: hashes }));
      fs.renameSync(staging, target);
    } finally { fs.rmSync(staging, { recursive: true, force: true }); }
  }
  const skillFile = path.join(target, 'SKILL.md');
  const state = { skill: 'paper-to-slides', backend, workspace: root, threadId: thread.id };
  recordEvent({ type: 'research_skill', payload: state });
  emit({ type: 'status', title: 'Paper to Slides', detail: `Skill ready for ${backend === 'codex' ? 'Codex' : 'Claude Code'}` });
  return { ...state, skillName: NAME, skillFile, instructions: [
    `Use the paper2slides skill at ${JSON.stringify(skillFile)}. Read and follow its SKILL.md and bundled references.`,
    `Its directory is ${JSON.stringify(target)}. Run python -m scripts commands from that directory.`,
    'Use the supplied PDF and produce an editable PPTX and, if feasible, a PDF preview. The user has already selected language and length in the app: use those settings, default visual QA to on and color to auto. Do not invoke preflight question tools for options already supplied. If a blocking question is necessary, ask visibly in the chat and stop for a reply. Show progress and preserve source figures.',
    'The skill uses MinerU cloud: PDF content is uploaded. Check MINERU_API_TOKEN and all required dependencies; if unavailable, explain exactly what is missing and stop. Do not invent success or ask for secrets in chat.',
    'Follow native approval and sandbox policies. Ask for approval as needed; do not bypass denied operations. Report actual output paths and any incomplete QA.',
  ].join('\n') };
}
module.exports = { preparePaperSlidesSkill, ensureDirectory, NAME };
