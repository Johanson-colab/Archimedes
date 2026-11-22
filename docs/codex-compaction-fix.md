# Long Codex session compaction

Before compaction, Archimedes resumes the native thread. Previously this requested full historical turns even though the adapter only uses thread metadata. The resume now sends `excludeTurns: true`; Codex retains its native history and performs compaction itself. This applies to ordinary resumed turns as well. It follows the [official app-server protocol](https://learn.chatgpt.com/docs/app-server); the installed Codex 0.161.0 schema confirms the field.

The receive limit now applies to each UTF-8 protocol frame rather than the aggregate batch received from stdout. Oversized frames still fail closed at 8,000,000 bytes. Errors name the pending RPC methods without including payloads, and closing a client releases its receive buffer. No failed operation is automatically replayed.

Regression evidence: 47 focused Codex and integration tests passed. The child-process fixture simulates an oversized full-history resume response and confirms that continuation and compaction succeed with metadata-only resume, preserve the native binding and leave local messages intact. Additional tests cover multiple valid frames exceeding the aggregate limit and oversized UTF-8 frames. These are protocol fixtures, not a successful compaction of the user's original session.

Lint and theme checks passed. Full-suite testing reported the existing experiment retry path assertion, Research Graph translation ordering, Library tabs audit and local LaTeX font failures. The menu inventory audit was also updated for the previously added SSH selector menu.
