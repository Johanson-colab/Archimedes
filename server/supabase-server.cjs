const http = require("node:http");
const { randomUUID } = require("node:crypto");
const { createClient } = require("@supabase/supabase-js");

function createSupabaseServer({ supabaseUrl, publishableKey } = {}) {
  if (!supabaseUrl || !publishableKey) throw new Error("Supabase URL and publishable key are required.");

  function tokenFrom(req) {
    const header = String(req.headers.authorization || "");
    return header.startsWith("Bearer ") ? header.slice(7) : "";
  }

  function clientFor(token) {
    return createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
  }

  function send(res, status, body) {
    res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    res.end(JSON.stringify(body));
  }

  async function readBody(req) {
    const chunks = [];
    let size = 0;
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 1_000_000) throw Object.assign(new Error("Request body is too large."), { status: 413 });
      chunks.push(chunk);
    }
    if (!chunks.length) return {};
    try { return JSON.parse(Buffer.concat(chunks).toString("utf8")); }
    catch { throw Object.assign(new Error("Request body must be JSON."), { status: 400 }); }
  }

  function apiError(error) {
    const message = error?.message || String(error);
    const code = error?.code || error?.status;
    const status = code === "42501" || /permission|access|authenticated/i.test(message) ? 403 : 400;
    return Object.assign(new Error(message), { status });
  }

  function libraryResponse(row) {
    return {
      id: row.id,
      project_id: row.project_id,
      name: row.name,
      description: row.description,
      color: row.color,
      created_at: row.created_at,
      updated_at: row.updated_at,
      paper_count: Number(row.paper_count?.[0]?.count ?? row.library_items?.[0]?.count) || 0,
    };
  }

  function paperResponse(row, item = {}, state = null) {
    return {
      id: row.id,
      canonical_key: row.canonical_key,
      title: row.title,
      authors: Array.isArray(row.authors_json) ? row.authors_json : [],
      authors_json: row.authors_json || [],
      year: row.year,
      venue: row.venue,
      abstract: row.abstract,
      url: row.url,
      pdf_url: row.pdf_url,
      doi: row.doi,
      arxiv_id: row.arxiv_id,
      s2_id: row.s2_id,
      source: row.source,
      citation_count: row.citation_count,
      github_url: row.github_url,
      github_stars: row.github_stars,
      conference: row.conference_json || null,
      conference_json: row.conference_json || null,
      added_at: item.added_at || row.created_at,
      note: item.note || "",
      reading_status: state?.reading_status || "unread",
      starred: Boolean(state?.starred),
      notes: state?.notes || "",
      tags: Array.isArray(state?.tags_json) ? state.tags_json : [],
      state_updated_at: state?.updated_at || null,
      created_at: row.created_at,
      updated_at: row.updated_at,
    };
  }

  async function listLibraryPapers(supabase, libraryId, userId) {
    const { data: items, error } = await supabase
      .from("library_items")
      .select("item_id, note, added_at")
      .eq("library_id", libraryId)
      .eq("item_type", "paper")
      .order("added_at", { ascending: false });
    if (error) throw apiError(error);
    const ids = (items || []).map((item) => item.item_id);
    if (!ids.length) return [];
    const [{ data: papers, error: paperError }, { data: states, error: stateError }] = await Promise.all([
      supabase.from("papers").select("*").in("id", ids),
      supabase.from("paper_user_state").select("*").eq("user_id", userId).in("paper_id", ids),
    ]);
    if (paperError) throw apiError(paperError);
    if (stateError) throw apiError(stateError);
    const paperById = new Map((papers || []).map((paper) => [paper.id, paper]));
    const stateById = new Map((states || []).map((state) => [state.paper_id, state]));
    return items.flatMap((item) => {
      const paper = paperById.get(item.item_id);
      return paper ? [paperResponse(paper, item, stateById.get(paper.id))] : [];
    });
  }

  async function projectResponse(supabase, projectId) {
    const { data, error } = await supabase
      .from("projects")
      .select("id, org_id, owner_id, name, description, default_thread_visibility, workspace_mode, created_at, updated_at, archived_at, project_members!inner(user_id, role)")
      .eq("id", projectId)
      .single();
    if (error) throw apiError(error);
    return {
      id: data.id,
      org_id: data.org_id,
      owner_id: data.owner_id,
      name: data.name,
      description: data.description,
      default_thread_visibility: data.default_thread_visibility,
      workspace_mode: data.workspace_mode,
      created_at: data.created_at,
      updated_at: data.updated_at,
      archived_at: data.archived_at,
      role: data.project_members?.[0]?.role || null,
    };
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url || "/", "http://localhost");
      const method = req.method || "GET";
      if (method === "GET" && url.pathname === "/health") return send(res, 200, { ok: true, service: "archimedes-supabase-api", version: 1 });

      const token = tokenFrom(req);
      if (!token) throw Object.assign(new Error("Authentication required."), { status: 401 });
      const supabase = clientFor(token);
      const { data: authData, error: authError } = await supabase.auth.getUser(token);
      if (authError || !authData?.user) throw Object.assign(new Error("Your session is invalid or expired."), { status: 401 });
      const user = authData.user;

      if (method === "GET" && url.pathname === "/v1/me") {
        return send(res, 200, { user: { id: user.id, email: user.email || "", displayName: user.user_metadata?.full_name || "" } });
      }

      if (method === "GET" && url.pathname === "/v1/projects") {
        const { data, error } = await supabase
          .from("projects")
          .select("id, org_id, owner_id, name, description, default_thread_visibility, workspace_mode, created_at, updated_at, archived_at, project_members!inner(user_id, role)")
          .eq("project_members.user_id", user.id)
          .order("updated_at", { ascending: false });
        if (error) throw apiError(error);
        return send(res, 200, { projects: (data || []).map((project) => ({ ...project, role: project.project_members?.[0]?.role || null, project_members: undefined })) });
      }

      if (method === "POST" && url.pathname === "/v1/projects") {
        const body = await readBody(req);
        const name = String(body.name || "").trim();
        if (!name || name.length > 100) throw Object.assign(new Error("A project name of at most 100 characters is required."), { status: 400 });
        const { data: projectId, error } = await supabase.rpc("create_project", { p_name: name, p_description: String(body.description || "").slice(0, 500) });
        if (error) throw apiError(error);
        return send(res, 201, { project: await projectResponse(supabase, projectId) });
      }

      const projectLibrariesMatch = url.pathname.match(/^\/v1\/projects\/([^/]+)\/libraries$/);
      if (projectLibrariesMatch) {
        const projectId = projectLibrariesMatch[1];
        if (method === "GET") {
          const { data, error } = await supabase
            .from("libraries")
            .select("id, project_id, name, description, color, created_at, updated_at, paper_count:library_items(count)")
            .eq("project_id", projectId)
            .order("updated_at", { ascending: false });
          if (error) throw apiError(error);
          return send(res, 200, { libraries: (data || []).map(libraryResponse) });
        }
        if (method === "POST") {
          const body = await readBody(req);
          const name = String(body.name || "").trim();
          if (!name || name.length > 100) throw Object.assign(new Error("A library name of at most 100 characters is required."), { status: 400 });
          const { data, error } = await supabase.from("libraries").insert({
            project_id: projectId,
            name,
            description: String(body.description || "").slice(0, 500),
            color: String(body.color || "#3973c8").slice(0, 32),
          }).select("id, project_id, name, description, color, created_at, updated_at").single();
          if (error) throw apiError(error);
          return send(res, 201, { library: { ...data, paper_count: 0 } });
        }
      }

      const libraryMatch = url.pathname.match(/^\/v1\/libraries\/([^/]+)$/);
      if (libraryMatch) {
        const libraryId = libraryMatch[1];
        if (method === "PATCH") {
          const body = await readBody(req);
          const patch = {};
          if (typeof body.name === "string") {
            if (!body.name.trim() || body.name.trim().length > 100) throw Object.assign(new Error("A library name of at most 100 characters is required."), { status: 400 });
            patch.name = body.name.trim();
          }
          if (typeof body.description === "string") patch.description = body.description.slice(0, 500);
          if (typeof body.color === "string") patch.color = body.color.slice(0, 32);
          patch.updated_at = new Date().toISOString();
          const { data, error } = await supabase.from("libraries").update(patch).eq("id", libraryId)
            .select("id, project_id, name, description, color, created_at, updated_at").single();
          if (error) throw apiError(error);
          return send(res, 200, { library: { ...data, paper_count: 0 } });
        }
        if (method === "DELETE") {
          const { error } = await supabase.from("libraries").delete().eq("id", libraryId);
          if (error) throw apiError(error);
          return send(res, 200, { deleted: true });
        }
      }

      const libraryPapersMatch = url.pathname.match(/^\/v1\/libraries\/([^/]+)\/papers(?:\/([^/]+))?$/);
      if (libraryPapersMatch) {
        const libraryId = libraryPapersMatch[1];
        const paperId = libraryPapersMatch[2];
        if (!paperId && method === "GET") {
          return send(res, 200, { papers: await listLibraryPapers(supabase, libraryId, user.id) });
        }
        if (!paperId && method === "POST") {
          const body = await readBody(req);
          const paper = body.paper && typeof body.paper === "object" ? body.paper : body;
          if (!String(paper.title || "").trim() || !String(paper.canonical_key || "").trim()) {
            throw Object.assign(new Error("A paper title and canonical key are required."), { status: 400 });
          }
          const { data: newPaperId, error } = await supabase.rpc("upsert_paper_to_library", {
            p_library: libraryId,
            p_paper: {
              canonical_key: String(paper.canonical_key).slice(0, 500),
              title: String(paper.title).slice(0, 2000),
              authors_json: Array.isArray(paper.authors) ? paper.authors : (Array.isArray(paper.authors_json) ? paper.authors_json : []),
              year: Number.isInteger(paper.year) ? paper.year : null,
              venue: String(paper.venue || ""),
              abstract: String(paper.abstract || "").slice(0, 100_000),
              url: String(paper.url || ""),
              pdf_url: String(paper.pdf_url || ""),
              doi: String(paper.doi || ""),
              arxiv_id: String(paper.arxiv_id || ""),
              s2_id: String(paper.s2_id || ""),
              source: String(paper.source || "manual"),
              citation_count: Number(paper.citation_count) || 0,
              github_url: String(paper.github_url || ""),
              github_stars: Number(paper.github_stars) || 0,
              conference_json: paper.conference || paper.conference_json || null,
              note: String(paper.note || ""),
            },
          });
          if (error) throw apiError(error);
          const { data: row, error: readError } = await supabase.from("papers").select("*").eq("id", newPaperId).single();
          if (readError) throw apiError(readError);
          return send(res, 201, { paper: paperResponse(row) });
        }
        if (paperId && method === "DELETE") {
          const { error } = await supabase.from("library_items").delete()
            .eq("library_id", libraryId).eq("item_type", "paper").eq("item_id", paperId);
          if (error) throw apiError(error);
          return send(res, 200, { removed: true });
        }
      }

      const paperMatch = url.pathname.match(/^\/v1\/papers\/([^/]+)$/);
      if (paperMatch && method === "PATCH") {
        const paperId = paperMatch[1];
        const body = await readBody(req);
        const readingStatus = body.reading_status;
        if (readingStatus !== undefined && !["unread", "reading", "read"].includes(readingStatus)) {
          throw Object.assign(new Error("Unknown reading status."), { status: 400 });
        }
        const { data: paper, error: paperError } = await supabase.from("papers").select("id").eq("id", paperId).maybeSingle();
        if (paperError) throw apiError(paperError);
        if (!paper) throw Object.assign(new Error("Paper not found."), { status: 404 });
        const patch = {
          paper_id: paperId,
          user_id: user.id,
          ...(readingStatus === undefined ? {} : { reading_status: readingStatus }),
          ...(typeof body.starred === "boolean" ? { starred: body.starred } : {}),
          ...(typeof body.notes === "string" ? { notes: body.notes.slice(0, 100_000) } : {}),
          ...(Array.isArray(body.tags) ? { tags_json: body.tags } : {}),
          updated_at: new Date().toISOString(),
        };
        const { data, error } = await supabase.from("paper_user_state").upsert(patch, { onConflict: "paper_id,user_id" })
          .select("paper_id, reading_status, starred, notes, tags_json, updated_at").single();
        if (error) throw apiError(error);
        return send(res, 200, { state: data });
      }

      const projectHighlightsMatch = url.pathname.match(/^\/v1\/projects\/([^/]+)\/highlights$/);
      if (projectHighlightsMatch) {
        const projectId = projectHighlightsMatch[1];
        if (method === "GET") {
          let query = supabase.from("paper_highlights").select("*").eq("project_id", projectId)
            .order("page_number", { ascending: true }).order("created_at", { ascending: true });
          const paperId = url.searchParams.get("paperId");
          if (paperId) query = query.eq("paper_id", paperId);
          const { data, error } = await query;
          if (error) throw apiError(error);
          return send(res, 200, { highlights: data || [] });
        }
        if (method === "POST") {
          const body = await readBody(req);
          const pageNumber = Number(body.page_number);
          const quote = String(body.quote || "").trim();
          if (!body.paper_id || !Number.isInteger(pageNumber) || pageNumber < 1 || !quote || quote.length > 5_000) {
            throw Object.assign(new Error("A paper, page, and text selection are required."), { status: 400 });
          }
          const { data, error } = await supabase.from("paper_highlights").insert({
            id: body.id || randomUUID(),
            project_id: projectId,
            paper_id: body.paper_id,
            author_id: user.id,
            visibility: body.visibility === "private" ? "private" : "project",
            page_number: pageNumber,
            quote,
            start_offset: Number.isInteger(body.start_offset) ? body.start_offset : null,
            end_offset: Number.isInteger(body.end_offset) ? body.end_offset : null,
            note: String(body.note || "").slice(0, 5_000),
            color: ["green", "yellow", "blue", "pink", "red"].includes(body.color) ? body.color : "green",
          }).select("*").single();
          if (error) throw apiError(error);
          return send(res, 201, { highlight: data });
        }
      }

      const highlightMatch = url.pathname.match(/^\/v1\/highlights\/([^/]+)$/);
      if (highlightMatch) {
        const highlightId = highlightMatch[1];
        if (method === "PATCH") {
          const body = await readBody(req);
          const patch = {};
          if (typeof body.note === "string") patch.note = body.note.slice(0, 5_000);
          if (["green", "yellow", "blue", "pink", "red"].includes(body.color)) patch.color = body.color;
          if (body.visibility === "private" || body.visibility === "project") patch.visibility = body.visibility;
          patch.updated_at = new Date().toISOString();
          const { data, error } = await supabase.from("paper_highlights").update(patch).eq("id", highlightId).select("*").single();
          if (error) throw apiError(error);
          return send(res, 200, { highlight: data });
        }
        if (method === "DELETE") {
          const { error } = await supabase.from("paper_highlights").delete().eq("id", highlightId);
          if (error) throw apiError(error);
          return send(res, 200, { deleted: true });
        }
      }

      const paperAnnotationMatch = url.pathname.match(/^\/v1\/projects\/([^/]+)\/papers\/([^/]+)\/(review|presentation)$/);
      if (paperAnnotationMatch) {
        const [, projectId, paperId, kind] = paperAnnotationMatch;
        const table = kind === "review" ? "paper_reviews" : "paper_presentations";
        if (method === "GET") {
          const { data, error } = await supabase.from(table).select("*")
            .eq("project_id", projectId).eq("paper_id", paperId)
            .order("updated_at", { ascending: false }).limit(1).maybeSingle();
          if (error) throw apiError(error);
          return send(res, 200, { [kind]: data || null });
        }
        if (method === "PUT") {
          const body = await readBody(req);
          const payload = kind === "review" ? (body.review || body.review_json) : (body.presentation || body.presentation_json);
          if (!payload || typeof payload !== "object") throw Object.assign(new Error(`A ${kind} object is required.`), { status: 400 });
          const existing = await supabase.from(table).select("id").eq("project_id", projectId).eq("paper_id", paperId).eq("owner_id", user.id).maybeSingle();
          if (existing.error) throw apiError(existing.error);
          const row = {
            project_id: projectId,
            paper_id: paperId,
            owner_id: user.id,
            visibility: body.visibility === "project" ? "project" : "private",
            [`${kind}_json`]: payload,
            ...(kind === "presentation" ? { source_review_updated_at: String(body.source_review_updated_at || "") } : {}),
          };
          const result = existing.data?.id
            ? await supabase.from(table).update(row).eq("id", existing.data.id).select("*").single()
            : await supabase.from(table).insert({ ...row, id: randomUUID() }).select("*").single();
          if (result.error) throw apiError(result.error);
          return send(res, 200, { [kind]: result.data });
        }
      }

      const projectMatch = url.pathname.match(/^\/v1\/projects\/([^/]+)$/);
      if (projectMatch && method === "GET") {
        return send(res, 200, { project: await projectResponse(supabase, projectMatch[1]) });
      }

      const membersMatch = url.pathname.match(/^\/v1\/projects\/([^/]+)\/members(?:\/([^/]+))?$/);
      if (membersMatch) {
        const projectId = membersMatch[1];
        const memberId = membersMatch[2];
        if (!memberId && method === "GET") {
          const { data, error } = await supabase.rpc("list_project_members", { p_project: projectId });
          if (error) throw apiError(error);
          return send(res, 200, { members: data || [] });
        }
        if (!memberId && method === "POST") {
          const body = await readBody(req);
          const email = String(body.email || "").trim().toLowerCase();
          const role = String(body.role || "viewer");
          if (!email.includes("@") || !["viewer", "commenter", "editor", "admin"].includes(role)) {
            throw Object.assign(new Error("A member email and non-owner role are required."), { status: 400 });
          }
          const { error } = await supabase.rpc("add_project_member_by_email", { p_project: projectId, p_email: email, p_role: role });
          if (error) throw apiError(error);
          const { data, error: listError } = await supabase.rpc("list_project_members", { p_project: projectId });
          if (listError) throw apiError(listError);
          return send(res, 201, { members: data || [] });
        }
        if (memberId && method === "PATCH") {
          const body = await readBody(req);
          const role = String(body.role || "");
          if (!["viewer", "commenter", "editor", "admin"].includes(role)) {
            throw Object.assign(new Error("A non-owner role is required."), { status: 400 });
          }
          const { error } = await supabase.rpc("update_project_member_role", { p_project: projectId, p_user: memberId, p_role: role });
          if (error) throw apiError(error);
          const { data, error: listError } = await supabase.rpc("list_project_members", { p_project: projectId });
          if (listError) throw apiError(listError);
          return send(res, 200, { members: data || [] });
        }
        if (memberId && method === "DELETE") {
          const { error } = await supabase.rpc("remove_project_member", { p_project: projectId, p_user: memberId });
          if (error) throw apiError(error);
          const { data, error: listError } = await supabase.rpc("list_project_members", { p_project: projectId });
          if (listError) throw apiError(listError);
          return send(res, 200, { members: data || [] });
        }
      }

      throw Object.assign(new Error("Not found."), { status: 404 });
    } catch (error) {
      const status = Number(error?.status) || 500;
      if (status >= 500) console.error(error);
      send(res, status, { error: error instanceof Error ? error.message : String(error) });
    }
  });

  return {
    server,
    listen(port = 0, host = "127.0.0.1") {
      return new Promise((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, host, () => {
          server.off("error", reject);
          resolve(server.address());
        });
      });
    },
    close() {
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}

module.exports = { createSupabaseServer };
