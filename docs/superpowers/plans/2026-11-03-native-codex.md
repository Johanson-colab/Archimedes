# Native Codex Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development or superpowers:executing-plans task-by-task. Tests run serially under a memory limit.

**Goal:** Make main Work a native Codex client with faithful execution, context, permissions and activity.

**Architecture:** Codex-specific modules translate native RPC into bounded public events. The renderer consumes those events without native session IDs. API behavior remains behind its existing path.

**Tech Stack:** Electron CommonJS, React/TypeScript, Node test runner, Codex app-server stdio.

### Task 1: Native execution and protocol

Files: `electron/agent/codex-backend.cjs`, `electron/agent/codex-client.cjs`, `electron/agent.cjs`, `electron/agent-backend-config.cjs`, focused `*.test.cjs` alongside them. Extract protocol helpers into `electron/agent/codex-events.cjs` if needed.

- [ ] Add failing tests: API command restrictions absent from native developer instructions; second successful turn resumes without reimport; explicit permissions and effort reach RPC; repeated native tool IDs remain distinct; bounded output and phase-correct answer; usage/plan/diff/question and cleanup.
- [ ] Run `node --max-old-space-size=192 --test --test-concurrency=1 electron/agent/codex-backend.test.cjs`, verify new assertions fail.
- [ ] Separate `prepareConversation` from the native branch; use `on-request`, native model efforts, structured activities and bounded histories; keep uncertain delivery dirty and always close clients.
- [ ] Export active-turn steering/question operations and explicit compaction helper; reject stale or mismatched local thread/workspace requests.
- [ ] Run focused tests under `../run-memory-guard.cjs`, inspect results and commit `feat(agent): preserve native Codex execution and context`.

### Task 2: Desktop bridge and renderer

Files: `electron/main.cjs`, `electron/preload.cjs`, `src/vite-env.d.ts`, `src/AgentBackendSettings.tsx`, `src/App.tsx`, focused native UI components/CSS and translation shards.

- [ ] Add failing native control/UI tests using primitive DOM assertions; verify unknown context is never shown as an API estimate, repeated tools survive, permission/effort selection reaches save and stale questions cannot be answered.
- [ ] Run focused Node tests serially, observe missing behavior failures.
- [ ] Route native compaction/steering/answers over validated IPC; bypass API normalization for native input.
- [ ] Add Settings permission and native effort controls; display native context usage, structured activities/plans/diffs/questions, and steering while busy. Preserve API controls for API mode.
- [ ] Run focused renderer/protocol/integration/i18n tests and commit `feat(ui): expose native Codex controls and activity`.

### Task 3: Verification and publication

Files: `docs/codex-agent-backend.md`, `docs/assets/native-codex/`, this checklist.

- [ ] Run lint, full tests serially, build and theme checks; compare failures to existing baseline without weakening Windows tests.
- [ ] Capture before/after UI pairs at identical viewport/theme using an isolated fixture; record limitations and memory measurements.
- [ ] Review spec compliance, then code quality; address findings with regression tests.
- [ ] Commit docs/evidence, push `codex/native-codex-workflow`, open PR linked to #235 and owner authorization. Do not merge main.
