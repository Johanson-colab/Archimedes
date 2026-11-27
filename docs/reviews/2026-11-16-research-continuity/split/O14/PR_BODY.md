Project analyses can save their complete CSV/TSV source, plot configuration, descriptive statistics, question and SVG chart, then reopen them after the project is reopened. Each project workspace retains its own working draft. Continuing in chat uses a linked discussion; users can prepare a summary draft or explicitly attach the complete source file's workspace path.

Discussion association updates only the registered relationship, preserving the saved source/configuration/chart if another dataset is selected during creation. A late completion also retains the original data store while the window is viewing another folder. The accepted 10MiB source file remains readable through workspace tools.

Split from https://github.com/Johanson-colab/Archimedes/pull/336 following the maintainer's request. This review targets the O02 fork branch at `9a879c6`, with its actual A02 and B1 prerequisites, so the diff shows this analysis feature only. O02: REPLACE_O02; A02: https://github.com/feiiiiii5/Archimedes/pull/1; B1: https://github.com/Johanson-colab/Archimedes/pull/341. Retarget to upstream `main` after the prerequisites merge.

Validation: 38 focused actual component, filesystem, SQLite/preload/IPC, handoff and adjacent checks pass; lint, build and theme pass. Standard `npm test`: 1,307 tests, 1,294 pass, 6 fail, 7 skip. The actual O02 base has the same six failures: two canonical Git checks, three Windows shell path fixtures on macOS and the library translation ordering check. All 15 additional tests pass.

The 1440×1000 Charcoal/English images use the actual base/head analysis component with the same synthetic CSV, configuration and question. The adapter calls the real result commands/store/filesystem. Saving was followed by unmounting the view, closing/reopening the database and reopening the saved entry. The source matched the original file byte for byte; the App discussion callback is tested separately.

| Before | After saving |
| --- | --- |
| ![Analysis before](REPLACE_BEFORE) | ![Analysis saved](REPLACE_AFTER) |

![Analysis reopened after closing the real store](REPLACE_REOPENED)
