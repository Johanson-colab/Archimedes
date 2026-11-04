# Conversation commands

Type `/` in the main chat composer, filter by command name, and select with
the arrow keys and Enter or the mouse. Shift+Enter inserts a newline. IME
confirmation does not execute a command. Clicking Send with an exact command
such as `/fork` also executes it instead of sending it to the model.

| Command | Behavior |
| --- | --- |
| `/research`, `/experiment`, `/write`, `/review` | Select an existing research mode. |
| `/init` | Ask the configured Agent to inspect the workspace and create or improve its root `AGENTS.md`. File changes use the existing approval flow. Subsequent Agent runs load that file as project instructions. |
| `/new` | Start an empty conversation in the current project. The previous conversation remains in Work. |
| `/undo` | Remove the most recent question and response from the current conversation and restore the question to the composer. Keep a private, archived backup of the complete conversation. Workspace files are not reverted. |
| `/compact` | Summarize existing context with the configured model and save the covered turn boundary. Future requests use the summary plus newer turns. Original messages remain available for reading, export, and forks. |
| `/fork` | Create and open an independent copy of the current conversation, including evidence events and the compaction boundary. Historical actions are not executable in the copy. |
| `/side` | Open a resizable side conversation initialized from the current history, or an empty conversation when there is no history yet. Its questions and responses are saved separately. Side conversations can read context; use “Open in main chat” to make workspace changes. |
| `/export` | Save the full conversation as Markdown or JSON using the native save dialog. Canceling does not create a file. |
| `/model` | Open Models settings to select and save a provider/model for subsequent requests. |

## State and recovery

Finish or interrupt the main run before changing its history. Send or clear
queued follow-ups before executing a command. Model settings remain accessible
during a run. A failed command preserves the input and displays an error.

Undo backups are private entries named `Before undo: …` in Work's archived
chat filter. Unarchive a backup to inspect or continue it. Applying Undo does
not undo previously approved file writes or terminal commands.

Compaction never falls back to a made-up summary. Missing configuration, model
errors, or new turns arriving during summarization leave the previous context
unchanged. Summarization processes long histories in chunks.

## Verification

Run `npm run lint`, `npm run build`, `npm run check:theme`, and:

```sh
node --test electron/thread-commands.test.cjs electron/agent/context.test.cjs
```

The browser preview supports conversation controls without contacting a model;
real project initialization and compaction require Electron and a configured
model. Restart Electron after changes to the main process or preload bridge.
