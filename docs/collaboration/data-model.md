# Collaboration data model

## Identity and tenancy

- `users` mirrors Supabase Auth users.
- `orgs` owns projects and billing.
- `org_members` gives `owner|admin|member`.
- `projects` is the permission boundary; `owner_id`, `org_id`,
  `default_thread_visibility`.
- `project_members` uses `viewer|commenter|editor|admin|owner`.
- `project_invites` stores email, role, token hash, expiry, accepted time.

## Libraries and papers

- `libraries.project_id` is **NOT NULL**. A library belongs to one project.
- `library_items` is polymorphic (`paper` in v1; dataset/repo later).
- `papers` stores canonical shared metadata.
- `paper_user_state` stores reading status, stars, personal notes/tags per user.
- `paper_highlights` is project/author/visibility scoped.
- `paper_reviews` and `paper_presentations` are per project/paper/owner and
  default private.
- `paper_chat_threads` is keyed by `(project_id,paper_id)`.
- A paper can be in multiple project libraries; annotations do not cross project
  boundaries.

## Threads and sharing

- `threads`: project, owner, `visibility=project|private`, mode, title.
- `turns`: author, agent/user, messages, status.
- `events`: append-only, actor, sequence, client_event_id.
- `thread_snapshots`: frozen manifest, sequence, owner.
- `comments`: project/resource/anchor/body/author/resolve.
- `share_links`: guest read-only snapshot/review link, token hash, expiry.

## Agent collaboration

- `agent_runs`: thread, driver, status, context manifest.
- `run_participants`: driver/co-prompt/observer.
- `agent_actions`: requested_by, approved_by, run_id, status.

## Governance

- `audit_events`: project, actor, action, target, metadata.
- `project_change_log`: append-only sync cursor source.
- Storage objects are content-addressed and scoped by project.
