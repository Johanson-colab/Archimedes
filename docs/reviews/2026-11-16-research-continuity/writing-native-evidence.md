# Writing continuity native evidence — 2026-11-16

Native audit uses the packaged macOS app, CUA accessibility actions and raw app
window screenshots. No model research run, cloud publication or collaboration
server is used. The isolated data/execution fixture is
`/private/tmp/archimedes-research-continuity-ui` (fixture metadata:
`/tmp/archimedes-research-continuity-ui.json`). Its project is `Research continuity`.

The before screenshots use the already-built f6b5ee3 app/renderer. The final
native audit uses the integrated package from `integrated-package-final.log`.
Theme is Charcoal. Before is 2200×1898 physical pixels; final functional captures
are 2200×1960 pixels. Native window resizing matched width; the 31 logical pixel
height difference is recorded rather than hidden by cropping or scaling.
The app's window had initially been rendered as a Stage Manager thumbnail;
those early thumbnail files were replaced by full-window captures.

Before project data includes one manuscript and one project paper. The project
index after data additionally uses the documented local seed script to supply
an analysis, a legacy reproduction run, a conclusion and an open question.
There is no old project-index surface; `project-before.png` records the earlier
project/session entry rather than an invented old index.

## Observed normal behavior

- The writing citation dialog lists only current-project library papers.
  Selecting `Tracing evidence through a research workflow` shows key
  `evidence2026` and target `paper/references.bib`. **Insert citation and update
  .bib** saved the entry and inserted `\\cite{evidence2026}` in the actual editor.
- **Save key version** saved `First referenced draft` with three real manuscript
  files: main, a section and the bibliography. Changing the main title and
  selecting **Compare** showed the actual old/new title diff.
- **Restore this key version** restored the original title in the editor and
  created `Before restoring First referenced draft` as a return version.
  Continued text was then entered, saved and submitted to the real compiler.
- Project research opens the exact `Evidence retention in research workflows`
  paper tab. The synthetic library fixture has no PDF, so its source reader
  correctly offers attaching a PDF; this does not claim PDF ingestion coverage.
- The experiment-run entry opens historical run `c954fbc4` under the intended
  reproduction. The UI explicitly says this legacy run has no input snapshot.
- The initial seeded analysis lacked the required `source.name`; the native UI
  reported `The analysis manifest is incomplete.` The fixture author corrected
  the seed, without changing product validation. Reopening then displayed
  `retention.csv`, two rows/two fields, workflow grouping and retained values.

## Test evidence

The author ran the writing history/citation/workspace, manuscript snapshot and
existing discovery/BibTeX suites together: **42 tests passed, 0 failed, 0 skipped**.
This includes real SQLite/FS, actual React components, save-owner queues,
metadata/key stability, manual-field preservation, multi-file/binary snapshots,
restore and continued saving, old roots without conversations, and version-only
project import. The real installed `/opt/homebrew/bin/tectonic` compile passed.
The integrated suite also records that real compiler subtest at
`integrated-test.log:718`.

Native compilation uses the app's managed Tectonic 0.17.0 and its own first-use
cache, separately from the installed-system compiler test. It completed
successfully in **474805 ms**, with a real one-page PDF showing the continued
text after restoration and the selected bibliography entry. The retained
source receipt recorded `status: current` at build completion. Afterwards,
explicit bibliography metadata updates and the final toolbar fixture reset
changed sources; that historical PDF is not claimed to be the current final
fixture. Exact receipt/PDF hashes are in `writing-native-result.json`.
Cache is retained at
`/Users/fei/Library/Application Support/Archimedes/latex-runtime` for subsequent
split-PR acceptance runs; no cache cleanup was performed.

After changing only the fixture's library metadata, the native citation dialog
showed the corrected title/year with unchanged `evidence2026`. **Update .bib
only** updated the actual bibliography, retained the hand-written original
entry/note, and did not insert a second citation. Opening `First referenced
draft` from the project research index directly selected its comparison and
showed both the main-source and bibliography changes. These final steps passed.

## Captures

Public raw captures are under `docs/assets/research-continuity/`:
`writing-before.png`, `writing-after.png`, `citations-after.png`,
`versions-after.png`, `project-before.png`, `project-after.png`,
`index-paper-after.png`, `index-analysis-after.png`, and `index-run-after.png`.
Additional captures: `restored-compiled-after.png`,
`citations-updated-after.png`, and `index-version-after.png`.
The screenshot API returns JPEG bytes; conversion to PNG for the published
`.png` files is a file-format conversion, without resizing, retouching or crop.
