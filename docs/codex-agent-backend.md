# Native Codex Agent backend (issues #233, #235)

## Scope and authorization

Issue: https://github.com/Johanson-colab/Archimedes/issues/233

The repository owner explicitly requested the initial external backend (#233,
merged PR #234), then approved retaining the Archimedes UI while Codex manages
execution, context and permissions. The follow-up implementation authorization
is recorded in [#235](https://github.com/Johanson-colab/Archimedes/issues/235).
Changes use a new PR; no direct main push or automatic merge.

## Design

- Preserve the API harness as the default and for internal research workers.
- Add an opt-in Codex app-server adapter for main Work conversations.
- Keep configuration free of copied Codex credentials and use local CLI auth.
- Persist backend/native-thread bindings separately from public chat history.
- Stream bounded native activities with stable item IDs, output, plans and diffs.
  Public commentary is separate from the final answer; hidden reasoning is not
  displayed. Never replay a turn automatically after uncertain delivery.
- Start with a restricted sandbox, bridge supported approvals, deny unknown
  requests, and keep read-only conversations out of the external execution path.
- Reset native continuity when local history is undone/forked or the backend or
  workspace changes; preserve old native history rather than deleting it.

Protocol reference: https://learn.chatgpt.com/docs/app-server

## Usage

1. Install a current Codex CLI and run `codex login` in a terminal.
2. In Settings → Models, open the top-level **Agent backends** tab. The Codex
   card is expanded by default; use **Check Codex** to verify the connection.
3. Use `codex` from PATH or an absolute native executable path. A model override
   is optional; empty uses native Codex configuration. Archimedes' API model
   selector does not select the Codex model.
   Select an advertised native thinking effort after choosing a model, or keep
   **Codex default**. Choose **Read-only** or explicitly select **Workspace write**;
   the latter allows edits and commands within the project without per-command
   approval. Saving applies these choices to the next main Work turn.
4. Click **Use Codex** (or **Save backend** when already enabled). The next main Work turn uses that backend, including
   when no Archimedes API key is configured. Existing running turns are unchanged.

**API models** is a separate tab for API providers, keys and models. Changing
tabs or checking Codex does not change the runtime; only explicit save/activation
does. Unsaved inputs survive tab switches. The Agent tab shows the saved Work
runtime and lets you **Use API harness** to switch back. A Codex badge on the
tab marks the saved native runtime even while browsing API models. Connection
status is independent: saved activation never implies a successful connection.
Editing native configuration invalidates the previous detection result.
Only Codex is implemented; the UI does not advertise other agents as available.

Each turn owns an app-server process and closes it afterward; the persisted
native thread is resumed on the next turn or after an application restart.
This deliberately favors isolated lifecycle handling over a resident process
cache in the first version. Native identifiers stay local, outside exported,
synced and forked conversation payloads.

## Permissions and compatibility

Codex defaults to a read-only sandbox and `on-request` approvals routed to the
user. Workspace write is an explicit opt-in; no full-access preset is exposed.
Read-only is **not** a promise of workspace-only
filesystem reads. Explicit approvals can grant execution beyond that sandbox;
review the entire command or proposed file changes. File-root grants outside
the workspace, opaque grants, additional-permission requests and unknown server
requests are denied explicitly. Concrete native command network requests can
be displayed and accepted once; root/session/policy grants are not inferred.
Read-only commands allowed by the sandbox do not need conversational permission.

Codex may load tools/MCP servers from its own configuration. Those tools use
native permissions and prior grants; a read-only filesystem sandbox does not
block remote-service side effects. Review native tool configuration before use.
This version does not recreate the API harness's tool allowlist inside Codex.

Supported native approval cards are executed by Codex only: the renderer must
never run them a second time in its terminal. Stop, timeout or process exit
rejects pending local cards and never retries an uncertain turn automatically.
Partial changes are not rolled back.

The backend has local Codex's tools, not Archimedes' API function tools. Files,
folders, selected excerpts, images and paper/repository metadata are passed as
context; metadata does not mean the underlying source was read. Plugin/skill
attachments fail explicitly. Native questions render answer cards; switching
chats preserves pending questions, and completion/stop invalidates them.
While Codex runs, Enter or **Steer Codex** sends text to its current native turn;
attachments wait for the next turn. `/compact` calls native compaction for main
Work when Codex is selected, preserving visible chat history.
Permission-profile grants, automatic artifact registration and internal-worker
migration remain outside this implementation.
Paper chat, Side, review workers, Proactive and FigureForge keep their API paths.
Codex retains its native instructions, AGENTS discovery and context management.
API prompts, tool budgets, character estimates and local summaries are bypassed.
The composer shows native token usage only after a native report; before then,
it shows **Unknown**. These are the last reported context tokens, not lifetime
usage. Native effort/model controls live in Models → Agent backends.
Windows `.cmd` launchers are rejected; a native executable
is required, and Windows runtime behavior has not been verified on this Mac.

The backend choice is a local default for main Work, not a shared project
setting. Fork/undo, an intervening API turn, a changed workspace/model or an
unsuccessful native turn causes the next turn to start a new native thread with
the available Archimedes history. A missing native thread produces an explicit
error, not a silent API fallback.

## Original #234 verification (historical)

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

For current #235 checks and matched component screenshots, see
[native workflow verification](assets/native-codex/verification.md).
