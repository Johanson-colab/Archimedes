# Project members and activity

Phase 1d adds the local project membership surface and project activity log.

## Members

Settings → Members lists the active project's members with their role:

- owner (immutable)
- admin
- editor
- commenter
- viewer

Admins can change roles and remove members. The owner cannot be changed or
removed. Adding a member is currently local-only: it creates a local user row
with a generated ID. Cloud/email invites, presence, and login are pending the
collaboration service.

## Activity

`audit_events` is surfaced under **Project activity**. It includes membership,
thread visibility/snapshot, library, review/presentation, and comment actions.
The log is project-scoped and ordered newest first.

## Tests

- member add/update/remove and owner protection;
- audit records for role changes and removals;
- UI audit for the Members panel and IPC.
