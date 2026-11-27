Add a durable result package shared by the analysis and figure workflows: original source/reference/output files, editable manifest, project/workspace ownership and SHA-256 receipts. List/detail reads return metadata; file content is read explicitly, with changed or missing files reported. Saving a result does not create a conversation.

This PR adds storage and the desktop API only. Analysis/figure producer interfaces and insertion into a manuscript follow separately. It depends on the workspace-owner contract; this stack's diff contains only result storage and its four API methods.

Validation on macOS arm64 / Node 26.13.0, reusing installed dependencies:

- Result package, actual preload/IPC + SQLite/filesystem, and workspace-owner tests: 12/12 passed. They cover byte-for-byte reopen, old execution roots, invalid session ownership, viewer reads, changed hashes and symlink boundaries.
- `npm run lint` and `npm run build`: passed.
- No business assertions were removed. Analysis-agent consumption and figure-to-manuscript tests remain with their respective follow-up features.

Split from #336.
