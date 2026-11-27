Keep the selected data folder, project, project workspace, conversation and execution folder as one task identity. Load the next conversation before committing that selection, retain the previous selection on failure, and ignore slower or late responses from another task. Existing sessions retain their recorded execution folder after a project default changes; freshly imported conversations acquire their project's local workspace when opened.

This PR depends on [#341](https://github.com/Johanson-colab/Archimedes/pull/341). Its fork base is `codex/workspace-store-context`, so the review diff contains only this behavior.

Actual callback behavior checks:

| Action | Before | After |
| --- | --- | --- |
| Select project B while conversation B is loading | Project/thread IDs changed before the transcript returned | The complete B selection is committed only after a successful read; failure keeps A |
| Run a new A conversation, select empty B, then receive A events/completion | A's thread could be adopted by B's empty selection | B keeps its project, empty thread, transcript and attachments; A's result remains in A's history |
| Approve A, switch to B before approval resolves | The command could use A's directory with B's completion owner | The captured A selection supplies both command directory and completion owner; B's files are not refreshed by A's write |

The tests execute the real App callbacks and real SQLite/agent context resolver. Static screenshots would not show these asynchronous ownership differences. Lint, build and theme checks passed. Final standard `npm test`: 1284 tests, 1271 passed / 6 inherited failures / 7 conditional skips. The failures match the B1 base (Git state 2, Windows-target shell 3, translation ordering 1; [Git #337](https://github.com/Johanson-colab/Archimedes/pull/337), [Windows #338](https://github.com/Johanson-colab/Archimedes/pull/338), [i18n #339](https://github.com/Johanson-colab/Archimedes/pull/339)).

Split from [#336](https://github.com/Johanson-colab/Archimedes/pull/336).
