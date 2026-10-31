# Thread visibility and snapshots

Threads now carry an owner and a visibility value:

- `project` (default): visible to project members according to their role.
- `private`: owner-only draft. The data model is in place; cloud enforcement
  arrives with the collaboration server.

The composer has a **Project thread / Private draft** toggle. It applies to the
next thread when no thread is active, and updates the current thread through
`research-thread:set-visibility` when a thread is open. Changing visibility
requires editor access to the owning project.

## Snapshot manifest

`thread_snapshots` stores a frozen JSON manifest for a thread:

- thread metadata and visibility,
- last event sequence,
- turns with assistant messages,
- events with parsed payloads,
- referenced source URLs,
- an empty artifacts list reserved for the artifact-sharing slice.

Snapshots are local-only in this phase. IPC exposes create/list/get so the
sharing UI and cloud upload can be built without changing the data model.

## Still needed

- Cloud-enforced visibility (local UI currently hides private threads only in
  the same database).
- Thread snapshot share links/guest access.
- Artifact snapshots and object storage.
- Comments and presence on shared threads.
- Shared agent-run driver/co-prompt controls.
