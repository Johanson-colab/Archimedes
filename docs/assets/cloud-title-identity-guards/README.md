# Cloud title identity guards

Three reviewer cases on PR #413's cloud sync:

1. A sparse legacy title match must reject conflicting DOI/arXiv/S2 identifiers instead of reusing and overwriting a different cloud work.
2. A cloud row with no authors/year must be claimed by only one local upload; a second same-title paper gets its own cloud record.
3. A legacy cloud author stored as `Doe, Jane` must match a fresh `Jane Doe` import.

The matcher now checks identifier compatibility, claims each cloud row once per sync, and normalizes comma-separated author order. Logs use `node --test --test-name-pattern='legacy title match cannot overwrite|sparse cloud title match is claimed|last-name-first order' electron/library-sync.test.cjs` before and the full file after.
