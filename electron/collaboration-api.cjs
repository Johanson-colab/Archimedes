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
  };
}

module.exports = { createCollaborationApi };
