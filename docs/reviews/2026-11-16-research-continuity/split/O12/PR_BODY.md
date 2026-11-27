Papers saved from daily, deep-search or conference discovery retain the project's selection reason and the discovery query, criteria, providers and timestamp. The paper inspector lets users edit the project reason while keeping personal reading notes and the machine match explanation separate. The same paper can carry different reasons in different projects.

Split from #336 following the maintainer's request; base: upstream `main` at `1f4b375`.

Validation: 15 focused SQLite, IPC, component and adjacent Library checks pass; lint, build and theme checks pass. Standard `npm test`: 1,276 tests, 1,262 pass, 7 fail, 7 skip. The unchanged base has the same seven failures: three canonical Git/worktree checks, three Windows shell path fixtures on macOS and the library translation ordering check.

The 1440×1000 charcoal/English renderer pair uses the same preview project, collection and selected paper. The new project reason is manually entered and saved.

| Before | After |
| --- | --- |
| ![Paper inspector before](https://raw.githubusercontent.com/feiiiiii5/Archimedes/2df7873ede42d7a4e5754d4bee0028a96fd921a2/docs/assets/project-paper-selection/before.png) | ![Project selection reason after](https://raw.githubusercontent.com/feiiiiii5/Archimedes/2df7873ede42d7a4e5754d4bee0028a96fd921a2/docs/assets/project-paper-selection/after.png) |
