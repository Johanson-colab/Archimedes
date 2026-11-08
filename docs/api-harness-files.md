# API harness workspace tools

- `read_workspace_file` returns a bounded range with 1-based line numbers and
  `next_line`, including for files larger than the previous 64 KB read limit.
- `search_workspace_files` searches literal text and returns workspace-relative
  paths and line numbers. It bounds the number of entries, file sizes and matches,
  and reports truncation or skipped files.
- `edit_workspace_file` proposes an exact replacement. Ambiguous matches fail
  unless `replace_all` is explicit. The approval card shows the old and new text.
- `write_artifact` and precise edits target the actual project workspace. A
  content hash is checked at approval time; an external change rejects the stale
  proposal instead of overwriting it. Linked paths are not written through.
- `read_command_log` pages through a previous command's log by `action_id` and
  byte offset, restricted to commands belonging to the current conversation.

Run `node --test electron/agent/workspace-tools.test.cjs
electron/agent/command-runner.test.cjs electron/agent-capabilities.test.cjs
electron/chat-input-performance.test.cjs` for the focused behavior checks.
