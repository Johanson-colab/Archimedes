# ADR 001: API-first collaboration, Supabase data plane

Status: accepted for v1.

## Context

Archimedes is an Electron + local SQLite app with a local agent runtime. The
collaboration phase needs shared projects, project-owned libraries, scoped
annotations, thread snapshots, comments, presence, shared agent runs, and
eventually co-editing. Research data may be unpublished, so local-first and
explicit sharing are required.

Supabase can provide managed Postgres, Auth, Storage, and Realtime, but it does
not provide the Archimedes domain model, invite semantics, sync engine, audit
policy, or agent-run state machine.

## Decision

Use **Supabase as the data plane** and a **Collaboration API** as the write and
authorization boundary.

```text
Electron
  ├── SQLite (offline source of truth)
  ├── sync outbox
  └── Collaboration API
        ├── Postgres (Supabase or self-hosted)
        ├── Supabase Auth JWT verification
        ├── object storage (Supabase Storage or S3/R2)
        └── Realtime (Supabase Broadcast/Presence initially)
```

- Desktop uses Supabase only for auth/upload/realtime capabilities, never for
  business-table writes.
- The API owns invites, project roles, library/paper mutations, comments,
  snapshots, agent approvals, and audit events.
- RLS is a second layer of defense and prevents accidental data exposure if a
  client gets a publishable key.
- The same API can run as a LAN host; storage and auth are pluggable.
- The local SQLite database remains authoritative when offline. The API is
  authoritative for shared resources after sync.

## Consequences

- The Node prototype in `server/` becomes the base for the API and must move
  from SQLite to PostgreSQL.
- The desktop needs an outbox/sync worker and a conflict center.
- Supabase Auth can be replaced by another OIDC provider without changing the
  domain API.
- LAN mode can reuse the API but needs a local auth provider/token exchange.
- Service-role credentials stay server-side; desktop gets only user JWTs.

## Rejected alternatives

- **Direct desktop → Supabase tables**: faster to start, but makes invites,
  sync, agent approval, LAN parity, and audit much harder to keep consistent.
- **One custom WebSocket server for everything**: unnecessary for v1; Supabase
  Realtime covers presence and moderate broadcast volume.
- **Cloud workspace as source of truth**: conflicts with local-first and makes
  offline research work fragile.
