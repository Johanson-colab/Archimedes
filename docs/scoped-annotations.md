# Project-scoped paper annotations

The same paper can belong to libraries in multiple projects. Paper metadata stays
canonical, but annotations and personal state are now separated.

## Scopes

| Data | Key | Sharing default |
|---|---|---|
| Paper metadata | `papers.id` | shared by libraries |
| Reading state, stars, notes, tags | `paper_user_state(paper_id, user_id)` | private per user |
| Highlights | `paper_highlights(project_id, paper_id, author_id)` | project-visible; `visibility='private'` supported in the data model |
| Reviews | `paper_reviews(project_id, paper_id, owner_id)` | private; project-visible sharing comes in the sharing UI |
| Presentations | `paper_presentations(project_id, paper_id, owner_id)` | private |
| Paper chat | `paper_chat_threads(project_id, paper_id)` | project-scoped |

The same paper in project A and project B has independent highlights, reviews,
presentations, and paper chat. Personal reading state is per user and does not
leave the user's account/device.

## Migration

On workspace open:

- existing highlights are assigned to the default project and local author;
- existing reviews, presentations, and paper chats are rebuilt with project and
  owner columns and copied to the default project/local user;
- `papers.reading_status`, `starred`, `notes`, and `tags_json` are copied into
  `paper_user_state` for the local user.

The legacy `papers` columns remain as fallback for old rows, but new writes go to
`paper_user_state`.

## API/UI

All paper annotation IPC accepts an optional `projectId`; the renderer passes the
active project from `LibraryView` through the reader, review, presentation, and
paper chat panels. Missing project IDs fall back to the default project.

## Still needed

- A UI toggle for private vs project-visible highlights.
- Review/presentation sharing controls and project-scoped comments.
- Cloud auth/sync and invite/member management.
- Thread visibility/snapshot and shared agent runs.
