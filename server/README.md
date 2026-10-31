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

## Production gaps

- Real login/OIDC, email delivery, invites, token expiry/rotation
- TLS/reverse proxy and rate limiting
- Postgres instead of SQLite for multi-node deployment
- WebSocket presence/live events
- Object storage for PDFs/artifacts
- Sync/outbox protocol and desktop integration
- Audit export, retention, data residency, SSO/SCIM
- Full-text/vector search with ACL filtering
