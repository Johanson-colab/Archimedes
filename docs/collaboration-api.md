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

The API delegates project creation and member insertion to the PostgreSQL
functions `create_project`, `add_project_member_by_email`, and
`list_project_members`. Those functions are `SECURITY DEFINER` but scoped to
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
members, and verifies a non-admin cannot add members. Without
`SUPABASE_LIVE_TESTS=1`, the test is skipped and `npm test` stays offline.

## Not included yet

- Desktop project/member sync and share UI (next PR)
- Invites for users who have not signed up
- Thread/library/comments sync
- Service-role/admin operations
