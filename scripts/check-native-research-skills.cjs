// Opt-in real-model smoke check. Each invocation starts ONE bounded native run
// in a temporary workspace. It reads the skill and runs only the navigator;
// it never launches literature retrieval or an entire paid IdeaSpark campaign.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { runNative } = require('../electron/agent/external-backend.cjs');

async function main() {
  const backend = process.argv[2];
  if (!['codex', 'claude', 'opencode'].includes(backend)) throw new Error('Usage: node scripts/check-native-research-skills.cjs codex|claude|opencode');
  const workspace = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), `archimedes-${backend}-skill-smoke-`)));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 150_000);
  const activities = new Map(), records = [], approvals = [];
  let binding;
  try {
    const response = await runNative({
      config: { backend, binary: backend, model: '', effort: '', permissionMode: backend === 'codex' ? 'read-only' : 'ask' },
      workspace, thread: { id: 'skill-smoke', turns: [], events: [] },
      turn: { id: 'smoke-turn', user_message: 'Integration check only. Do not start literature retrieval, research ideation, dependency installation, sub-agents, or any other workflow stages. Explicitly read the first 120 lines of the provided IdeaSpark SKILL.md using a native file-read tool or cat/sed. Then use python3 (or python on Windows) to execute its scripts/run.py next --dir <the provided RUN_DIR> --query "Validation overfitting in recursive self improvement" exactly once. This navigator is read-only. Stop after that command. Briefly report the next step from its real output. Do not inspect credentials or other files.' },
      researchSkill: 'idea-spark', signal: controller.signal, timeoutMs: 145_000,
      bindings: { get: () => binding, save: value => { binding = value; } },
      recordEvent: event => records.push(event),
      emit: event => { if (event.type === 'native_activity') activities.set(event.activity.id, event.activity); },
      // Restrict any one-time approval to the expected read-only probe. Other
      // requests stay denied; this does not change the native permission mode.
      approve: async ({ command }) => {
        const allowed = command.includes('archimedes-idea-spark') && !/[`]|\$\(|\b(?:rm|curl|wget|pip|install)\b/.test(command)
          && (/\b(?:cat|sed|head|Read|read)\b/.test(command) || (command.includes('scripts/run.py') && /\bnext\b/.test(command)));
        approvals.push({ allowed });
        return allowed;
      },
    });
    const tools = [...activities.values()];
    const navigator = tools.find(a => /scripts[\\/]run\.py/.test(a.detail) && /\bnext\b/.test(a.detail) && a.status === 'completed' && /Fresh run|Phase 0/.test(a.output || ''));
    const skillRead = tools.some(a => a.kind === 'skill' && a.status === 'completed');
    const result = { backend, skillRead, navigatorExecuted: Boolean(navigator), approvals, completed: Boolean(binding?.last_turn_id), response: response.slice(0, 1600), ...(!skillRead || !navigator ? { activities: tools.map(a => ({ kind: a.kind, status: a.status, detail: a.detail, output: a.output?.slice(0, 500) })) } : {}) };
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (!skillRead || !navigator) process.exitCode = 1;
  } catch (error) {
    process.stdout.write(JSON.stringify({ backend, error: error.message, activities: [...activities.values()].map(a => ({ kind: a.kind, status: a.status, detail: a.detail.slice(0, 700), output: a.output?.slice(-1000) })), approvals }, null, 2) + '\n');
    process.exitCode = 1;
  } finally {
    clearTimeout(timer);
    controller.abort();
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
