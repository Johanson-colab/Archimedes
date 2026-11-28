# BibTeX cloud and batch identity follow-up

Two reviewer cases on PR #372:

1. A fresh title-only BibTeX import that omits the year must rejoin a unique legacy cloud record whose saved year and full author list are known. Only exact fingerprints were compared before, so sync uploaded a duplicate and pulled it back as a second local paper.
2. A title-only batch row must not learn an arXiv ID that contradicts a saved paper already identified by DOI. Before, the learned ID made the retained DOI row look conflicted and the alias row look like a duplicate, so neither could be imported.

Both fixtures use the repository's fake collaboration RPC and disposable SQLite workspaces. The logs below are from the same branch head `0ca7c583` with and without the fixes.
