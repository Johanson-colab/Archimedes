# SSH settings permissions and connection lifecycle

Base: main 2d30458. Validation on Windows, 2026-11-23.

Before: the SSH settings privacy test failed (438/0666 instead of 384/0600).
The original connection lifecycle implementation also failed all four initial
regressions because completed connections retained their timeout.

After: node --test electron/ssh-servers.test.cjs electron/ssh-connection-lifecycle.test.cjs
passes 20/20, including real Windows ACL checks after creating and updating settings.
The five lifecycle tests inject child processes and timers; no live SSH server is used.

npm run lint, npm run build, npm run check:theme, node --check and git diff --check pass.
Build retains the large chunk warning. npm test cannot start because the local Electron
runtime has no dist/version. The core suite was also attempted; see PR for its result.

The Windows writer uses Windows PowerShell to protect an empty temporary file before
writing metadata. ACL setup failure prevents replacement of the original settings.
This introduces a synchronous PowerShell invocation on settings saves (~0.5 seconds
per save on this machine); it is not used by the connection-check execution path.
Existing settings acquire the restricted ACL on their next successful save.
POSIX permissions remain 0600. Linux/macOS were not executed.

There are no renderer changes; tests are the before/after evidence.
