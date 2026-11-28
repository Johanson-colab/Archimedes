# Legacy BibTeX key after a partial repair

The fixture saves a no-ID reference with the old parser's TeX spellings for its title and author, then repairs only the title. Reimporting the original BibTeX used to see a citation-key conflict instead of the saved paper; the preview and SQLite now resolve the same ID.

Both logs come from `node --test --test-name-pattern='title-only repair of a legacy record' electron/bibliography-interchange.test.cjs` on the same macOS fixture. The before run used the unmodified `matchBibliographyPaper` on branch head `c16bc302`; the after run used the widened legacy fallback with the same test.

The full focused file also passes: `node --test electron/bibliography-interchange.test.cjs` reports 38 tests, 38 passed, 0 failed.
