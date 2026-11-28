# Truncated author aliases in cloud sync

A title-keyed cloud paper with the full author list and a fresh local import with BibTeX's `and others` truncation produced different fingerprint hashes. Sync uploaded a second cloud row instead of reusing the existing paper and its saved state. The fallback now uses the same unique-title compatibility check as local imports; it only applies to title-keyed rows with no strong identifiers, and ambiguous candidates are left alone.

Logs use `node --test --test-name-pattern='truncated in the import' electron/library-sync.test.cjs` at branch head `7f92b91f` before and after the change. The full focused file also passes 10/10.
