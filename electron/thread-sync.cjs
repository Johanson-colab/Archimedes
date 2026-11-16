const { mergeTurn, mergeCloudThread, turnRevision } = require('../shared/cloud-sync.cjs');

function createThreadSync({ store: providedStore, api } = {}) {
  if (!providedStore || !api) throw new Error("Store and collaboration API are required.");

  function parsePayload(value) {
    if (value && typeof value === "object") return value;
    try { return JSON.parse(value || "{}"); } catch { return {}; }
  }

  async function syncInStore(store, projectId, { currentCloudUserId = "", localUserId = "" } = {}) {
    const project = store.getResearchProject(projectId);
    if (!project) throw new Error("Research project not found.");
    if (!project.cloud_project_id) throw new Error("Share this project before syncing threads.");
    const warnings = [];
    let warnedLegacyTurns = false;
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
          created_at: thread.created_at,
          updated_at: thread.updated_at,
        });
        const detail = store.getResearchThread(thread.id);
        const remote = await api.getThread(thread.id);
        const remoteTurns = new Map((remote.turns || []).map((turn) => [turn.id, turn]));
        for (const turn of detail.turns || []) {
          const previous = remoteTurns.get(turn.id);
          if (previous && mergeTurn(previous, { ...turn, thread_id: thread.id }) === previous) continue;
          const saved = await api.saveTurn(thread.id, {
            id: turn.id,
            mode: turn.mode,
            user_message: turn.user_message,
            assistant_message: turn.assistant_message,
            status: turn.status,
            created_at: turn.created_at,
            completed_at: turn.completed_at,
            sync_revision: turnRevision(turn),
          });
          if (saved && !saved.sync_revision && !warnedLegacyTurns) {
            warnedLegacyTurns = true;
            warnings.push('The cloud server needs sync migration 0013 to prevent older clients from overwriting final turns. This desktop keeps its local final turns.');
          }
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
        const remoteCommentById = new Map(remoteComments.map((comment) => [comment.id, comment]));
        for (const comment of store.listProjectComments(projectId, { resourceType: "thread", resourceId: thread.id })) {
          const remote = remoteCommentById.get(comment.id);
          if (remote) {
            if (Date.parse(comment.updated_at) > Date.parse(remote.updated_at) && comment.resolved_at !== remote.resolved_at) {
              await api.updateComment(comment.id, { resolved_at: comment.resolved_at });
            }
            continue;
          }
          if (comment.author_id !== localUserId) continue;
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
        // A turn can finish without changing a previously fetched thread list.
        // Merge every detail by execution revision, not by the list timestamp.
        const detail = await api.getThread(remoteThread.id);
        const current = local ? store.getResearchThread(local.id) : null;
        store.applyCloudThread(projectId, mergeCloudThread(current, detail), { currentCloudUserId, localUserId });
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

  async function syncProjectThreads(projectId, options) {
    const captured = providedStore.captureStore?.();
    const owner = captured?.store || providedStore;
    try { return await (owner.run ? owner.run(() => syncInStore(owner, projectId, options)) : syncInStore(owner, projectId, options)); }
    finally { captured?.release(); }
  }

  return { syncProjectThreads };
}

module.exports = { createThreadSync };
