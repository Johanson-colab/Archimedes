const http = require("node:http");

const CALLBACK_PATH = "/auth/callback";
const RECOVERY_PATH = "/auth/recovery";

function createAuthFlow({ client, openExternal, port = 45871, timeoutMs = 300_000 } = {}) {
  if (!client?.auth?.exchangeCodeForSession) throw new Error("A Supabase auth client is required.");
  if (typeof openExternal !== "function") throw new Error("An external browser opener is required.");

  async function run({ mode = "signin", trigger } = {}) {
    if (typeof trigger !== "function") throw new Error("An auth trigger is required.");
    let resolveCode;
    let rejectCode;
    const codePromise = new Promise((resolve, reject) => { resolveCode = resolve; rejectCode = reject; });
    codePromise.catch(() => { /* reported by the race below */ });
    const server = http.createServer((request, response) => {
      const url = new URL(request.url || "/", "http://127.0.0.1");
      if (!url.pathname.startsWith("/auth/")) {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found.");
        return;
      }
      const error = url.searchParams.get("error_description") || url.searchParams.get("error");
      const code = url.searchParams.get("code");
      const message = error
        ? "Sign-in failed. You can close this tab and return to Archimedes."
        : "Archimedes is signing you in. You can close this tab.";
      response.writeHead(error ? 400 : 200, { "content-type": "text/html; charset=utf-8" });
      response.end(`<!doctype html><meta charset="utf-8"><title>Archimedes</title><style>body{font:14px system-ui;margin:48px;color:#222}strong{display:block;margin-bottom:8px;font-size:18px}</style><strong>${error ? "Sign-in failed" : "Signed in"}</strong>${message}`);
      if (error) rejectCode(new Error(error));
      else if (code) resolveCode(code);
      else rejectCode(new Error("The sign-in callback did not include a code."));
    });

    await new Promise((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, "127.0.0.1", () => { server.off("error", reject); resolve(); });
    });
    const address = server.address();
    const redirectTo = `http://127.0.0.1:${address.port}${mode === "recovery" ? RECOVERY_PATH : CALLBACK_PATH}`;

    let timeout;
    try {
      const result = await trigger(redirectTo);
      if (result?.session) return { session: result.session, flow: mode, redirectTo };
      if (result?.url) await openExternal(result.url);
      const code = await Promise.race([
        codePromise,
        new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error("The browser sign-in timed out. Try again.")), timeoutMs); }),
      ]);
      const { data, error } = await client.auth.exchangeCodeForSession(code);
      if (error) throw new Error(error.message || "Could not complete sign-in.");
      if (!data?.session) throw new Error("The sign-in callback did not return a session.");
      return { session: data.session, flow: mode, redirectTo };
    } finally {
      if (timeout) clearTimeout(timeout);
      await new Promise((resolve) => server.close(() => resolve()));
    }
  }

  return { run };
}

module.exports = { createAuthFlow, CALLBACK_PATH, RECOVERY_PATH };
