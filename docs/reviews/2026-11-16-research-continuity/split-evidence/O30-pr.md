Declare the Node/npm versions required by the locked dependencies and native TypeScript tests, enforced at installation by npm engines and engine-strict. Pin the development toolchain in `.node-version` and `packageManager`, align the lockfile engine metadata, and add a manual `check:env` command to both source-install guides before `npm ci`.

Validation on macOS arm64 / Node 26.13.0 / npm 11.20.0:

- `npm run check:env`: passed on the pinned combination. The version checker also accepts/rejects the supported and unsupported Node/npm fixtures.
- Lint, build and theme checks: passed.
- Standard `npm test`: 1271 tests, 1257 passed / 7 failed / 7 conditional skips. The seven failures match the same-main baseline (Git/worktree 3, Windows-target shell 3, translation ordering 1; split into #337–339).

The declared compatibility range is broader than the single development toolchain run here.

Split from #336.
