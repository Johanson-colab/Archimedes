# Superseded Writing autosave scope

A 750 ms autosave captured a closure for project A. If the user switched to project B while Writing stayed active, the completed save still checked only that Writing was active and started A's compile from B's view. The callback now also requires the captured scope owner and thread ID to match the active context.

The regression holds the first save open, switches project scopes, then releases the save and asserts no compilation was started. Logs use `node --test --test-name-pattern='superseded writing scope' electron/paper-writing-workspace.test.cjs` at branch head `3c899173` before and after the change.
