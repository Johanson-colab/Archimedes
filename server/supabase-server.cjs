const http = require("node:http");
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

      const projectMatch = url.pathname.match(/^\/v1\/projects\/([^/]+)(?:\/(members))?$/);
      if (projectMatch) {
        const projectId = projectMatch[1];
        const section = projectMatch[2];
        if (!section && method === "GET") return send(res, 200, { project: await projectResponse(supabase, projectId) });

        if (section === "members" && method === "GET") {
          const { data, error } = await supabase.rpc("list_project_members", { p_project: projectId });
          if (error) throw apiError(error);
          return send(res, 200, { members: data || [] });
        }
        if (section === "members" && method === "POST") {
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
