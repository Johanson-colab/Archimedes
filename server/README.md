# Archimedes collaboration server

A dependency-free Node 24 HTTP service and SQLite store for the first async
collaboration foundation. The production contract lives in
[`docs/collaboration`](../docs/collaboration/README.md), with the PostgreSQL
schema in [`server/sql/0001_collaboration.sql`](sql/0001_collaboration.sql) and
the API surface in [`server/openapi.json`](openapi.json).

## What exists

- Dev session tokens (development only)
- Users
- Projects and project roles (`viewer` < `commenter` < `editor` < `admin` < `owner`)
- Project member listing/addition
- Project-scoped comments with resolve
- Thread snapshot upload

## Run

```bash
npm run server:start
# or
PORT=8787 DB_PATH=./data/collab.db node server/index.cjs
```

Health:

```bash
curl http://127.0.0.1:8787/health
```

Dev session (only when `DEV_AUTH` is not `false`):

```bash
curl -X POST http://127.0.0.1:8787/v1/dev-session \
  -H 'content-type: application/json' \
  -d '{"email":"alice@example.com","displayName":"Alice"}'
```

Then send `Authorization: Bearer <token>`.

## Docker

```bash
docker compose -f server/docker-compose.yml up --build
```

The image sets `DEV_AUTH=false`; replace dev sessions with an OIDC/auth
provider before exposing the service.

## LAN host

```bash
npm run server:lan
```

See [`docs/collaboration/lan.md`](../docs/collaboration/lan.md).

## Supabase API

See [`docs/collaboration-api.md`](../docs/collaboration-api.md) and run
`npm run server:supabase`.

Apply the numbered SQL migrations in order, including
[`0013_sync_integrity.sql`](sql/0013_sync_integrity.sql), before deploying the
current Supabase API. The desktop's versioned library sync reads
`GET /v1/projects/:id/library-sync`; it retains local deletion intent and reports
an upgrade warning when the server lacks that route/migration. It does not send
unversioned hard deletes as a fallback.

A turn ID represents one execution. Its active revision is 1 and its final
revision is 2 (`completed`, `failed`, `incomplete`, `interrupted`,
`needs_configuration`, or `cancelled`). The first final record is immutable;
retries create a new turn ID. Both desktop imports and PostgreSQL triggers reject
old running snapshots, including writes made through older API processes.
Conversation status is derived from the merged turns, so an old conversation
header cannot mark a finished execution as running again.

Libraries and library/paper memberships retain `deleted_at` and server-assigned
`sync_revision`. Removing a paper affects that membership, preserving its other
libraries and canonical metadata. Deleted library IDs stay deleted; create a new
library to share those contents again. An explicit user re-add of a paper names
the observed membership deletion revision; a stale normal upload cannot restore
it. Local mutation IDs keep delayed acknowledgements from clearing later edits.
The migration preserves existing records but cannot reconstruct hard deletions
made before deployment. An already-linked library absent from the server is
therefore kept local with an explanation, rather than silently recreated.
Deleting a parent project keeps the existing foreign-key cascade: library/item
triggers allow physical removal once their parent has gone, so tombstones do
not strand child records outside a deleted project.

The local integration tests use two real SQLite stores, the real HTTP API and a
controlled SDK backend. They do not establish hosted Supabase Auth or Realtime
behavior; the two-account live suite remains an environment-dependent check.

## Production gaps

- Real login/OIDC, email delivery, invites, token expiry/rotation
- TLS/reverse proxy and rate limiting
- Postgres instead of SQLite for multi-node deployment
- WebSocket presence/live events
- Object storage for PDFs/artifacts
- Sync/outbox protocol and desktop integration
- Audit export, retention, data residency, SSO/SCIM
- Full-text/vector search with ACL filtering
