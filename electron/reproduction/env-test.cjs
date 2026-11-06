/**
 * Identifies a saved Hugging Face token.
 *
 * The value never leaves the main process: `whoami-v2` is called with it and
 * only the display name, role and account come back. That answers "which token
 * did I paste?" without ever showing the secret again.
 */

const WHOAMI_URL = "https://huggingface.co/api/whoami-v2";

function describeHuggingFaceWhoami(payload) {
  const token = payload?.auth?.accessToken && typeof payload.auth.accessToken === "object"
    ? payload.auth.accessToken
    : {};
  return {
    ok: true,
    provider: "huggingface",
    user: String(payload?.name || ""),
    token: String(token.displayName || ""),
    role: String(token.role || ""),
    permissions: Array.isArray(token.permissions) ? token.permissions.length : null,
  };
}

async function testHuggingFaceToken(token, { fetchImpl = fetch, signal } = {}) {
  const value = String(token || "");
  if (!value) return { ok: false, detail: "No value was saved for this variable." };
  let response;
  try {
    response = await fetchImpl(WHOAMI_URL, {
      headers: { Authorization: `Bearer ${value}`, Accept: "application/json" },
      signal,
    });
  } catch (error) {
    return { ok: false, detail: error?.name === "AbortError" ? "Hugging Face did not answer in time." : "Could not reach huggingface.co from this Mac." };
  }
  if (!response.ok) {
    return {
      ok: false,
      status: response.status,
      detail: response.status === 401
        ? "Hugging Face rejected this token (401). It may have been revoked, or it is not a Hugging Face token."
        : `Hugging Face answered ${response.status}.`,
    };
  }
  let payload;
  try {
    payload = await response.json();
  } catch {
    return { ok: false, detail: "Hugging Face returned something that is not JSON." };
  }
  return describeHuggingFaceWhoami(payload);
}

module.exports = { WHOAMI_URL, describeHuggingFaceWhoami, testHuggingFaceToken };
