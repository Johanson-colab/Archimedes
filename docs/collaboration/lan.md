# LAN host mode

Archimedes uses a host-authoritative LAN service instead of self-hosting
Supabase on a desktop. One machine runs the SQLite-backed collaboration server;
other devices use its HTTP API. Supabase remains the cloud data plane for
internet collaboration.

## Run

```bash
npm run server:lan
# HOST=0.0.0.0 PORT=8787 DB_PATH=./data/collab.db
```

The launcher prints every non-loopback IPv4 URL. Share one of those with
devices on the same trusted network.

## Security

- Bind to `0.0.0.0` only on a trusted LAN or behind a firewall/reverse proxy.
- `DEV_AUTH=true` is development-only. Set `DEV_AUTH=false` and add a real
  token/OIDC flow before using this on an untrusted network.
- Do not expose the SQLite database file over file sharing.
- Back up `data/collab.db` while the service is stopped or use SQLite backup
  tooling.
- TLS is not terminated by the Node service; use a reverse proxy for TLS.
- The desktop cloud path uses Supabase RLS. The LAN host is a separate,
  host-authoritative service and does not bypass cloud permissions.

## Current scope

Users, projects, roles, members, comments, and thread snapshots. Supabase-backed
libraries, annotations, threads, presence, guest links, shared runs, and CRDT
notes are cloud features; the LAN host is intentionally smaller.
