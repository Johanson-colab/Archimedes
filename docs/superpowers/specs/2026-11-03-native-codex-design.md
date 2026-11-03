# Native Codex in main Work

Owner-approved direction: retain Archimedes UI; Codex owns execution, context and permissions. Owner request and approval are recorded in #235. This continues the approved design, without another approval cycle.

## Boundary

Only main Work uses the selected external backend. API, Paper chat, Side, FigureForge and internal workers retain their existing harness. Codex retains its native default instructions and receives attachment metadata, not API tool names, API command restrictions, model settings, local summaries or character-budget compaction. No Archimedes developer/base instruction overrides native Codex behavior. A new native thread imports bounded visible conversation once; an oversized import fails explicitly while preserving history. A continuous thread resumes native history.

## Native controls

Persist `effort` (empty means Codex default) and `permissionMode` (`read-only` by default, explicitly selectable `workspace-write`). Use `on-request` and user approvals; no full-access option. Check retrieves native model capabilities without automatically starting a CLI on Settings mount. Unsupported choices fail explicitly, never silently fall back to API.

## Events and interactions

Structured, bounded native activities preserve item IDs, status, concrete MCP/command/file names and output. Public commentary stays separate from final answer; never claim access to hidden reasoning. Persist activities, usage, plans and diffs for history. Usage comes from native notifications and reports unknown until present. Last-context tokens and lifetime totals have distinct meanings.

Native compaction resumes the matching binding and calls `thread/compact/start`. Steering targets the currently active native turn using `expectedTurnId`. Question cards validate IDs and answer shapes; stop/finish invalidates outstanding requests. Unsupported permission request shapes fail closed and explain why.

## Lifecycle and safety

One app-server per active turn or explicit maintenance operation; close in finally and on app exit. No retries after uncertain turn delivery. Native thread IDs remain local, never forked/exported/synced. Never execute native approval commands in Archimedes terminal. Bound item count, output, text and RPC buffers. Avoid unbounded output event persistence.

## Evidence

Use installed CLI 0.161.0 schema and official app-server docs. Serial memory-limited protocol/dispatch/renderer tests, lint, build and theme checks. Compare changed UI at matching viewport/theme; document existing macOS Windows-shell baseline failures. Publish a new PR; do not merge main.
