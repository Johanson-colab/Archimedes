# API harness command execution

The API harness waits for the user to approve a proposed command. Once approved,
the backend runs it in the selected workspace directory and returns its output,
exit status, duration and workspace-relative log path to the model. Rejected or
interrupted approvals cannot start a command. The renderer does not launch the
same command a second time.

Output sent to the model is capped at 32,000 characters; the log under
`.archimedes/agent-command-logs/` is capped at 10 MiB and created with private
permissions. The returned `output_truncated` and `log_truncated` flags explain
when either limit was reached. The default timeout is 10 minutes and the model
can request up to 60 minutes. Cancellation and timeout stop the process group.
Command-induced workspace changes remain visible in the existing change list.

Verification: `node --test electron/agent/command-runner.test.cjs
electron/window-agent-run.test.cjs electron/workspace-files.test.cjs
electron/codex-agent-integration.test.cjs` exercises real child processes,
approval and denial, model feedback, timeout, cancellation and changes. No
visual layout changed; existing activity and approval UI are reused.
