# SSH preparation, cancellation, and upload lifecycle

Refs [#218](https://github.com/Johanson-colab/Archimedes/issues/218).
Baseline: main at `83f819177654a843fb1ebdab79d8380d73d22966`.
Validated on Windows x64 / Node 24.14.0 on 2026-11-12.

This fixes transport reliability within the existing SSH reproduction backend,
not the complete M1-M4 roadmap. No renderer styling or layout was changed;
behavior tests and before/after test counts are the evidence for this change.

## Failure cases and resulting behavior

| Case | Previous behavior | Result |
| --- | --- | --- |
| Stop during SSH preparation | Controller was created only when the pilot started | Probe/clone/upload share the session signal; stop records cancelled/stopped |
| Completed command | Timeout and abort listener remained registered | Both are released; a later abort cannot kill an old child |
| tar fails while SSH exits 0 | SSH exit alone could report upload success | Both exits are required; producer failure rejects the upload |
| SSH exits early or stdin breaks | Producer could remain alive; stream errors were unhandled | Reject and stop the owned local processes; close pipes |
| Upload stalls | No upload deadline | Bounded timeout, local process cleanup, explicit timeout error |
| Backend disposed | Active transport work could continue | Abort active operations, wait for cleanup, refuse new work |
| Checkout revision or marker command fails | Preparation could still emit started | Preparation fails before the pilot is started |
| Stop before secret upload | Disposal could reconnect to delete an unused path | No cleanup connection unless the secret write may have started |

## Focused validation

```text
node --test electron/reproduction-cancellation.test.cjs electron/reproduction-ssh-lifecycle.test.cjs electron/reproduction-remote.test.cjs
```

Result: **31 passed, 0 failed** (21 new tests).

Coverage includes false-success prevention, UTF-8 chunk boundaries, missing
executables and synchronous spawn errors, early SSH exit, broken upload pipes,
pre-aborted signals, upload/command timeouts, successful-command cleanup,
Windows taskkill timeout/fallback, disposal and secret-file cleanup. The run/stop
tests execute the actual registered IPC handler bodies with an injected backend;
they verify stopping preparation prevents later commands and persists the
cancelled state. Pilot-entry coverage checks the original controller is retained.

A local integration test starts a real Node child and cancels it using the same
cleanup path (including real taskkill on Windows), waits for close, and confirms
the owned PID no longer exists. It requires no SSH server or credentials.

## Full checks

`npm run lint`, `npm run build`, `npm run check:theme`, `node --check
electron/main.cjs`, and `git diff --check` passed. Build retains the existing
large-chunk warning.

| Version | Tests | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| Unmodified main baseline | 1163 | 1060 | 86 | 17 |
| With this change | 1184 | 1081 | 86 | 17 |

Failed test names match exactly; no additional failures were introduced.
**The full suite is not green** on this Windows machine. Electron-dependent
baseline checks reused the installed Electron 43.4.1 runtime through
`ELECTRON_OVERRIDE_DIST_PATH`; the focused transport tests use ordinary Node.

## Limits

No live SSH server, authentication, remote tar extraction, remote secret-file
deletion, or real model calls were exercised. Cross-platform termination behavior
still needs Linux/macOS integration checks. Killing a local SSH process cannot
guarantee cancellation of a detached server workload. Reconnectable remote jobs,
numeric paper-result comparison, and batch reproduction remain separate work.
