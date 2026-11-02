# Codex backend verification

Environment: macOS, Node 25.8.1, Codex CLI 0.161.0. Base: `f78b030`.

## Automated checks

```text
node --test electron/agent/codex-backend.test.cjs electron/codex-agent-integration.test.cjs
tests 11, pass 11, fail 0

npm test
tests 771, pass 764, fail 3, skipped 4

npm run lint       PASS
npm run build      PASS (large-chunk advisory remains)
npm run check:theme PASS
git diff --check   PASS
```

Full-suite failures, also reproduced on unchanged main:

```text
Windows prefers PowerShell 7 when it is installed
Windows falls back to Windows PowerShell before cmd
explicit shell profiles do not fall through to a different shell
```

The new regression tests cover JSON-RPC correlation, timeout without replay,
invalid messages, process exit, history continuity, native approvals, denial of
unsupported requests, cancellation, secret-free configuration, no API-key
dependency and prevention of duplicate renderer execution.

## Real Codex smoke results

```json
{"ready":true,"modelCount":8}
{"firstReply":"ARCHIMEDES_CODEX_SMOKE_OK","successfulBinding":true}
{"secondReply":"ARCHIMEDES_CODEX_SMOKE_OK","resumeVerified":true}
{"approvalCount":1,"fileCreated":false,"replyReceived":true}
```

The two conversation turns used separate app-server processes with the same
persisted thread. The mutation probe was in a disposable empty directory;
approval was denied. No project files or credentials were modified by the probes.

## UI evidence

Settings (same API selection, theme, viewport):

![Before](settings-before.png)
![After](settings-after.png)

Expanded Codex controls (separate state):

![Codex controls](settings-codex.png)

Actual conversation approval component, controlled fixture (same command,
viewport and effective dark styling). The after state marks native ownership;
the terminal does not execute a native approval. These are component audits,
not a screenshot of a live training job:

![Before approval](approval-before.png)
![After approval](approval-after.png)
