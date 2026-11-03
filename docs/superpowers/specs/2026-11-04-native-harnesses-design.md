# Claude Code and OpenCode native Harnesses

Extends the native execution design approved for Codex. Tracking: [#239](https://github.com/Johanson-colab/Archimedes/issues/239). The owner requested implementation in Codex chat, continuing the explicit authorization to modify and push main; this overrides the default PR-only workflow for this change.

## Runtime boundary

Main Work dispatches by selected Harness. Codex retains its existing app-server adapter. Claude Code uses stream-json/control messages; OpenCode uses ACP stdio. Each CLI owns its model requests, native instructions, tools, history and configured permissions. API/Paper chat/internal workers remain API-based. Runtime errors never cause fallback or replay.

## Configuration and continuity

Local `agent-backend.json` stores independent executable/model/permission profiles. Legacy Codex configuration is migrated. Settings checks run only on explicit user action and initialize protocols without inference; success does not prove model authorization.

Local native bindings include backend identity, real workspace path, model and last successful local turn. New contexts import bounded visible history once. Dirty bindings are saved before possibly delivered requests, and restored only after final event persistence. Forks and exports omit native IDs.

## Permissions and lifecycle

Codex retains read-only/workspace-write sandbox policies. Claude and OpenCode use native configured permissions with one-time approval responses; this is not an OS sandbox. Permanent permission suggestions are never granted by the Archimedes approval card. The renderer never runs approved native commands a second time.

Stop/window-close/app-quit closes only owned native processes. Pending approvals expire. Stdout is drained before normal process exit is treated as failure. JSON lines, text, history and activity snapshots have explicit limits; tool updates coalesce before renderer delivery.

## UI and capability limits

The composer exposes Codex, Claude Code, OpenCode and Archimedes. Models → Harnesses provides separate native configuration views with preserved drafts and explicit activation. Native activities share the existing display, and context usage uses actual reported values. Unknown context capacity remains unknown.

Claude/OpenCode initially do not expose live steering, interactive question cards, plugin/skill attachments or manual compaction. These operations fail explicitly. Images require native capability support. Files/papers are passed as paths/metadata, not automatically read.

## Protocol references

- [Claude Code CLI](https://code.claude.com/docs/en/cli-reference), installed 2.1.119.
- [OpenCode ACP](https://opencode.ai/v2/docs/cli/acp), installed 2.2.5, ACP protocol 1 with flat config options.

Validation uses protocol fixtures, real child-process integration, actual CLI initialization, bounded model smoke tests, UI behavior tests, matching screenshots, and serial repository checks. Verification evidence records actual results and native capability limits.
