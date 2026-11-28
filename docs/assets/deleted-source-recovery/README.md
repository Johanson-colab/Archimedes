# Deleted Writing source recovery

If an external editor deletes a source while Writing has a dirty buffer, the optimistic write and the conflict handler both used to throw `ENOENT` before the UI recognized a conflict, leaving no recovery action. Conflict detection now includes missing-file errors, the handler treats the deleted file as an empty save baseline, and the workspace write handler accepts an expected-empty baseline so the draft can recreate the file.

Logs use `node --test --test-name-pattern='deleted source can still recover' electron/paper-writing-workspace.test.cjs` at branch head `2b0ac373` before and after the change.
