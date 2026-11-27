Library collections can preview and import BibTeX references, retain citation keys, and export them back to a `.bib` file. Repeated imports match existing papers by normalized identifiers or compatible titles and keep current metadata, PDFs and reading notes. Users explicitly choose individual metadata repairs or citation-key replacements before importing. Matching prefers restored records already in the target collection/project.

Split from https://github.com/Johanson-colab/Archimedes/pull/336 following the maintainer's request; base: upstream `main` at `1f4b375`.

Validation: 9 focused parser, component, SQLite and IPC checks plus 12 adjacent Library checks pass; lint, build and theme checks pass. Standard functional-code `npm test`: 1,279 tests, 1,265 pass, 7 fail, 7 skip. The unchanged base has the same seven failures: three canonical Git/worktree checks, three Windows shell path fixtures on macOS and the library translation ordering check. The final dialog styling was checked in the actual renderer and with lint/build/theme.

The 1440×1000 charcoal/English pair uses the same preview project and collection. The new dialog has no baseline counterpart: before shows the existing collection entry; after previews an existing paper's optional venue repair and a new fixture reference.

| Before | After |
| --- | --- |
| ![Library before](https://raw.githubusercontent.com/feiiiiii5/Archimedes/b139da6d8e72aa096db255374d7c8c2ae15991dc/docs/assets/bibtex-interchange/before.png) | ![BibTeX preview after](https://raw.githubusercontent.com/feiiiiii5/Archimedes/b139da6d8e72aa096db255374d7c8c2ae15991dc/docs/assets/bibtex-interchange/after.png) |
