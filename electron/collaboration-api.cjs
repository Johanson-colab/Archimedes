function createCollaborationApi({ baseUrl, getToken, fetchImpl = globalThis.fetch } = {}) {
  if (typeof baseUrl !== "string" || !baseUrl) throw new Error("A collaboration API URL is required.");
  if (typeof getToken !== "function") throw new Error("A token provider is required.");
  if (typeof fetchImpl !== "function") throw new Error("Fetch is not available.");

  async function request(path, { method = "GET", body } = {}) {
    const token = await getToken();
    if (!token) throw new Error("Sign in to your cloud account to collaborate.");
    const response = await fetchImpl(`${baseUrl}${path}`, {
      method,
      headers: {
        authorization: `Bearer ${token}`,
        ...(body === undefined ? {} : { "content-type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    let payload = null;
    try { payload = await response.json(); } catch { /* empty response */ }
    if (!response.ok) throw new Error(payload?.error || `Collaboration request failed (${response.status}).`);
    return payload;
  }

  return {
    async status() {
      try {
        const result = await request("/v1/me");
        return { signedIn: true, user: result.user, baseUrl };
      } catch (error) {
        return { signedIn: false, user: null, baseUrl, error: error instanceof Error ? error.message : String(error) };
      }
    },
    async listProjects() {
      return (await request("/v1/projects")).projects || [];
    },
    async createProject({ name, description = "" } = {}) {
      return (await request("/v1/projects", { method: "POST", body: { name, description } })).project;
    },
    async getProject(projectId) {
      return (await request(`/v1/projects/${encodeURIComponent(projectId)}`)).project;
    },
    async listMembers(projectId) {
      return (await request(`/v1/projects/${encodeURIComponent(projectId)}/members`)).members || [];
    },
    async addMember(projectId, { email, role = "viewer" } = {}) {
      return (await request(`/v1/projects/${encodeURIComponent(projectId)}/members`, {
        method: "POST",
        body: { email, role },
      })).members || [];
    },
    async updateMember(projectId, userId, role) {
      return (await request(`/v1/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`, {
        method: "PATCH",
        body: { role },
      })).members || [];
    },
    async removeMember(projectId, userId) {
      return (await request(`/v1/projects/${encodeURIComponent(projectId)}/members/${encodeURIComponent(userId)}`, {
        method: "DELETE",
      })).members || [];
    },
    async listLibraries(projectId) {
      return (await request(`/v1/projects/${encodeURIComponent(projectId)}/libraries`)).libraries || [];
    },
    async createLibrary(projectId, { name, description = "", color = "#3973c8" } = {}) {
      return (await request(`/v1/projects/${encodeURIComponent(projectId)}/libraries`, {
        method: "POST",
        body: { name, description, color },
      })).library;
    },
    async updateLibrary(libraryId, patch) {
      return (await request(`/v1/libraries/${encodeURIComponent(libraryId)}`, {
        method: "PATCH",
        body: patch,
      })).library;
    },
    async deleteLibrary(libraryId) {
      return request(`/v1/libraries/${encodeURIComponent(libraryId)}`, { method: "DELETE" });
    },
    async listPapers(libraryId) {
      return (await request(`/v1/libraries/${encodeURIComponent(libraryId)}/papers`)).papers || [];
    },
    async addPaper(libraryId, paper) {
      return (await request(`/v1/libraries/${encodeURIComponent(libraryId)}/papers`, {
        method: "POST",
        body: { paper },
      })).paper;
    },
    async removePaper(libraryId, paperId) {
      return request(`/v1/libraries/${encodeURIComponent(libraryId)}/papers/${encodeURIComponent(paperId)}`, { method: "DELETE" });
    },
    async updatePaperState(paperId, patch) {
      return (await request(`/v1/papers/${encodeURIComponent(paperId)}`, {
        method: "PATCH",
        body: patch,
      })).state;
    },
    async listHighlights(projectId, paperId = "") {
      const query = paperId ? `?paperId=${encodeURIComponent(paperId)}` : "";
      return (await request(`/v1/projects/${encodeURIComponent(projectId)}/highlights${query}`)).highlights || [];
    },
    async addHighlight(projectId, highlight) {
      return (await request(`/v1/projects/${encodeURIComponent(projectId)}/highlights`, {
        method: "POST",
        body: highlight,
      })).highlight;
    },
    async updateHighlight(highlightId, patch) {
      return (await request(`/v1/highlights/${encodeURIComponent(highlightId)}`, {
        method: "PATCH",
        body: patch,
      })).highlight;
    },
    async deleteHighlight(highlightId) {
      return request(`/v1/highlights/${encodeURIComponent(highlightId)}`, { method: "DELETE" });
    },
    async getReview(projectId, paperId) {
      return (await request(`/v1/projects/${encodeURIComponent(projectId)}/papers/${encodeURIComponent(paperId)}/review`)).review;
    },
    async saveReview(projectId, paperId, review, visibility = "private") {
      return (await request(`/v1/projects/${encodeURIComponent(projectId)}/papers/${encodeURIComponent(paperId)}/review`, {
        method: "PUT",
        body: { review, visibility },
      })).review;
    },
    async getPresentation(projectId, paperId) {
      return (await request(`/v1/projects/${encodeURIComponent(projectId)}/papers/${encodeURIComponent(paperId)}/presentation`)).presentation;
    },
    async savePresentation(projectId, paperId, presentation, { visibility = "private", sourceReviewUpdatedAt = "" } = {}) {
      return (await request(`/v1/projects/${encodeURIComponent(projectId)}/papers/${encodeURIComponent(paperId)}/presentation`, {
        method: "PUT",
        body: { presentation, visibility, source_review_updated_at: sourceReviewUpdatedAt },
      })).presentation;
    },
    async listThreads(projectId) {
      return (await request(`/v1/projects/${encodeURIComponent(projectId)}/threads`)).threads || [];
    },
    async saveThread(projectId, thread) {
      return (await request(`/v1/projects/${encodeURIComponent(projectId)}/threads`, {
        method: "POST",
        body: thread,
      })).thread;
    },
    async getThread(threadId) {
      return request(`/v1/threads/${encodeURIComponent(threadId)}`);
    },
    async updateThread(threadId, patch) {
      return (await request(`/v1/threads/${encodeURIComponent(threadId)}`, {
        method: "PATCH",
        body: patch,
      })).thread;
    },
    async saveTurn(threadId, turn) {
      return (await request(`/v1/threads/${encodeURIComponent(threadId)}/turns`, {
        method: "POST",
        body: turn,
      })).turn;
    },
    async saveEvents(threadId, events) {
      return (await request(`/v1/threads/${encodeURIComponent(threadId)}/events`, {
        method: "POST",
        body: { events },
      })).events || [];
    },
    async listComments(projectId, { resourceType = "", resourceId = "" } = {}) {
      const query = new URLSearchParams();
      if (resourceType) query.set("resourceType", resourceType);
      if (resourceId) query.set("resourceId", resourceId);
      const suffix = query.toString() ? `?${query}` : "";
      return (await request(`/v1/projects/${encodeURIComponent(projectId)}/comments${suffix}`)).comments || [];
    },
    async saveComment(projectId, comment) {
      return (await request(`/v1/projects/${encodeURIComponent(projectId)}/comments`, {
        method: "POST",
        body: comment,
      })).comment;
    },
    async updateComment(commentId, patch) {
      return (await request(`/v1/comments/${encodeURIComponent(commentId)}`, {
        method: "PATCH",
        body: patch,
      })).comment;
    },
    async deleteComment(commentId) {
      return request(`/v1/comments/${encodeURIComponent(commentId)}`, { method: "DELETE" });
    },
    async createShareLink(projectId, { resourceType, resourceId, role = "viewer", expiresInDays = 7 } = {}) {
      return (await request(`/v1/projects/${encodeURIComponent(projectId)}/share-links`, {
        method: "POST",
        body: { resource_type: resourceType, resource_id: resourceId, role, expires_in_days: expiresInDays },
      })).share;
    },
    async revokeShareLink(shareId) {
      return request(`/v1/share-links/${encodeURIComponent(shareId)}`, { method: "DELETE" });
    },
    async exportProject(projectId) {
      return (await request(`/v1/projects/${encodeURIComponent(projectId)}/export`)).export;
    },
    async listAuditEvents(projectId) {
      return (await request(`/v1/projects/${encodeURIComponent(projectId)}/audit`)).events || [];
    },
    async getSharedDocument(projectId, docKey) {
      return (await request(`/v1/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(docKey)}`)).document;
    },
    async applySharedDocumentUpdate(projectId, docKey, update) {
      return (await request(`/v1/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(docKey)}`, {
        method: "POST",
        body: { update },
      })).document;
    },
    async listAgentRuns(projectId) {
      return (await request(`/v1/projects/${encodeURIComponent(projectId)}/runs`)).runs || [];
    },
    async startAgentRun(projectId, threadId, contextManifest = {}) {
      return (await request(`/v1/projects/${encodeURIComponent(projectId)}/runs`, {
        method: "POST",
        body: { thread_id: threadId, context_manifest: contextManifest },
      })).run;
    },
    async getAgentRun(runId) {
      return (await request(`/v1/runs/${encodeURIComponent(runId)}`)).run;
    },
    async joinAgentRun(runId, role = "observer") {
      return (await request(`/v1/runs/${encodeURIComponent(runId)}/join`, {
        method: "POST",
        body: { role },
      })).run;
    },
    async enqueueAgentPrompt(runId, body) {
      return (await request(`/v1/runs/${encodeURIComponent(runId)}/prompts`, {
        method: "POST",
        body: { body },
      })).run;
    },
    async claimAgentPrompt(runId) {
      return (await request(`/v1/runs/${encodeURIComponent(runId)}/prompts/claim`, { method: "POST" })).prompt;
    },
    async finishAgentRun(runId, status) {
      return (await request(`/v1/runs/${encodeURIComponent(runId)}`, {
        method: "PATCH",
        body: { status },
      })).run;
    },
    async requestAgentAction(projectId, action) {
      return (await request(`/v1/projects/${encodeURIComponent(projectId)}/agent-actions`, {
        method: "POST",
        body: action,
      })).action;
    },
    async resolveAgentAction(actionId, approved) {
      return request(`/v1/agent-actions/${encodeURIComponent(actionId)}`, {
        method: "PATCH",
        body: { approved },
      });
    },
    async redeemShareLink(shareToken) {
      const response = await fetchImpl(`${baseUrl}/v1/public/shares/${encodeURIComponent(shareToken)}`);
      let payload = null;
      try { payload = await response.json(); } catch { /* empty */ }
      if (!response.ok) throw new Error(payload?.error || "This share link is invalid or has expired.");
      return payload.share;
    },
  };
}

module.exports = { createCollaborationApi };
