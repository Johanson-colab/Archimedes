A delayed reply, approval, file-reading callback or terminal child could use the global SQLite selection after its window opened another data workspace. Bind each IPC invocation to the sender's canonical data root and capture a store for agent/tool/native operations. Terminal children retain a separate lease after the initial IPC returns; completion releases it. Matching conversation IDs in different data roots have independent active-run and approval identities.

The sender’s data root owns persistence while filesystem operations keep the project/session execution path.

Validation on macOS arm64, Node 26.13.0 with the existing installed dependencies:

- Real SQLite/IPC and production terminal-handler tests cover delayed A writes after switching to B, deferred store close, canonical aliases and a real child process. Real agent runs with the same imported thread ID in two stores can be stopped/approved independently. The focused handler/thread audit group passes 24/24.
- `npm run lint`, `npm run build`, and `npm run check:theme`: passed.
- Standard `npm test`: 1275 tests, **1262 passed, 6 failed, 7 conditional skips**. The six failures are existing main failures: two Git-state tests (#337), three Windows-target shell tests (#338), and translation ordering (#339). The same-environment main baseline has 1256 passes / 7 failures / 7 skips; its additional worktree failure passes here because the store now supplies canonical paths.
- Existing canonical-path expectations were updated to physical directory identity, and the source audit now locates the actual IPC binding.

Split from #336.
