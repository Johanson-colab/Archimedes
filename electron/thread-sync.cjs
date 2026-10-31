function createThreadSync({ store, api } = {}) {
  if (!store || !api) throw new Error("Store and collaboration API are required.");

  function parsePayload(value) {
    if (value && typeof value === "object") return value;
    try { return JSON.parse(value || "{}"); } catch { return {}; }
  }

  async function syncProjectThreads(projectId, { currentCloudUserId = "", localUserId = "" } = {}) {
    const project = store.getResearchProject(projectId);
    if (!project) throw new Error("Research project not found.");
    if (!project.cloud_project_id) throw new Error("Share this project before syncing threads.");
    const warnings = [];
    let localThreads = store.listProjectThreadsForSync(projectId);

    // Local -> cloud for threads owned by this local identity.
    for (const thread of localThreads) {
      if (thread.owner_id && thread.owner_id !== localUserId) continue;
      try {
        await api.saveThread(project.cloud_project_id, {
          id: thread.id,
          title: thread.title,
          mode: thread.mode,
          status: thread.status,
          context_summary: thread.context_summary,
          visibility: thread.visibility,
          archived_at: thread.archived_at,
        });
        const detail = store.getResearchThread(thread.id);
        const remote = await api.getThread(thread.id);
        const remoteTurnIds = new Set((remote.turns || []).map((turn) => turn.id));
        for (const turn of detail.turns || []) {
          if (remoteTurnIds.has(turn.id)) continue;
          await api.saveTurn(thread.id, {
            id: turn.id,
            mode: turn.mode,
            user_message: turn.user_message,
            assistant_message: turn.assistant_message,
            status: turn.status,
            created_at: turn.created_at,
            completed_at: turn.completed_at,
          });
        }
        const remoteEvents = await api.getThread(thread.id);
        const remoteEventIds = new Set((remoteEvents.events || []).map((event) => event.id));
        let nextSequence = (remoteEvents.events || []).reduce((max, event) => Math.max(max, Number(event.sequence) || 0), 0) + 1;
        const localEvents = store.listResearchThreadEvents(thread.id);
        const missingEvents = localEvents.filter((event) => !remoteEventIds.has(event.id));
        if (missingEvents.length) {
          await api.saveEvents(thread.id, missingEvents.map((event) => ({
            id: event.id,
            turn_id: event.turn_id,
            sequence: nextSequence++,
            type: event.type,
            payload: parsePayload(event.payload_json),
            created_at: event.created_at,
          })));
        }

        const remoteComments = await api.listComments(project.cloud_project_id, { resourceType: "thread", resourceId: thread.id });
        const remoteCommentIds = new Set(remoteComments.map((comment) => comment.id));
        for (const comment of store.listProjectComments(projectId, { resourceType: "thread", resourceId: thread.id })) {
          if (comment.author_id !== localUserId || remoteCommentIds.has(comment.id)) continue;
          await api.saveComment(project.cloud_project_id, {
            id: comment.id,
            resource_type: comment.resource_type,
            resource_id: comment.resource_id,
            parent_id: comment.parent_id,
            anchor: parsePayload(comment.anchor_json),
            body: comment.body,
            resolved_at: comment.resolved_at,
          });
        }
      } catch (error) {
        warnings.push(`${thread.title}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }

    // Cloud -> local.
    const remoteThreads = await api.listThreads(project.cloud_project_id);
    localThreads = store.listProjectThreadsForSync(projectId);
    const localById = new Map(localThreads.map((thread) => [thread.id, thread]));
    for (const remoteThread of remoteThreads) {
      try {
        const local = localById.get(remoteThread.id);
        if (!local || Date.parse(remoteThread.updated_at || "") > Date.parse(local.updated_at || "")) {
          const detail = await api.getThread(remoteThread.id);
          store.applyCloudThread(projectId, detail, { currentCloudUserId, localUserId });
        }
        const remoteComments = await api.listComments(project.cloud_project_id, { resourceType: "thread", resourceId: remoteThread.id });
        for (const comment of remoteComments) {
          store.applyCloudComment(projectId, comment, { currentCloudUserId, localUserId });
        }
      } catch (error) {
        warnings.push(`${remoteThread.title}: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
    return { project: store.getResearchProject(projectId), warnings };
  }

  return { syncProjectThreads };
}

module.exports = { createThreadSync };
