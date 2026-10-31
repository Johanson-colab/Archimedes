const assert = require("node:assert/strict");
const test = require("node:test");

const roles = require("./collaboration/roles.cjs");

test("project roles are ordered from viewer to owner", () => {
  assert.deepEqual(roles.ROLES, ["viewer", "commenter", "editor", "admin", "owner"]);
  assert.equal(roles.hasRole("owner", "admin"), true);
  assert.equal(roles.hasRole("editor", "admin"), false);
  assert.equal(roles.hasRole("commenter", "editor"), false);
  assert.equal(roles.hasRole("viewer", "viewer"), true);
  assert.equal(roles.hasRole(null, "viewer"), false);
});

test("capabilities map to the expected minimum role", () => {
  assert.equal(roles.canRead("viewer"), true);
  assert.equal(roles.canComment("viewer"), false);
  assert.equal(roles.canEditContent("commenter"), false);
  assert.equal(roles.canEditContent("editor"), true);
  assert.equal(roles.canApproveAgentAction("editor"), true);
  assert.equal(roles.canManageMembers("editor"), false);
  assert.equal(roles.canManageMembers("admin"), true);
  assert.equal(roles.canDeleteProject("admin"), false);
  assert.equal(roles.canDeleteProject("owner"), true);
});

test("unknown roles normalize to a safe viewer", () => {
  assert.equal(roles.normalizeRole("editor"), "editor");
  assert.equal(roles.normalizeRole("superuser"), "viewer");
  assert.equal(roles.normalizeRole(undefined), "viewer");
});
