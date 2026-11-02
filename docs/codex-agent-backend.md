# Codex Agent backend (issue #233)

## Scope and authorization

Issue: https://github.com/Johanson-colab/Archimedes/issues/233

The repository owner explicitly requested creating an issue and developing an
external Agent backend in a new PR. That written request is recorded in the
issue's final paragraph. This PR implements Codex first; it does not merge or
push directly to main.

## Design

- Preserve the API harness as the default and for internal research workers.
- Add an opt-in Codex app-server adapter for main Work conversations.
- Keep configuration free of copied Codex credentials and use local CLI auth.
- Persist backend/native-thread bindings separately from public chat history.
- Stream native output into existing research events, with explicit error and
  cancellation states. Never replay a turn automatically after uncertain delivery.
- Start with a restricted sandbox, bridge supported approvals, deny unknown
  requests, and keep read-only conversations out of the external execution path.
- Reset native continuity when local history is undone/forked or the backend or
  workspace changes; preserve old native history rather than deleting it.

Protocol reference: https://learn.chatgpt.com/docs/app-server

## Usage

1. Install a current Codex CLI and run `codex login` in a terminal.
2. In Settings → Models, expand **Agent backend**, select **Codex** and check it.
3. Use `codex` from PATH or an absolute native executable path. A model override
   is optional; empty uses native Codex configuration. Archimedes' API model
   selector does not select the Codex model.
4. Click **Save backend**. The next main Work turn uses that backend, including
   when no Archimedes API key is configured. Existing running turns are unchanged.

Each turn owns an app-server process and closes it afterward; the persisted
native thread is resumed on the next turn or after an application restart.
This deliberately favors isolated lifecycle handling over a resident process
cache in the first version. Native identifiers stay local, outside exported,
synced and forked conversation payloads.

## Permissions and compatibility

Codex starts with a read-only sandbox and `untrusted` approvals routed to the
user, not the automatic reviewer. Read-only is **not** a promise of workspace-only
filesystem reads. Explicit approvals can grant execution beyond that sandbox;
review the entire command or proposed file changes. File-root grants outside
the workspace, opaque network grants, additional-permission requests and unknown
server requests are denied. A safe read command may not request approval.

Supported native approval cards are executed by Codex only: the renderer must
never run them a second time in its terminal. Stop, timeout or process exit
rejects pending local cards and never retries an uncertain turn automatically.
Partial changes are not rolled back.

The backend has local Codex's tools, not Archimedes' API function tools. Files,
folders, selected excerpts, images and paper/repository metadata are passed as
context; metadata does not mean the underlying source was read. Plugin/skill
attachments fail explicitly. Native question cards, permission-profile grants,
native compaction, automatic artifact registration and internal-worker migration
are outside this first version. The existing `/compact` remains an API operation.
Paper chat, Side, review workers, Proactive and FigureForge keep their API paths.
Codex's own configuration controls reasoning; API reasoning controls are not a
native effort selector. Windows `.cmd` launchers are rejected; a native executable
is required, and Windows runtime behavior has not been verified on this Mac.

The backend choice is a local default for main Work, not a shared project
setting. Fork/undo, an intervening API turn, a changed workspace/model or an
unsuccessful native turn causes the next turn to start a new native thread with
the available Archimedes history. A missing native thread produces an explicit
error, not a silent API fallback.

## Verification (2026-11-03)

- Protocol/backend and main-Work integration tests: **11 passed**. The real child
  fixture proves dispatch without an API key and checks native-ID isolation.
- Full `npm test`: **771 tests, 764 passed, 4 skipped, 3 failed**. All failures
  are the existing Windows-shell expectations in `terminal-shell.test.cjs`;
  rerunning that file on unchanged main reproduces the same three failures.
- `npm run lint`, `npm run build`, `npm run check:theme` and `git diff --check`
  passed. Build still reports the existing large-chunk warning.
- Installed Codex CLI **0.161.0**: account handshake and 8 model entries read
  successfully, without printing or copying authentication material.
- Real read-only smoke: first turn returned `ARCHIMEDES_CODEX_SMOKE_OK`; a new
  app-server process resumed the thread and correctly recalled the same token.
- Real mutation-denial smoke in a disposable directory: **1 approval request,
  declined; 0 probe files created**, with a final text response received.
- Settings screenshots use the same viewport, Paper theme and API selection.
  The expanded Codex screenshot is a separate UI state, not a claim of a live
  inference. Approval screenshots render the actual before/after conversation
  component with a controlled command fixture; no command was executed for them.

Evidence: [verification summary](assets/codex-backend/verification.md).
