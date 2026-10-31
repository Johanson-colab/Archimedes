# ADR 002: outbox sync and conflict policy

Status: accepted for v1.

## Decision

The desktop keeps a durable `sync_outbox`. Shared mutations are written locally
and queued; a sync worker pushes them when online and pulls server deltas by
cursor. The server assigns a monotonic `server_version` per project.

```text
local transaction
  ├── write local row
  └── append sync_outbox row
        ↓ online
  POST /v1/projects/:id/sync/push
        ↓
  server validates ACL + idempotency key
        ↓
  server_version + audit event
        ↓
  GET /v1/projects/:id/sync/pull?cursor=...
```

## Outbox shape

```json
{
  "id": "uuid",
  "project_id": "uuid",
  "entity_type": "thread|comment|library|paper_state",
  "entity_id": "uuid",
  "operation": "upsert|delete|append",
  "payload": {},
  "client_version": 3,
  "idempotency_key": "uuid",
  "created_at": "ISO-8601",
  "attempts": 0
}
```

## Conflict policy

| Entity | Conflict policy |
|---|---|
| thread / turns / events | append-only; server sequence and client-event dedupe |
| comments | server authoritative; version + LWW for edits; tombstone delete |
| project/library metadata | optimistic concurrency on `server_version`; show conflict |
| paper personal state | per-user LWW |
| highlights | append/tombstone; no field merge |
| reviews/presentations | versioned snapshot + optimistic lock |
| notes/LaTeX | CRDT in a later slice |
| presence | ephemeral TTL, never synced |
| binary/PDF | content hash + immutable object version; no merge |

## Rules

- Never reuse local IDs as server IDs. Use UUIDv7.
- All shared rows carry `remote_id`, `server_version`, `sync_state`,
  `deleted_at`.
- Push is idempotent by `idempotency_key`.
- Pull is cursor-based; server keeps a per-project change log.
- A client that falls too far behind receives a snapshot + cursor reset.
- Conflicts never silently overwrite: metadata conflicts enter a Conflict
  Center; append-only conflicts are deduped.
- Deleting a shared entity creates a tombstone; hard delete is a retention job.

## Why not CRDT everywhere

CRDTs are appropriate for free-form notes/LaTeX, not for permissioned metadata,
comments, reviews, or audit. Using them everywhere would hide ownership and
approval semantics.
