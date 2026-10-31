# Collaboration contracts

This directory is the **API-first** contract for the next collaboration slices. It is
intentionally implementation-neutral enough to support two transports:

- **Cloud**: desktop → Collaboration API → Postgres/Auth/Storage/Realtime.
- **LAN**: the same API runs on a host device with local Postgres/SQLite and
  local object storage.

The desktop remains local-first. SQLite is the offline source of truth; the
cloud/LAN copy is a shared replica. The API is the only write path for shared
resources. Desktop clients never receive a service-role credential.

## Documents

- [ADR 001: architecture](adr-001-architecture.md)
- [ADR 002: sync and conflicts](adr-002-sync-conflicts.md)
- [Data model](data-model.md)
- [Permissions](permissions.md)
- [Sync protocol](sync-protocol.md)

## Contract artifacts

- [`server/sql/0001_collaboration.sql`](../../server/sql/0001_collaboration.sql)
  — Postgres schema, indexes, triggers, RLS helpers/policies.
- [`server/openapi.json`](../../server/openapi.json) — initial collaboration API.
- [`server/collab-server.cjs`](../../server/collab-server.cjs) — current
  prototype; will be ported to PostgreSQL in the integration slice.

## Non-goals for v1

- Figma-style multiplayer cursors
- E2EE
- field-level CRDT for reviews/presentations
- cross-project ownership of libraries
- automatically syncing the whole local workspace

## Release gates

1. Contracts reviewed.
2. Auth + project/member sync works for two real accounts.
3. Library/thread/comments sync passes offline/reconnect and private-data tests.
4. Presence and guest links.
5. Shared agent run.
6. Co-editing.
7. LAN/governance.
