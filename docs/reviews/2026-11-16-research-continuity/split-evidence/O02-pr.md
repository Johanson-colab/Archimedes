Keep unsent text, attachments, pending insertions and queued follow-ups with their conversation owner, including the data folder. A failed send restores its original prompt alongside later typing. When a new conversation receives its first saved ID, move only its own remaining draft and queue to that conversation. Notes and News name the target chat and append there; replacing the prompt remains an explicit Notes action.

Notes persistence uses the same complete owner. Existing thread/draft notes are claimed once from their legacy key; same-ID conversations in another data folder remain separate after reopening.

Depends on [the task-context review](https://github.com/feiiiiii5/Archimedes/pull/1), which depends on [upstream #341](https://github.com/Johanson-colab/Archimedes/pull/341). The review base contains those necessary ownership changes, so this diff adds only composer/Notes/News behavior.

Validation on macOS arm64 / Node 26.13.0:

- Actual App callbacks and Notes component cover delayed attachment insertion, failed/successful sends after switching, first-session draft/queue migration, named append/explicit replace and legacy localStorage claims. Real note files verify one-time legacy migration and isolation across reloads, including long owner paths.
- Lint, build and theme checks passed. Standard `npm test`: 1292 tests, 1279 passed / 6 inherited failures / 7 conditional skips. The failures match the task-context base: Git state 2, Windows-target shell 3, translation ordering 1 ([Git #337](https://github.com/Johanson-colab/Archimedes/pull/337), [Windows #338](https://github.com/Johanson-colab/Archimedes/pull/338), [i18n #339](https://github.com/Johanson-colab/Archimedes/pull/339)).
- Matched renderer screenshots at 1440 × 1000, English, charcoal, default text size. The Notes/composer pair retains the same existing prompt and appended note. News shares the tested owner-bound append callback.

| Surface | Before | After |
| --- | --- | --- |
| Notes and composer | ![Notes before](https://raw.githubusercontent.com/feiiiiii5/Archimedes/9a879c6febe7c0211c001fb0dfd596038d7c035d/docs/assets/session-composer/notes-before.png) | ![Notes after](https://raw.githubusercontent.com/feiiiiii5/Archimedes/9a879c6febe7c0211c001fb0dfd596038d7c035d/docs/assets/session-composer/notes-after.png) |

Split from [#336](https://github.com/Johanson-colab/Archimedes/pull/336).
