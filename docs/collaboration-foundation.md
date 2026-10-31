# Collaboration foundation

This is the first implementation slice for multi-user collaboration. It is
local-only: no account, cloud sync, invites, or remote collaboration yet.

## Identity

`electron/local-identity.cjs` stores a stable local identity in the app userData
directory (`identity.json`):

- `userId`: `usr_<uuid>`
- `displayName`
- `deviceId`: `dev_<uuid>`
- `deviceName`

The file is written atomically. A corrupt file is moved aside to
`identity.json.corrupt-<timestamp>` and replaced. The identity is exposed through
`identity:get` and `identity:update`; Settings → Account edits the display name
and shows the device/user IDs. Local features never require this profile or a
login.

## Projects and members

The workspace database adds:

- `users`: a local mirror of identity/display names.
- `project_members`: `(project_id, user_id, role)` with roles
  `viewer < commenter < editor < admin < owner`.
- `research_projects.owner_id`.

On workspace open, existing projects are assigned to the local user and receive
an owner membership. New projects record the owner and membership. Project lists
and thread lists filter by the local user's membership; opening a thread requires
at least viewer access, and creating a thread requires editor access.

The role hierarchy and capabilities live in
`electron/collaboration/roles.cjs`. This is the authorization vocabulary for the
next slices: cloud auth, invites, project sharing, library sharing, and audit.

## Not included yet

- Cloud accounts / OIDC / SSO
- Invites and remote members
- Shared libraries and project-owned libraries
- Thread visibility, snapshots, presence, or shared agent runs
- Sync/outbox, object storage, or a collaboration server
- Audit events

The current UI is a local profile panel (Settings → Account); sharing is not
enabled until the server and permission checks land.
