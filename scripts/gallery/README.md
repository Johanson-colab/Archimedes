# Archimedes Gallery pipeline

The Gallery additions use the same curation stages as Top-Conf Figure Gallery:

1. `npm run gallery:pool` builds complete accepted-paper pools from CVF Open
   Access, ECVA/ECCV, ACL Anthology, and the official EMNLP 2026 program.
2. `npm run gallery:extract` downloads official PDFs, locates Figure 1 in the
   first four pages, crops it, and records vector, text, bitmap, and edge stats.
3. `npm run gallery:select` applies the upstream reject rules, design score,
   dHash deduplication, and proportional venue/year quota allocation.
4. `npm run gallery:sheets` creates enumerated contact sheets for human QA.
   Rejected ids can be added to `scripts/gallery/exclude.txt` before
   selecting again.
5. `python3 scripts/gallery-pipeline.py assemble` writes reviewed JPEGs to
   `public/gallery/images/<venue>/final` and updates `src/gallery-catalog.json`.

All intermediate files are resumable and ignored by Git under
`scripts/.gallery-work`. `--limit-per-year` is an optional execution budget for
an incremental extraction run; it does not set the final number of figures.
Without it, extraction processes every paper with an available official PDF.
Use `--retry-failed` to retry transient PDF download failures without repeating
successful crops or papers that genuinely have no Figure 1.

ECCV 2026 PDFs are resolved from the official conference paper pages. EMNLP
2026 has an official accepted Main Conference roster, but ACL Anthology had not
published the proceedings as of 2026-10-12. Its complete roster is kept in the
pool with `awaiting-acl-anthology`; the extractor will include those papers once
official PDF URLs become available rather than substituting unverified drafts.
