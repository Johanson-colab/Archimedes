# Rollout plan

Solo developer target: **12–15 short-lived PRs**, one branch per PR, at most two
open at once, stack depth at most two.

1. `docs/collab-contracts` — this PR.
2. `feat/collab-auth` — Supabase Auth + API JWT + desktop account link.
3. `feat/collab-project-sync` — project/member outbox + sync status.
4. `feat/collab-project-ui` — share/invite/member UI.
5. `feat/collab-library-server` — Postgres library/paper API.
6. `feat/collab-library-sync` — desktop library/paper sync + manifest.
7. `feat/collab-annotations-sync` — highlights/reviews/presentations/chat.
8. `feat/collab-thread-sync` — threads/events/snapshots/comments/audit.
9. `feat/collab-presence` — Realtime presence/live comments.
10. `feat/collab-guest-links` — read-only snapshot links.
11. `feat/collab-agent-run-server` — agent run state machine.
12. `feat/collab-agent-run-ui` — driver/co-prompt/approval UI.
13. `feat/collab-crdt-notes` — notes/highlights CRDT.
14. `feat/collab-latex` — LaTeX co-editing.
15. `feat/collab-governance` — LAN host, SSO/SCIM, retention, export.

## Gates

- Every PR: lint, build, tests, migration/rollback note, feature flag.
- After 2–4: two-account E2E.
- After 8: offline/reconnect + private-data zero-leak test.
- After 12: shared agent run demo.
- After 15: beta.
