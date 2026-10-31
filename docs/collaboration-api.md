# Supabase collaboration API

`server/supabase-server.cjs` is the first API implementation that talks to the
real Supabase project. It uses only the publishable key plus the signed-in
user's JWT; RLS stays enabled and no service-role key is needed.

## Routes

- `GET /health`
- `GET /v1/me`
- `GET /v1/projects`
- `POST /v1/projects`
- `GET /v1/projects/{projectId}`
- `GET /v1/projects/{projectId}/members`
- `POST /v1/projects/{projectId}/members`
- `PATCH /v1/projects/{projectId}/members/{userId}`
- `DELETE /v1/projects/{projectId}/members/{userId}`
- `GET /v1/projects/{projectId}/libraries`
- `POST /v1/projects/{projectId}/libraries`
- `PATCH /v1/libraries/{libraryId}`
- `DELETE /v1/libraries/{libraryId}`
- `GET /v1/libraries/{libraryId}/papers`
- `POST /v1/libraries/{libraryId}/papers`
- `DELETE /v1/libraries/{libraryId}/papers/{paperId}`
- `PATCH /v1/papers/{paperId}`
- `GET /v1/projects/{projectId}/highlights`
- `POST /v1/projects/{projectId}/highlights`
- `PATCH /v1/highlights/{highlightId}`
- `DELETE /v1/highlights/{highlightId}`
- `GET /v1/projects/{projectId}/papers/{paperId}/review`
- `PUT /v1/projects/{projectId}/papers/{paperId}/review`
- `GET /v1/projects/{projectId}/papers/{paperId}/presentation`
- `PUT /v1/projects/{projectId}/papers/{paperId}/presentation`
- `GET /v1/projects/{projectId}/threads`
- `POST /v1/projects/{projectId}/threads`
- `GET /v1/threads/{threadId}`
- `PATCH /v1/threads/{threadId}`
- `POST /v1/threads/{threadId}/turns`
- `POST /v1/threads/{threadId}/events`
- `GET /v1/projects/{projectId}/comments`
- `POST /v1/projects/{projectId}/comments`
- `PATCH /v1/comments/{commentId}`
- `DELETE /v1/comments/{commentId}`
- `POST /v1/projects/{projectId}/share-links`
- `DELETE /v1/share-links/{shareId}`
- `GET /v1/public/shares/{token}` (anonymous)

The API delegates project creation and member management to the PostgreSQL
functions `create_project`, `add_project_member_by_email`,
`list_project_members`, `update_project_member_role`,
`remove_project_member`, and `upsert_paper_to_library`. Those functions are `SECURITY DEFINER` but scoped to
`auth.uid()`, revoke `anon`, and re-check project roles.

## Run

```bash
npm run server:supabase
# default: http://127.0.0.1:8788
```

## Live test

The live test requires credentials in the local `.env.local` (not committed):

```bash
set -a; source .env.local; set +a
SUPABASE_LIVE_TESTS=1 node --test server/supabase-server.live.test.cjs
```

It signs in two test users, creates a project, adds the second user, lists the
members, promotes and removes that member, and verifies a non-admin cannot add
members. Without
`SUPABASE_LIVE_TESTS=1`, the test is skipped and `npm test` stays offline.

## Libraries and papers

Libraries are project-owned. Papers are canonical rows keyed by
`canonical_key`; adding a paper to a second project attaches the existing row
instead of duplicating it. The SQL helper is first-writer-wins, so a member of
one project cannot rewrite metadata already used by another project.

`PATCH /v1/papers/{paperId}` writes only the caller's `paper_user_state`
(reading status, star, notes, tags).

## Annotations

Highlights are project-scoped. Project-visible highlights are readable by all
project members; private highlights only by their author. Reviews and
presentations default to private and can be shared explicitly. The Library
**Sync cloud** action unions local and cloud highlights and reconciles the
current user's review/presentation by `updated_at`.

## Desktop integration

The Electron main process starts this API on an ephemeral loopback port. The
renderer never holds a service-role key: it calls IPC methods that use the
signed-in Supabase access token. Settings → Members can publish a local project,
sync its members, invite by email, and import a shared project. Pulled members
are stored with `source = cloud`; the local owner is preserved.

The Library view has a **Sync cloud** action for a shared project. It pushes
unlinked local libraries and papers, imports libraries and canonical papers
from collaborators, and reconciles per-user paper state by timestamp. New cloud
ids are cached in `libraries.cloud_library_id` and `papers.cloud_paper_id`.

## Guest share links

Thread sharing creates a 192-bit token, stores only its SHA-256 hash, and
returns an `archimedes://share/{token}` link that expires after 1–365 days.
Creation requires editor+ and verifies the resource belongs to the project.
`GET /v1/public/shares/{token}` is the only anonymous route and returns the
read-only thread snapshot (thread, turns, events, comments) for a valid,
unrevoked, unexpired token. The thread share dialog exposes copy/create.

## Presence

`electron/presence.cjs` joins a Supabase Realtime presence channel named
`project:{projectId}` from the Electron main process. Each window tracks its
signed-in user and active thread; the renderer only receives IPC updates. The
toolbar shows collaborator avatars. Presence is ephemeral and never written to
the collaboration tables.

## Not included yet

- Invites for users who have not signed up
- Guest links
- Shared agent runs
- Co-editing
- Service-role/admin operations
