const fs = require('node:fs');
const path = require('node:path');
const { createHash, randomUUID } = require('node:crypto');

const SOURCE = path.join(__dirname, '../assets/research-skills/idea-spark');
const SKILL_NAME = 'archimedes-idea-spark';
const SKILL_DIRS = { codex: '.agents/skills', claude: '.claude/skills', opencode: '.opencode/skills', api: '.archimedes/skills' };
const OWNER = '.archimedes-skill.json';
const digest = content => createHash('sha256').update(content).digest('hex');

// Resolve only real directories beneath the already canonical workspace.
// Never write through a user's symlink or replace a user-owned skill.
function directory(root, relative) {
  if (!relative || path.isAbsolute(relative) || relative.split(/[\\/]/).some(p => !p || p === '.' || p === '..')) throw new Error('Invalid research skill directory.');
  let current = root;
  for (const part of relative.split('/')) {
    current = path.join(current, part);
    const stat = fs.lstatSync(current, { throwIfNoEntry: false });
    if (stat && (!stat.isDirectory() || stat.isSymbolicLink())) throw new Error(`Research skills require a real directory: ${current}`);
    if (!stat) fs.mkdirSync(current);
  }
  return current;
}

function bundledFiles() {
  const manifest = JSON.parse(fs.readFileSync(path.join(SOURCE, 'upstream.json'), 'utf8'));
  const files = new Map();
  for (const [relative, hash] of Object.entries(manifest.files)) {
    if (path.isAbsolute(relative) || relative.split('/').some(p => p === '..' || p.startsWith('.'))) throw new Error('Invalid bundled IdeaSpark resource.');
    const content = fs.readFileSync(path.join(SOURCE, relative));
    if (digest(content) !== hash) throw new Error(`Bundled IdeaSpark resource failed verification: ${relative}`);
    files.set(relative, relative === 'SKILL.md'
      ? Buffer.from(content.toString('utf8').replace(/^name: idea-spark$/m, `name: ${SKILL_NAME}`))
      : content);
  }
  return files;
}

function installSkill(root, backend) {
  const base = directory(root, SKILL_DIRS[backend]);
  const destination = path.join(base, SKILL_NAME);
  const files = bundledFiles();
  const hashes = Object.fromEntries([...files].map(([file, content]) => [file, digest(content)]));
  const stat = fs.lstatSync(destination, { throwIfNoEntry: false });
  if (stat) {
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`IdeaSpark skill path is not a real directory: ${destination}`);
    const marker = path.join(destination, OWNER);
    const markerStat = fs.lstatSync(marker, { throwIfNoEntry: false });
    let owned;
    if (markerStat?.isFile() && !markerStat.isSymbolicLink()) {
      try { owned = JSON.parse(fs.readFileSync(marker, 'utf8')); } catch { /* reported below */ }
    }
    if (owned?.owner !== 'archimedes' || owned.version !== 1 || !owned.files) throw new Error(`IdeaSpark cannot replace an existing unmanaged skill at ${destination}. Move that folder or use another workspace.`);
    // A changed bundle is not silently substituted into a running research task.
    if (JSON.stringify(owned.files) !== JSON.stringify(hashes)) throw new Error(`The installed IdeaSpark version differs from this app. Preserve the existing skill folder and choose a new workspace for the updated version: ${destination}`);
    for (const [relative, hash] of Object.entries(hashes)) {
      let current = destination;
      for (const part of relative.split('/')) {
        current = path.join(current, part);
        const entry = fs.lstatSync(current, { throwIfNoEntry: false });
        if (!entry || entry.isSymbolicLink()) throw new Error(`IdeaSpark resource is missing or linked: ${current}`);
      }
      if (!fs.statSync(current).isFile() || digest(fs.readFileSync(current)) !== hash) throw new Error(`IdeaSpark resource was modified: ${current}. Preserve your changes and use a new workspace.`);
    }
    return path.join(destination, 'SKILL.md');
  }
  const staging = fs.mkdtempSync(path.join(base, '.archimedes-idea-spark-'));
  try {
    for (const [relative, content] of files) {
      const target = path.join(staging, relative);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, content);
    }
    fs.writeFileSync(path.join(staging, OWNER), JSON.stringify({ owner: 'archimedes', version: 1, files: hashes }));
    fs.renameSync(staging, destination);
  } finally { fs.rmSync(staging, { recursive: true, force: true }); }
  return path.join(destination, 'SKILL.md');
}

function researchSelection(thread, requested) {
  if (requested != null && requested !== 'idea-spark') throw new Error('Unknown Research skill.');
  const previous = [...(thread.events || [])].reverse().find(e => e.type === 'research_skill' && e.payload?.skill === 'idea-spark')?.payload;
  return { enabled: requested === 'idea-spark' || Boolean(previous), previous };
}

function prepareResearchSkill({ workspace, backend, thread, requested, emit = () => {}, recordEvent = () => {} }) {
  const { enabled, previous } = researchSelection(thread, requested);
  if (!enabled) return null;
  if (!SKILL_DIRS[backend]) throw new Error('Unsupported IdeaSpark harness.');
  const root = fs.realpathSync(workspace);
  const skillFile = installSkill(root, backend);
  let runRelative;
  if (previous?.threadId === thread.id && previous.workspace === root && previous.backend === backend) {
    runRelative = previous.runRelative;
    if (typeof runRelative !== 'string' || !/^ideaspark_run\/[a-z0-9][a-z0-9_-]*$/.test(runRelative)) throw new Error('Saved IdeaSpark run path is invalid.');
  } else {
    directory(root, 'ideaspark_run');
    // mkdir's exclusive creation prevents accidental reuse/overwrite of a run.
    const id = randomUUID();
    runRelative = `ideaspark_run/research-${id}`;
    fs.mkdirSync(path.join(root, runRelative));
  }
  const runDirectory = directory(root, runRelative);
  const skillDirectory = path.dirname(skillFile);
  const state = { skill: 'idea-spark', threadId: thread.id, backend, workspace: root, runRelative };
  recordEvent({ type: 'research_skill', payload: state });
  emit({ type: 'status', title: 'IdeaSpark', detail: `Skill files ready · ${SKILL_DIRS[backend]}/${SKILL_NAME} · ${runRelative}` });
  const instructions = [
    'Research mode — built-in IdeaSpark skill',
    `Use the ${SKILL_NAME} skill at ${JSON.stringify(skillFile)}. Read that SKILL.md and follow its workflow, including its full-text, citation, coherence, audit and terminal-state gates.`,
    `SKILL_DIR=${JSON.stringify(skillDirectory)}`,
    `RUN_DIR=${JSON.stringify(runDirectory)}`,
    'This run directory belongs to this chat. Resume it with the read-only `next` navigator; never restart completed phases or reuse another run. Use absolute paths for scripts and outputs.',
    'Quote file paths and user-provided query text as shell arguments. Inspect navigator commands before execution; embedded quotes or shell substitutions in a query must stay literal data.',
    'For installation checks or workflow inspection, do only the requested check. For a research question, drive `scripts/run.py next --dir <RUN_DIR> --query <research question>` until a real terminal state, using the same Python interpreter throughout.',
    'Before retrieval, check the Python environment and connector availability per references/setup.md. If packages are missing, use an isolated virtual environment subject to native approvals. Report unavailable connectors and full-text degradation; never copy credentials into outputs or invent search results.',
    'Run LLM phases in isolated contexts using the native sub-agent/task tool or an explicitly configured fresh-context subprocess supported by this harness. Keep phase inputs/outputs on disk; return short progress updates. If isolation is unavailable, explain that limitation instead of accumulating all phase contents in this chat.',
    'Follow the selected native permissions. A denied operation is not approval to bypass it. Report blockers and retain run artifacts for an explicit retry. Do not claim the skill was read, scripts executed or stages completed without actual tool results.',
    'IdeaSpark produces an audited research idea and falsification plan; it does not itself execute the proposed experiments or write a complete paper.',
  ].join('\n');
  const apiInstructions = [
    'Research mode: use the installed IdeaSpark skill. First call list_skills and read_skill_resource for its SKILL.md.',
    `The skill ID is ${SKILL_DIRS[backend]}/${SKILL_NAME}; the run directory is ${runRelative}.`,
    'Follow the skill navigator scripts/run.py next and its actual outputs. Run commands only through propose_command and obtain approval for writes. Use run_isolated_phase for LLM stages, with the exact prompt, inputs and output paths specified by the navigator.',
    'Do not claim stages completed without checking their real outputs; explain blocked or denied operations. Continue the same run on subsequent turns.',
  ].join(' ');
  return { ...state, skillFile, runDirectory, instructions: backend === 'api' ? apiInstructions : instructions };
}

// Label actual native reads only; preparing files is not a skill-read event.
function skillReadActivity({ tool, input = {}, command, filePath }) {
  if (/^skill$/i.test(tool || '') && [input.name, input.skill].includes(SKILL_NAME)) return { kind: 'skill', title: 'Loaded skill · IdeaSpark' };
  const target = filePath || input.file_path || input.filePath || input.path || '';
  const read = /^(read|read_file|readfile)$/i.test(tool || '') && String(target).replaceAll('\\', '/').includes(`/${SKILL_NAME}/SKILL.md`);
  const shell = command || input.command || '';
  const commandRead = /(?:^|[\s;&|'\"])(?:cat|sed|head|tail|Get-Content)\s/.test(shell) && shell.replaceAll('\\', '/').includes(`/${SKILL_NAME}/SKILL.md`);
  return read || commandRead ? { kind: 'skill', title: 'Read skill · IdeaSpark' } : null;
}

module.exports = { prepareResearchSkill, researchSelection, skillReadActivity, SKILL_DIRS, SKILL_NAME };
