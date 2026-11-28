Expose build identity in Settings → General → About: commit, channel, dirty-source flag, source fingerprint, runtime target and feature policy. Generate the identity before renderer builds and include it in packaged apps; source archives without Git explicitly report unknown identity. Display the package version from package metadata. The expanded diagnostic spans the About row and wraps long fingerprints without horizontal settings overflow.

Validation on macOS arm64 / Node 26.13.0:

- Two build-info tests pass using real temporary Git repositories, recorded package identity, the actual main handler and preload.
- Lint, build and theme checks pass. Standard `npm test`: 1272 tests, 1258 passed / 7 main-baseline failures (Git/worktree 3, Windows-target shell 3, translation ordering 1; #337–339) / 7 conditional skips.
- Matched renderer screenshots at 1440 × 1000. The after view uses actual collected identity; DOM measurements confirm the expanded settings body and JSON have no horizontal overflow.

Before:

![Before](https://raw.githubusercontent.com/feiiiiii5/Archimedes/cde892d508077bbc1291919399ef73fc68f6dff6/docs/assets/build-diagnostics/before.png)

After:

![After](https://raw.githubusercontent.com/feiiiiii5/Archimedes/cde892d508077bbc1291919399ef73fc68f6dff6/docs/assets/build-diagnostics/after.png)

Split from #336.
