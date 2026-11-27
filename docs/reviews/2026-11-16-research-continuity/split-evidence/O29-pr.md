Move the existing “Back to reading” and “Copy Markdown” entries into alphabetical order in their translation shards. The keys and translated values are unchanged.

Validation: `node --test electron/i18n-translations.test.cjs` changes from 2 passes / 1 ordering failure on upstream main to 3/3 passing. No test assertions changed.

Split from #336.
