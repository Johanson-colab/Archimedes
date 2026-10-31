const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const spec = JSON.parse(read("server/openapi.json"));
const sql = read("server/sql/0001_collaboration.sql");
const docs = read("docs/collaboration/README.md");
const adr = read("docs/collaboration/adr-001-architecture.md");
const sync = read("docs/collaboration/adr-002-sync-conflicts.md");
const permissions = read("docs/collaboration/permissions.md");
const protocol = read("docs/collaboration/sync-protocol.md");
const rollout = read("docs/collaboration/rollout.md");

test("openapi defines the collaboration surface", () => {
  assert.equal(spec.openapi, "3.1.0");
  for (const route of [
    "/v1/projects",
    "/v1/projects/{projectId}/members",
    "/v1/projects/{projectId}/libraries",
    "/v1/projects/{projectId}/threads",
    "/v1/projects/{projectId}/comments",
    "/v1/projects/{projectId}/sync/push",
    "/v1/projects/{projectId}/sync/pull",
    "/v1/projects/{projectId}/agent-runs",
  ]) assert.ok(spec.paths[route], `missing ${route}`);
  assert.equal(spec.components.securitySchemes.bearerAuth.scheme, "bearer");
  assert.ok(spec.components.schemas.Comment);
  assert.ok(spec.components.schemas.SyncChange);
  assert.ok(spec.components.schemas.AgentRun);
});

test("postgres contract includes project ownership, scoped annotations, and RLS", () => {
  for (const table of [
    "public.users", "public.orgs", "public.org_members", "public.projects", "public.project_members",
    "public.project_invites", "public.libraries", "public.papers", "public.library_items",
    "public.paper_user_state", "public.paper_highlights", "public.paper_reviews",
    "public.paper_presentations", "public.paper_chat_threads", "public.threads", "public.turns",
    "public.events", "public.thread_snapshots", "public.comments", "public.agent_runs",
    "public.run_participants", "public.agent_actions", "public.audit_events", "public.share_links",
    "public.project_change_log",
  ]) assert.match(sql, new RegExp(`create table if not exists ${table.replaceAll(".", "\\.")}`));
  assert.match(sql, /project_id uuid not null references public\.projects/);
  assert.match(sql, /project_role\(/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /can_read_thread/);
  assert.match(sql, /paper_user_state/);
});

test("sync and permission contracts are documented", () => {
  assert.match(docs, /API-first/);
  assert.match(adr, /Supabase as the data plane/);
  assert.match(sync, /sync_outbox/);
  assert.match(sync, /Conflict policy/);
  assert.match(protocol, /idempotencyKey/);
  assert.match(protocol, /snapshotRequired/);
  assert.match(permissions, /private thread is owner-only/);
  assert.match(permissions, /Agent write\/command approval requires editor/);
  assert.match(rollout, /12–15 short-lived PRs/);
});
