# Research continuity implementation

Integrated source is frozen on `codex/research-continuity`, based on `f6b5ee3`. The previous #336 is closed and not merged; its maintainer requested several independent PRs. Actual split branches, dependencies and published links are in [PR_SPLIT.md](PR_SPLIT.md).

| Scope | Delivered | Meaningful acceptance |
| --- | --- | --- |
| Project research index and user conclusions/questions with evidence | Existing object adapters, explicit source requests, editable notes and project-transfer references. | Real SQLite reopen/removal/transfer and actual components; native paper/analysis/historical-run/named-version reopening. |
| Literature citations and named manuscript versions | Citation insertion/update through the manuscript save queue; owned multi-file snapshots, comparison/restore and a project registry for versions without a chat. | Real FS/DB and Tectonic focused checks; native Update .bib only retained manual fields and one citekey; named version restore/return point/continued writing plus actual managed compilation passed. |
| Explicit analysis/manuscript/figure handoffs | `research-handoffs.ts` owns preparation; App retains draft updates, selection and display. | Existing workflows preserved; delayed same-ID/different-root and historical-run selection tested. Independent QA's one actual old-root run-navigation issue was fixed, then the final standard suite/package rerun. |

Checkpoint lint passed. Standard `npm test`: **1466 tests, 1460 passed, 0 failed, 6 conditional skips**, including theme checks. The skips need latexmk, a managed TeX fixture environment variable, the external MemT PDF, local Kimi tools, or two Supabase account/Realtime fixtures. Logs: `integrated-lint.log`, `integrated-test-final.log`.

`package:desktop` exited 0 with types and renderer build; the local macOS arm64 app is unsigned (`integrated-package-final.log`). The sole native operator completed the normal chain and actual managed Tectonic compilation after its first font/package download; [native evidence](writing-native-evidence.md) and exact receipts are in `writing-native-result.json`. Historical compiled PDFs are not claimed current after later fixture edits. Captures are actual before/after files; their documented viewport-height difference is retained honestly.

`integrated-source-snapshot.tar.gz`, `integrated-tracked.patch` and `integrated-source-manifest.json` preserve modified/new source and public artifacts at this freeze. They remain local. The active integrated source and user work are not rewritten by the independent split worktrees.

The split work has since exposed two additional real defects: O11 delayed-save status after changing the target library (fixed in the O11 branch), and O04 manuscript location collision for different projects sharing one root (writer is fixing it). This frozen checkpoint does not contain those refinements. Final acceptance must integrate the actual final split branches and run checks on that result; this checkpoint suite is not presented as their final verification.
