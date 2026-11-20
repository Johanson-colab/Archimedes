# Two papers with the same title in a BibTeX batch

The first and third entries report different DOIs. The middle entry repeats the title without a DOI. Previously it suppressed the distinct third paper. The revised preview keeps both identified papers available for import and marks only the middle entry as a duplicate.

| Before | After |
| --- | --- |
| ![Original preview](before.png) | ![Revised preview](after.png) |

Actual Library dialog rendered in Electron at 1280 × 870, Paper theme, English, using the same BibTeX and a disposable SQLite collection. No provider calls were made.

The alias pair uses the same Paper dialog at 1280 × 870 and three records linked by a DOI and an arXiv ID. The third row changes from a new reference to a duplicate of the retained record. The existing pair above covers an ambiguous title-only bridge.

## Identifiers and title aliases after import

Both comparisons use the Library dialog in Electron at 1280 × 870 in the Paper theme, with a disposable SQLite collection.

- [Before](identifiers-before.png) · [After](identifiers-after.png). The first reference has a DOI and gains arXiv `2401.01234` from a strong duplicate. Before the fix, the two selected rows wrote one record with arXiv `2401.05678`. After the fix, the DOI stays with `2401.01234` and the distinct `2401.05678` work is saved separately.
- [Before](titles-before.png) · [After](titles-after.png). A strong DOI match establishes the alternate title. The title-only alias is suppressed while the row with a conflicting arXiv ID stays selectable and is saved.

## Selected title repair and contradictory identifiers

Both pairs show the actual Electron dialog after pressing Import in the same 1280 × 870 Paper viewport with the interface set to Chinese.

- [Before](repair-before.png) · [After](repair-after.png). The first input row corrects the title of a saved paper by DOI. A later row resolves to the same paper by its old title. The old flow added a second record under the old title. The revised flow keeps the original paper ID and notes, and exports one record with the corrected title and its citation key.
- [Before](conflict-before.png) · [After](conflict-after.png). A learned arXiv alias gives two retained rows the same arXiv ID and conflicting DOIs. The old flow saved the first reference and stopped on the second. The revised preview blocks both conflicting rows with instructions to edit the source and imports the unrelated reference. After correcting the arXiv ID, both works import. Repeating the corrected batch preserves all three paper IDs.
