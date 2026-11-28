# Backend provisioning cancellation verification

Verified on 2026-11-28 on branch `codex/reproduction-recovery-upstream` at `009a5335` plus the fixes in this branch. This is a main-process lifecycle fix with no renderer surface change, so the evidence is before/after test output rather than screenshots.

## Scenario

PR #356's review found that `reproduction:stop` aborted the controller but `main.cjs` awaited `backend.probe()` and `backend.prepare()` without passing that signal. A slow SSH probe, remote clone, or Docker start kept running after Stop was accepted, and the quit guard's two-second race could exit before cleanup.

The fix passes `controller.signal` into both backends' probe/prepare paths. SSH commands, the local-checkout copy fallback, and secret-file writes now reject on abort; each SSH command clears its timeout and removes its abort listener when it settles. Docker preparation is cancelled as described in `docs/assets/docker-prepare-cancellation/README.md`, which is also included in this branch.

## Focused regressions

`electron/reproduction-remote.test.cjs` drives `createSshBackend` with an injected fake `spawnImpl`; no SSH connection is opened. It checks that an aborted probe and an aborted provisioning command reject promptly and leave no abort listeners behind. It also checks the real `main.cjs` wiring for both SSH calls. `electron/structured-checkout-paths.test.cjs` contains the equivalent Docker checks with a fake `docker` executable.

Before (pre-fix source):

```text
node --test electron/reproduction-remote.test.cjs
✖ reproduction run passes its abort signal into SSH probe and preparation (1.209292ms)
✖ SSH probe aborts its command and releases the abort listener (8002.107417ms)
  'test timed out after 8000ms'
✖ SSH preparation aborts a slow provisioning command and releases its listeners (8002.639667ms)
  'test timed out after 8000ms'
```

After:

```text
node --test electron/reproduction-remote.test.cjs electron/structured-checkout-paths.test.cjs
✔ reproduction run passes its abort signal into SSH probe and preparation (0.369208ms)
✔ SSH probe aborts its command and releases the abort listener (1.3185ms)
✔ SSH preparation aborts a slow provisioning command and releases its listeners (3.613042ms)
✔ reproduction run passes its abort signal into Docker preparation (0.649291ms)
✔ cancelling Docker preparation kills docker run and still removes a possible container (1532.406583ms)
ℹ tests 18
ℹ pass 18
ℹ fail 0
```

The before log contains only the SSH file because the Docker evidence was captured separately on its own branch and carried into this one by commit `0eb4ae5b`.

## Project gates

- `npm run lint`: passed.
- `npm run build`: passed, with the existing large-chunk warning.
- `npm run check:theme`: passed.
- `npm test`: 1,695 tests, 1,689 passed, 0 failed, 6 skipped. The suite needs local socket access because the sandbox rejects `127.0.0.1` binding in the collaboration-server tests.
