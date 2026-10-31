# Governance

## Implemented

- Project roles: viewer < commenter < editor < admin < owner.
- Owner is immutable through normal APIs.
- Admin/owner project export (`GET /v1/projects/{id}/export`) with no token hashes.
- Admin/owner audit read (`GET /v1/projects/{id}/audit`).
- Share links store SHA-256 hashes, expire, and can be revoked.
- RLS is defense-in-depth; the collaboration API also checks roles.
- Supabase sessions are encrypted at rest through Electron `safeStorage`.
- LAN host uses a host-authoritative SQLite service and never requires a
  service-role key.

## Not automated yet

- Retention windows and scheduled purge jobs.
- Organization-wide export/legal hold.
- SSO/SAML/SCIM provisioning.
- Data residency controls.
- Customer-managed encryption keys.

These are deployment/enterprise work, not required for the local-first desktop
flow. Any future purge job must tombstone rows and respect project ownership;
it must not delete canonical papers still referenced by another project.
