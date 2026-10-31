# Project comments

Thread comments are the first persistent asynchronous collaboration surface.

## Data

`comments` stores:

- `project_id`, `resource_type` (`thread`, `paper`, `review`, `artifact`),
  `resource_id`;
- optional `parent_id` for threaded replies;
- `anchor_json` for a future page/selection/event anchor;
- body, author, resolved timestamp.

Comments are project-scoped and require at least Commenter access. Private thread
drafts are not commentable by other project members. Authors can resolve/reopen
their comments; editors can resolve, admins can delete. Comment creation,
resolution, and deletion are written to `audit_events`.

## UI

The thread toolbar opens a **Comments** dialog:

- comment list with author and timestamp;
- resolve/reopen;
- composer with ⌘/Ctrl+Enter send.

Paper, review, and artifact comments use the same data/API; their surfaces will
be added as those readers adopt the project context.

## Still needed

- Paper/review/artifact comment panels and anchors.
- @mentions, notifications, unread counts.
- Cloud sync and permission enforcement.
