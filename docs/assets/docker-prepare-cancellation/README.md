# Docker preparation cancellation verification

Verified on 2026-11-28 on branch `codex/b04-quit-resources` at `588e91c2` plus the fix in this branch. This is a main-process lifecycle fix, not a renderer/UI change, so no matched screenshots apply; the evidence is the focused before/after test output in this directory.

## Scenario

A local Docker reproduction can be stopped while `docker info` or `docker run` is still in flight. Previously `main.cjs` awaited `backend.prepare()` without the run's `AbortSignal`. A Stop-and-quit request therefore left Docker provisioning running, and the 2-second quit guard could exit before the catch block disposed the container.

The fix passes `controller.signal` into `backend.prepare()`. `dockerVersion`, `docker run`, and the secret-file write now receive that signal; the abort listener is removed when each child closes. The backend marks the container as possibly created *before* `docker run`, so `dispose()` still removes it if an abort kills the CLI after the daemon created the container.

## Focused regression

`electron/structured-checkout-paths.test.cjs` uses a fake `docker` executable on `PATH`, so no real container or image is involved. It aborts during `docker run`, requires preparation to reject within three seconds, checks that the signal has no retained listeners, and checks that `dispose()` issues `docker rm -f` for the named container. A second test checks the main-process wiring passes the signal.

Before (pre-fix source, core timing regression only):

```text
node --test electron/structured-checkout-paths.test.cjs
✖ cancelling Docker preparation kills docker run and still removes a possible container (10239.666666ms)
AssertionError [ERR_ASSERTION]: Missing expected rejection.
ℹ tests 4
ℹ pass 3
ℹ fail 1
```

After:

```text
node --test electron/structured-checkout-paths.test.cjs
✔ reproduction passes its abort signal into Docker preparation (1.413333ms)
✔ cancelling Docker preparation kills docker run and still removes a possible container (327.64475ms)
✔ Docker structured files reject external directory/final symlinks and preserve ordinary nested edits (4.309333ms)
✔ SSH production file scripts preserve stdin/quoting, refuse linked paths and never truncate a complete-read result silently (33.091208ms)
✔ the real pilot never falls back to another file after a structured read-limit error (7.248333ms)
ℹ tests 5
ℹ pass 5
ℹ fail 0
```

The before log predates the wiring assertion, which is why it contains four tests instead of five.

## Project gates

- `npm run lint`: passed.
- `npm run build`: passed, with the existing large-chunk warning.
- `npm run check:theme`: passed.
- `npm test` inside the sandbox: failed only because local socket binding returned `listen EPERM 127.0.0.1` for `server/collab-server.test.cjs`.
- `npm test` with local socket access: 1,687 tests, 1,681 passed, 0 failed, 6 skipped.
