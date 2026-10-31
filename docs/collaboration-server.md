# Collaboration server foundation

`server/` contains a dependency-free Node 24 HTTP/SQLite service for async
collaboration.

## Scope

- dev-session tokens (development only)
- users, projects, project members and roles
- project-scoped comments and resolve
- thread snapshot upload

The service is intentionally transport- and deployment-portable: SQLite for a
single node, Docker Compose for a lab/LAN deployment, and a path to Postgres for
hosted deployment. It does **not** yet sync with the Electron app; the desktop
still owns the local SQLite source of truth.

## Run locally

```bash
npm run server:start
npm run server:test
```

`DEV_AUTH` is enabled only for local development. The Docker image disables it;
production must put an OIDC/auth gateway in front.

## Production path

1. Replace dev sessions with OIDC (WorkOS/Auth0/Keycloak).
2. Move metadata to Postgres; keep object storage for PDFs/artifacts.
3. Add WebSocket presence/live events.
4. Implement the desktop sync outbox and conflict policy.
5. Add TLS, rate limits, backups, audit export, retention, SSO/SCIM.

The local desktop already has identity, project membership, project-owned
libraries, scoped annotations, thread visibility, snapshots, comments, member
management, and audit. The server is the next layer for cross-device and
cross-user sync.
