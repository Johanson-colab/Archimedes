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

## Proposed Longplay boundary for the hosted commercial layer

This proposal supports [the Free Local / Pro / Team direction in #143](https://github.com/Johanson-colab/Archimedes/issues/143). It does not select a vendor or change the existing server/API. The repository's `AGENTS.md` requires written core-team approval before API, dependency, auth or storage implementation; this proposal is the review boundary for that decision.

Free Local retains its local agent runtime, SQLite data, BYOK, reading, review, presentation and import/export behavior. Only explicitly selected hosted capabilities may acquire a paid admission requirement. Payment state never substitutes for project membership or an existing role check.

| Boundary | Proposed integration |
| --- | --- |
| Verified hosted account | Resolve the existing authenticated subject server-side. Development sessions and caller-supplied account/Customer IDs cannot establish a billable identity. |
| Personal Pro Customer | A possible binding is `archimedes:user:<verified-auth-sub>`, created by the trusted server. No paper metadata or prompts enter billing. |
| Team billing subject | Requires an owner-approved organization and membership contract. A project role is not automatically an organization billing role, and a member cannot choose another team's Customer. |
| Hosted operation admission | After authentication, project authorization and input validation, check the selected access Feature before submitting new paid work. Default local/LAN operation remains independent of billing. |
| Cloud Credits | Define and verify a supported atomic reservation/settlement protocol before enabling concurrent paid runs. `checkEntitlement` is a read-only observation, not a reservation or cost ceiling. |
| Existing content and results | Keep the authorized download/export/recovery path available after cancellation or provider outage; admission affects new paid work, not release of existing results. |
| Secrets and sessions | Longplay server credentials stay in the hosted server. Any desktop Customer credential must be scoped, short-lived and issued only after account verification; never persist a server key in Electron/renderer settings. |

A candidate first slice is a disabled-by-default server adapter and an authenticated account-access reader, followed by one selected hosted operation. The adapter must sanitize failures, separate sandbox/live bindings, bound HTTP timeouts and refuse unsupported Feature kinds. It must not fabricate paid-through dates, signed offline licenses or a verified purchase from an allowed check. Checkout, cancellation, restore/channel policy and credit accounting require separate contracts before a commercial launch.

This repository currently exposes development, LAN and Supabase collaboration variants. The core team must select the hosted owner and the first paid capability before code is added; this proposal introduces no parallel auth issuer, backend, database or private commercial implementation.

The evaluated public npm SDK is 0.10.15, whose metadata currently declares `UNLICENSED`. SDK usage/distribution terms and the core team's written integration approval remain prerequisites. No SDK dependency or runtime change is part of this proposal.
