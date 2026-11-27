# Managed Research Apps validation

Date: 2026-11-26 (macOS, Apple Silicon). Tracks #256 and draft PR #428.

## Automated results

- `npm run lint`: passed.
- `npm run build`: passed, existing chunk size warning.
- `npm run check:theme`: passed.
- Runtime / renderer / IPC tests: **15 passed, 0 failed**. Includes an actual Python HTTP child, cancellation/restart race, install without implicit execution, and source approval invalidation.
- Full `npm test`: **1,582 tests, 1,573 passed, 4 failed, 5 skipped**. Because the test command short-circuits after failures, theme was also run separately.

The same four failures were reproduced on the unmodified base in the prior [baseline evidence](../create-scientific-capabilities/validation.md): experiment retry `/var` versus `/private/var` path assertion; pre-existing `native.ts` translation ordering; local LaTeX template compilation; existing LibraryView Tabs audit. None was weakened or changed here.

## Actual desktop flow

Existing local `molecule-workbench`, previously generated in a native Codex Create conversation, was adapted with a manifest and readiness header. It uses its existing App-local Python 3.13 / RDKit environment, not a runtime Agent.

1. A draft was discovered and started in an isolated host iframe.
2. Synthetic sample analysis displayed **5 rows, 3 valid structures, 2 invalid rows**, computed descriptors and molecular structure images.
3. The user approved the native Install dialog. The workspace installation record was saved and the App appeared in the sidebar.
4. Unpin removed the entry immediately; pin restored it. Pinning a stopped App left it stopped.
5. Opening it from the sidebar started a host-owned Python service. Stopping closed its port. Leaving/reopening and quitting/restarting the host retained the registration and restarted on demand with a new port. Observed ports included 55757, 56592 and 57214; stopped/quit ports no longer had listeners.
6. Native Agent turn completion did not own or terminate the managed Python process. No provider/Environment vault keys were injected.

A development hot reload during the first installation left stale rendering; a fresh full desktop launch was used for final verification. Subsequent pin/unpin controls updated immediately. This does not establish that every existing application-wide HMR behavior is fixed.

`before-install.png` and `after-install.png` use the same native window size, paper theme and sample data; the latter shows the sidebar entry and installed controls. The manager is a new surface without a pre-feature screenshot counterpart; `manager.png` records it. The new Settings entry is recorded in `settings-after.png`; an attempted pre-change Settings capture returned the same stale native frame after source reload, so that duplicate was discarded instead of being presented as before evidence. The installation pair provides the comparable sidebar/preview evidence. No screenshots are mocked.

## Limits

No Windows desktop run, packaged-ASAR test, new paid model generation or full 56-skill workflow sweep was performed. Runtime Agent invocation, credential binding, automatic dependency provisioning, code editor/build sandbox and App migrations remain unfinished. Python code executes with local user permissions; iframe isolation is not an OS sandbox.
