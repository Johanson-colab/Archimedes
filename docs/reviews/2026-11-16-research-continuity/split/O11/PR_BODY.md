Daily-paper and conference discovery now retain the current project's query, candidates, filters and destination library when users visit a paper or another tool and return. Users can create a destination collection beside **Save to**. Reopening checks the selected library's actual papers, and a delayed save into a previous library does not mark a candidate in the new destination as saved.

Split from #336 following the maintainer's request; base: upstream `main` at `1f4b375`.

Validation: 11 focused discovery/Library component checks pass, including the delayed-target save regression; lint, build and theme checks pass. Standard `npm test`: 1,273 tests, 1,259 pass, 7 fail, 7 skip. The unchanged base has the same seven failures: three canonical Git/worktree checks, three Windows shell path fixtures on macOS and the library translation ordering check.

The 1440×1000 charcoal/English renderer pair follows the same actions: search `ReAct`, choose `RAG & Long Context`, visit Library and return. The baseline loses the search/destination; this branch restores them. Candidate content uses bundled preview data.

| Before | After |
| --- | --- |
| ![Discovery before](https://raw.githubusercontent.com/feiiiiii5/Archimedes/8d4dea21021d1b2dac6cd927a42d4c7e30b3ac83/docs/assets/discovery-state/before.png) | ![Discovery after](https://raw.githubusercontent.com/feiiiiii5/Archimedes/8d4dea21021d1b2dac6cd927a42d4c7e30b3ac83/docs/assets/discovery-state/after.png) |
