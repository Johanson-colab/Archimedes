# Project-owned libraries

Libraries now belong to a research project. A project can have one or more
libraries; new projects receive a default `Project library`. Existing
workspace-global libraries are assigned to the existing default project during
migration, and projects without libraries receive one at workspace open.

## Scope

- `libraries.project_id` identifies the owning project.
- `store.listLibraries(projectId)` returns only that project's libraries and
  checks viewer access.
- `store.createLibrary({ projectId, ... })` requires editor access.
- Adding/removing papers and editing/deleting a library require editor access.
- The last library in a project cannot be deleted.
- Deleting a project deletes its libraries and removes papers that are no longer
  in any library.
- A paper remains canonical across libraries/projects; adding the same paper to
  another project library increments its library membership, not a copy.

## UI

- `LibraryView` reloads by active project and passes `projectId` when creating a
  library.
- `ContextPicker` lists only libraries from the active project.
- The proactive library radar uses the active project's libraries.

## Still needed

- Split `papers` shared metadata from per-user state (`reading_status`,
  `starred`, personal notes/tags).
- Project-scope highlights, reviews, presentations, and paper chat threads.
- Library sharing/invites, comments, share manifests, and audit events.
- Cross-project library copy/export (deferred by the project-owned decision).
