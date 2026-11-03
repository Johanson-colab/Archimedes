# Claude Code and OpenCode Implementation Plan

> **For agentic workers:** Use superpowers:subagent-driven-development for protocol implementation and independent reviews.

**Goal:** Connect the two installed native agents to Main Work without API credentials or fallback.

**Architecture:** Existing Codex execution remains intact behind a backend dispatcher. Claude stream-json and OpenCode ACP adapters own native execution and permissions. Settings persist independent profiles; bindings carry backend identity.

**Tech Stack:** Electron CommonJS, React/TypeScript, Node test runner, native stdio protocols.

Authorization: owner request in Codex chat, continuing explicit direct-main/push instructions. Tracking: #239. This is an extension of the previously approved native Harness design.

## Tasks

- [x] Configuration: add failing tests for independent Claude/OpenCode/Codex profiles and legacy migration in `electron/native-harness-config.test.cjs`; extend `agent-backend-config.cjs`. Default new agents to native ask permissions, without promising an OS sandbox. `node --max-old-space-size=256 --test electron/native-harness-config.test.cjs` must pass.
- [x] Protocol adapters: add fixture tests first in `electron/agent/`, implement bounded processes, Claude control messages and OpenCode ACP. Verify installed CLI initialization without inference. Expose `runNative`, `checkNative`, native commands and shutdown through `external-backend.cjs`.
- [x] Continuity: add backend identity to `native_agent_bindings` with legacy default Codex; reject cross-agent resumes. Preserve dirty-before-send and no-replay handling.
- [x] Integration: route Main Work, approval labels, native controls and shutdown through the dispatcher in `agent.cjs`, `main.cjs`, and `thread-commands.cjs`. Paper/API workers remain API-only.
- [x] UI: enable all Harness picker entries; add independent native settings cards, model inputs and accurate permission descriptions. Retain settings drafts and explicit checks. Update DOM behavior tests before implementation and add translations.
- [x] Evidence: capture matching Paper/Charcoal settings and picker screenshots. Run focused protocol/config/UI tests, serial full tests, lint, build and theme checks with memory limits. Preserve known three macOS Windows-shell baseline failures.
- [x] Review spec compliance then code quality, fix findings, record actual CLI verification/limitations, commit and push main without force.

## Acceptance details

Native session IDs stay local. Credentials remain with each CLI. Abort/window closure expires pending approvals and terminates only owned process groups. Native token percentages are shown only with actual reported capacity. Unsupported steering/compaction produces explicit capability errors. Never enable bypass-permissions modes. Installed CLI/model/auth failures remain visible and never trigger API execution.
