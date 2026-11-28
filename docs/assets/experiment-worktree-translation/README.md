# Experiment worktree race translation

The async Git branch returns `The experiment worktree base changed. Try again.` from `prepare_experiment_workspace`. The string was missing from the Chinese session shard, so the chat timeline showed it in English. The regression checks that the exact error string emitted by `electron/store.cjs` has a non-ASCII value in `src/i18n/translations/session.ts`.

Before/after logs use `node --test --test-name-pattern='experiment worktree race has a translated' electron/i18n-translations.test.cjs`.
