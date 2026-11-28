Switching a conversation mode previously made earlier research stages look accepted, even though no research evidence had been reviewed. This change presents the floating panel as **Work modes**: its buttons set the next-message mode, with no inferred completion, acceptance or downstream validation status. Pinning and returning to the original session remain available.

Split from #336 following the maintainer's request for independent feature PRs. Base: upstream `1f4b375`; no dependency on the ownership foundation or other split features.

Validation on this branch: `npm run lint`, `npm run build`, `npm run check:theme`, and the 22 focused component/panel/proactive checks pass. Standard `npm test` runs 1,271 tests: 1,257 pass, 7 fail, 7 skip. The same seven failures occur on the unchanged upstream base: three canonical Git/worktree checks, three Windows shell path fixtures on macOS, and the existing library translation ordering check. Those unrelated fixes are separate PRs.

Actual base/head renderer captures: 1440×1000, charcoal, English, same preview project and empty session.

| Before | After |
| --- | --- |
| ![Research path before](https://raw.githubusercontent.com/feiiiiii5/Archimedes/2bb4aa48a6c0c21d3ef81194feab8ce4461a5404/docs/assets/work-modes/before.png) | ![Work modes after](https://raw.githubusercontent.com/feiiiiii5/Archimedes/2bb4aa48a6c0c21d3ef81194feab8ce4461a5404/docs/assets/work-modes/after.png) |
