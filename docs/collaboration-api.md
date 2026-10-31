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

## Not included yet

- Invites for users who have not signed up
- Thread/library/comments sync
- Service-role/admin operations
