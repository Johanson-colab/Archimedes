# Research SSH workspace (preview)

Research conversations can use a local Codex session with a saved SSH server. Add the server in the existing SSH server settings, select Codex and Research, then select the server in the composer. Use an approval-enabled Codex permission mode. Existing Codex chats created without the SSH tool need a new Research conversation.

Codex runs on the local machine and retains its native conversation, context and permission handling. When asked to work remotely, it can call the `ssh_remote_exec` dynamic tool. Each remote shell command displays its target, directory and command for approval before execution. Codex's ordinary file and shell tools still operate locally; this is not transparent redirection of all native tools. The selected server resets when opening a different conversation.

Remote commands are not Archimedes-managed experiment Runs and do not automatically create Research Graph evidence. Reproduce remains separate. Commands time out after 60 seconds and their output is bounded; cancellation, timeout or a connection failure does not prove that the remote process stopped. Inspect the server before retrying. Long-running jobs, reconnection, remote run tracking and reproducible snapshots are not implemented here. Host-key behavior follows the existing SSH server connection settings.
