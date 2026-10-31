# Sync protocol v1

## Push

`POST /v1/projects/{projectId}/sync/push`

```json
{
  "clientId": "device-uuid",
  "cursor": 42,
  "changes": [
    {
      "idempotencyKey": "uuid",
      "entityType": "comment",
      "entityId": "uuid",
      "operation": "upsert",
      "clientVersion": 3,
      "payload": { "body": "Please check 4k." }
    }
  ]
}
```

The server:

1. verifies the user's project role;
2. dedupes by idempotency key;
3. validates the entity ACL and `client_version`;
4. applies the change in a transaction;
5. appends a `project_change_log` entry;
6. returns `server_version`, accepted/rejected IDs, and conflicts.

## Pull

`GET /v1/projects/{projectId}/sync/pull?cursor=42&limit=500`

```json
{
  "cursor": 57,
  "changes": [
    { "serverVersion": 43, "entityType": "comment", "entityId": "uuid", "operation": "upsert", "payload": {} }
  ],
  "hasMore": false
}
```

If the cursor is too old, the server returns `snapshotRequired: true` and a
snapshot URL/token.

## Idempotency and ordering

- `client_event_id`/`idempotency_key` is unique per project.
- Thread events are ordered by server `sequence`; client events can arrive out
  of order and are sorted on apply.
- Pull is a monotonically increasing `server_version` cursor.

## Conflict response

```json
{
  "conflicts": [
    {
      "entityType": "library",
      "entityId": "uuid",
      "serverVersion": 9,
      "server": { "name": "Evidence" },
      "client": { "name": "Evidence v2" }
    }
  ]
}
```

## Local outbox

The local SQLite `sync_outbox` is durable. A worker:

- flushes on online/reconnect;
- retries with exponential backoff;
- keeps failed mutations visible in a Sync status/Conflict Center;
- never deletes an outbox row until the server acknowledges it.

## Presence

Presence is not in the outbox. It uses a Realtime channel with a 30s TTL and is
never persisted.
