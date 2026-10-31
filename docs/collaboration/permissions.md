# Collaboration permissions

## Project roles

| Role | Read | Comment | Edit content | Add members | Delete project |
|---|---:|---:|---:|---:|---:|
| viewer | ✓ |  |  |  |  |
| commenter | ✓ | ✓ |  |  |  |
| editor | ✓ | ✓ | ✓ |  |  |
| admin | ✓ | ✓ | ✓ | ✓ |  |
| owner | ✓ | ✓ | ✓ | ✓ | ✓ |

`owner` is unique and immutable through normal member APIs.

## Resource rules

- A project member can read only resources with `project_id` where they have a
  role.
- A private thread is owner-only, even for project admins.
- Personal paper state (`paper_user_state`) is always owner-only.
- Highlights are project-visible by default; `visibility=private` is author-only.
- Reviews/presentations are private until explicitly shared.
- Paper chat is project-scoped.
- Comments require commenter+; resolving requires author or editor+.
- Agent write/command approval requires editor+.
- Guest links are resource-specific, expiring, revocable, read-only unless a
  comment scope is explicitly granted.
- Service-role credentials are server-only and never sent to Electron.

## Enforcement

1. API checks project role for every shared mutation and read.
2. RLS is defense-in-depth for Data API/Realtime/Storage access.
3. The agent context query uses the requesting user's JWT; no global service
   role retrieval.
4. Audit events record membership, sharing, approvals, exports, and deletes.
