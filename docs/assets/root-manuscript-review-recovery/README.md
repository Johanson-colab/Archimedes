# Root manuscript compile and retained review pages

Two PR #414 review cases:

- A root-level `main.tex` has no project directory, so the save barrier previously treated every opened document below the execution root as part of that manuscript. A dirty buffer in a nested project could block compilation. The barrier now excludes roots of other detected LaTeX projects.
- `paper-review-app:manuscript-page` required the execution workspace even when a retained PDF with the reviewed SHA-256 is available. It now uses record-only authorization, matching the saved review export path, so deleted sandbox/worktree workspaces can still open and export the reviewed page.

Logs are from the focused writing and manuscript-retention suites.
