const ROLES = ["viewer", "commenter", "editor", "admin", "owner"];
const RANK = new Map(ROLES.map((role, index) => [role, index]));

function isProjectRole(value) {
  return typeof value === "string" && RANK.has(value);
}

function normalizeRole(value, fallback = "viewer") {
  return isProjectRole(value) ? value : fallback;
}

function roleRank(value) {
  return RANK.get(value) ?? -1;
}

function hasRole(actual, required) {
  return roleRank(actual) >= roleRank(required);
}

function canRead(role) {
  return hasRole(role, "viewer");
}

function canComment(role) {
  return hasRole(role, "commenter");
}

function canEditContent(role) {
  return hasRole(role, "editor");
}

function canManageMembers(role) {
  return hasRole(role, "admin");
}

function canApproveAgentAction(role) {
  return hasRole(role, "editor");
}

function canDeleteProject(role) {
  return role === "owner";
}

module.exports = {
  ROLES,
  canApproveAgentAction,
  canComment,
  canDeleteProject,
  canEditContent,
  canManageMembers,
  canRead,
  hasRole,
  isProjectRole,
  normalizeRole,
  roleRank,
};
