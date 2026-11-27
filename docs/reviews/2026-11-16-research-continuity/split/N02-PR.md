Add **Insert citation** to the manuscript editor. Search the current project's library, select a `.bib` file and explicitly insert a stable `\cite{key}`, update that entry's metadata, or do both. Existing manuscript keys, hand-written fields, other entries and directives are retained. Standard concatenated field expressions are replaced as complete spans; they are not evaluated as metadata.

This review PR targets `codex/manuscript-citations-base` (`ff5f0c4`), containing the required [existing-manuscript saves](https://github.com/Johanson-colab/Archimedes/pull/348) and [BibTeX interchange](https://github.com/Johanson-colab/Archimedes/pull/346) changes. Its diff contains only the citation workflow. After those prerequisites merge, this feature branch can be rebased and submitted upstream. Split from [the closed original PR](https://github.com/Johanson-colab/Archimedes/pull/336) as [requested](https://github.com/Johanson-colab/Archimedes/pull/336#issuecomment-6912591490).

| Before | After |
| --- | --- |
| ![Saved manuscript before citations](https://raw.githubusercontent.com/feiiiiii5/Archimedes/3681335b22841b7ff011bc757509bfb09314218a/docs/assets/manuscript-citations/before.png) | ![Citation action in the same manuscript](https://raw.githubusercontent.com/feiiiiii5/Archimedes/3681335b22841b7ff011bc757509bfb09314218a/docs/assets/manuscript-citations/after.png) |

![Explicit metadata update preserves the citation key](https://raw.githubusercontent.com/feiiiiii5/Archimedes/3681335b22841b7ff011bc757509bfb09314218a/docs/assets/manuscript-citations/updated.png)

The pair uses the same 1440×1000 content viewport, Charcoal theme and saved source state. [Capture and real compile details](https://github.com/feiiiiii5/Archimedes/blob/3681335b22841b7ff011bc757509bfb09314218a/docs/assets/manuscript-citations/README.md).

Validation: focused filesystem/SQLite/component checks **24/24 passed**, including search→select→insert, stable fallback keys without changing library records, metadata refresh, concatenated-field preservation and the existing save queues. The actual renderer insertion→metadata update→recompile path succeeded with managed Tectonic; one citation and the handwritten entry remained. Lint, build and theme checks passed. Standard `npm test`: **1294 total, 1280 passed, 7 inherited failures, 7 skipped**; the seven same-main Git/worktree, Windows-shell and translation-order failures remain, and the four new citation behavior tests pass.
