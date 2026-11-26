const { randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { readApp, sourceFiles, fingerprint } = require('./research-app-runtime.cjs');

function createAppRepair({ getConfig, approve, approveTool, runNative }) {
  return async ({ app, backend, error, evidence, attempt, signal }) => {
    if (!['codex', 'claude', 'opencode'].includes(backend)) throw new Error('Choose Codex, Claude Code or OpenCode for automatic repair.');
    const temporary = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'research-app-repair-')));
    const candidate = path.join(temporary, 'research-apps', app.id);
    fs.mkdirSync(candidate, { recursive: true });
    try {
      const expected = fingerprint(app);
      for (const file of sourceFiles(app)) { const dest = path.join(candidate, file.path); fs.mkdirSync(path.dirname(dest), { recursive: true }); fs.writeFileSync(dest, file.content, { mode: file.mode }); }
    const prompt = `Repair this existing Research App in place (attempt ${attempt}/2). Workspace: ${candidate}. Failure: ${error}. Host diagnostic log: ${evidence?.logs || 'none'}. Inspect the manifest, README and research-app.checks.json and repair the actual implementation. Do not weaken existing assertions, replace live services with mocks, modify secrets/.data/.venv, or create a nested App. If checks are absent, add task-specific checks with schemaVersion:1, description, http:[{path:"/"}], browser:[{action:"fill",selector:"...",value:"..."},{action:"click",selector:"..."},{action:"expect",selector:"...",text:"expected result"}]. Preserve the user's intended workflow. The host will rerun acceptance; do not claim Ready yourself.`;
    if (signal?.aborted || !await approve({ app, backend, prompt }) || signal?.aborted) throw new Error('App repair was not approved or was cancelled.');
    const id = `repair-${randomUUID()}`;
    await runNative({
      config: { ...getConfig().profiles[backend], backend, permissionMode: backend === 'codex' ? 'workspace-write' : 'ask' },
      workspace: candidate, thread: { id, turns: [] }, turn: { id: randomUUID(), user_message: prompt },
      bindings: { get: () => null, save: () => {} }, runtimeId: id, ephemeral: backend === 'codex', disableSharedEnvironment: true, signal,
      approve: request => approveTool({ app, backend, request }), timeoutMs: 10 * 60_000,
    });
    signal?.throwIfAborted();
    const repaired = readApp(temporary, app.id), result = fingerprint(repaired);
    if (result !== expected) require('./research-app-delivery-store.cjs').replaceSource(app, { fingerprint: result, files: sourceFiles(repaired).map(file => ({ path: file.path, content: file.content.toString('base64'), mode: file.mode })) }, expected);
    } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  };
}
module.exports = { createAppRepair };
