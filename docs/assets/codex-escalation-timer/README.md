# Codex shutdown escalation timer

The POSIX SIGKILL escalation timer was unreferenced, so a fast Electron shutdown could exit before it sent SIGKILL to a surviving same-group descendant. The timer is now referenced while cleanup is pending and is cleared when the child transport closes, so it cannot outlive the termination it guards. The Windows taskkill escalation uses the same tracked timer.

Logs use `node --test --test-name-pattern='SIGKILL escalation alive' electron/agent/codex-backend.test.cjs` at branch head `130ae064` before and after the change. The full focused file also passes 24/24.
