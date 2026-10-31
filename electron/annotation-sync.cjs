function createAnnotationSync({ store, api } = {}) {
  if (!store || !api) throw new Error("Store and collaboration API are required.");

  function projectPapers(projectId) {
    const seen = new Map();
    for (const library of store.listLibraries(projectId)) {
      for (const paper of store.listPapers(library.id)) {
        if (paper.cloud_paper_id) seen.set(paper.id, paper);
      }
    }
    return [...seen.values()];
  }

  function parseJson(value) {
    if (value && typeof value === "object") return value;
    try { return JSON.parse(value || "{}"); } catch { return {}; }
  }

  function updatedAt(row) {
    return Date.parse(row?.updated_at || "") || 0;
  }

  async function syncProjectAnnotations(projectId, { currentCloudUserId = "" } = {}) {
    const project = store.getResearchProject(projectId);
    if (!project) throw new Error("Research project not found.");
    if (!project.cloud_project_id) throw new Error("Share this project before syncing annotations.");
    const warnings = [];
    for (const paper of projectPapers(projectId)) {
      try {
        const remoteHighlights = await api.listHighlights(project.cloud_project_id, paper.cloud_paper_id);
        const remoteIds = new Set(remoteHighlights.map((highlight) => highlight.id));
        for (const local of store.listPaperHighlights(projectId, paper.id)) {
          if (local.source === "cloud" || remoteIds.has(local.id)) continue;
          try {
            const remote = await api.addHighlight(project.cloud_project_id, {
              id: local.id,
              paper_id: paper.cloud_paper_id,
              visibility: local.visibility,
              page_number: local.page_number,
              quote: local.quote,
              start_offset: local.start_offset,
              end_offset: local.end_offset,
              note: local.note,
              color: local.color,
            });
            remoteIds.add(remote.id);
          } catch (error) {
            warnings.push(`${paper.title}: ${error instanceof Error ? error.message : String(error)}`);
          }
        }
        for (const remote of remoteHighlights) {
          store.upsertCloudHighlight(projectId, remote, { currentCloudUserId });
        }

        const localReview = store.getOwnPaperReview(paper.id, projectId);
        const remoteReview = await api.getReview(project.cloud_project_id, paper.cloud_paper_id);
        if (localReview && (!remoteReview || updatedAt(localReview) > updatedAt(remoteReview))) {
          try {
            await api.saveReview(project.cloud_project_id, paper.cloud_paper_id, parseJson(localReview.review_json), localReview.visibility);
          } catch (error) {
            warnings.push(`${paper.title}: ${error instanceof Error ? error.message : String(error)}`);
          }
        } else if (remoteReview) {
          store.upsertCloudReview(projectId, remoteReview, { currentCloudUserId });
        }

        const localPresentation = store.getOwnPaperPresentation(paper.id, projectId);
        const remotePresentation = await api.getPresentation(project.cloud_project_id, paper.cloud_paper_id);
        if (localPresentation && (!remotePresentation || updatedAt(localPresentation) > updatedAt(remotePresentation))) {
          try {
            await api.savePresentation(project.cloud_project_id, paper.cloud_paper_id, parseJson(localPresentation.presentation_json), {
              visibility: localPresentation.visibility,
              sourceReviewUpdatedAt: localPresentation.source_review_updated_at,
            });
          } catch (error) {
            warnings.push(`${paper.title}: ${error instanceof Error ? error.message : String(error)}`);
          }
        } else if (remotePresentation) {
          store.upsertCloudPresentation(projectId, remotePresentation, { currentCloudUserId });
        }
      } catch (error) {
        warnings.push(`${paper.title}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { project: store.getResearchProject(projectId), warnings };
  }

  return { syncProjectAnnotations };
}

module.exports = { createAnnotationSync };
