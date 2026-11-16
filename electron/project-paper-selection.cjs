function assertPaperAccess(db, paperId, canAccessProject, role = "viewer", projectId = null) {
  const projects = db.prepare(`SELECT DISTINCT libraries.project_id FROM library_papers
    JOIN libraries ON libraries.id = library_papers.library_id WHERE library_papers.paper_id = ?`).all(paperId);
  if (!projects.some(project => (!projectId || project.project_id === projectId) && canAccessProject(project.project_id, role))) {
    throw new Error(`You do not have ${role} access to this paper in the selected project.`);
  }
}

function getSelection(db, paperId, projectId, canAccessProject) {
  if (typeof projectId !== "string" || !projectId) throw new Error("Choose a project for this selection.");
  assertPaperAccess(db, paperId, canAccessProject, "viewer", projectId);
  const row = db.prepare("SELECT * FROM project_paper_selections WHERE project_id = ? AND paper_id = ?").get(projectId, paperId);
  if (!row) return null;
  const { discovery_json, ...record } = row;
  return { ...record, discovery: JSON.parse(discovery_json) };
}

function saveSelection(db, paperId, projectId, patch, canAccessProject) {
  assertPaperAccess(db, paperId, canAccessProject, "editor", projectId);
  const current = getSelection(db, paperId, projectId, canAccessProject);
  const reason = patch.reason === undefined ? current?.reason || "" : patch.reason;
  if (typeof reason !== "string" || reason.length > 10_000) throw new Error("The selection reason must contain at most 10000 characters.");
  let discovery = current?.discovery || {};
  if (patch.discovery !== undefined) {
    if (!patch.discovery || typeof patch.discovery !== "object" || Array.isArray(patch.discovery)) throw new Error("Discovery must be a query snapshot.");
    discovery = {};
    for (const [key, value] of Object.entries(patch.discovery)) {
      if (["query", "fetched_at", "warning", "machine_reason"].includes(key) && typeof value === "string") discovery[key] = value;
      else if (key === "criteria" && (typeof value === "string" || Array.isArray(value) && value.every(item => typeof item === "string"))) discovery[key] = value;
      else if (key === "providers" && Array.isArray(value) && value.every(item => typeof item === "string")) discovery[key] = value;
      else if (key === "degraded" && typeof value === "boolean") discovery[key] = value;
    }
  }
  const serialized = JSON.stringify(discovery);
  if (serialized.length > 50_000) throw new Error("The discovery snapshot is too large.");
  db.prepare(`INSERT INTO project_paper_selections (project_id, paper_id, reason, discovery_json, updated_at) VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(project_id, paper_id) DO UPDATE SET reason = excluded.reason, discovery_json = excluded.discovery_json, updated_at = excluded.updated_at`)
    .run(projectId, paperId, reason, serialized, new Date().toISOString());
  return getSelection(db, paperId, projectId, canAccessProject);
}

module.exports = { assertPaperAccess, getSelection, saveSelection };
