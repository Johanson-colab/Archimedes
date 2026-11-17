const HEADER_NAME = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
const INVALID_HEADER_VALUE = /[^\t\x20-\x7e\x80-\xff]/;
const BLOCKED_HEADERS = new Set([
  "host",
  "content-length",
  "connection",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
  "keep-alive",
  "proxy-authorization",
  "proxy-authenticate",
]);

function sanitizeHeaders(input) {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const headers = new Map();
  for (const [rawName, rawValue] of Object.entries(input)) {
    const name = String(rawName || "").trim();
    const value = typeof rawValue === "string" ? rawValue.trim() : "";
    if (!HEADER_NAME.test(name) || BLOCKED_HEADERS.has(name.toLowerCase())) continue;
    if (!value || INVALID_HEADER_VALUE.test(value) || value.length > 2000) continue;
    headers.set(name.toLowerCase(), [name, value]);
  }
  return Object.fromEntries(headers.values());
}

function sanitizeSessionHeader(input) {
  if (!input || typeof input !== "object") return null;
  const name = String(input.name || "").trim();
  if (!HEADER_NAME.test(name) || BLOCKED_HEADERS.has(name.toLowerCase())) return null;
  const strategy = input.strategy === "fixed" ? "fixed" : input.strategy === "disabled" ? "disabled" : "thread";
  const value = String(input.value || "").trim();
  if (value && (INVALID_HEADER_VALUE.test(value) || value.length > 2000)) return null;
  if (strategy === "fixed" && !value) return null;
  return { name, strategy, ...(value ? { value } : {}) };
}

function buildModelHeaders(config = {}, sessionId = "", options = {}) {
  const headers = new Map();
  const setHeader = (name, value) => headers.set(name.toLowerCase(), [name, value]);
  for (const [name, value] of Object.entries(options.baseHeaders || {})) setHeader(name, value);
  if (options.anthropic) {
    if (config.apiKey) setHeader("x-api-key", config.apiKey);
    setHeader("anthropic-version", "2023-06-01");
  } else if (config.apiKey) {
    setHeader("Authorization", `Bearer ${config.apiKey}`);
  }
  for (const [name, value] of Object.entries(sanitizeHeaders(config.headers))) setHeader(name, value);
  const sessionHeader = sanitizeSessionHeader(config.sessionHeader);
  if (sessionHeader && sessionHeader.strategy !== "disabled") {
    const value = sessionHeader.strategy === "fixed" ? sessionHeader.value : sessionId;
    if (value) setHeader(sessionHeader.name, value);
  }
  if (config.userAgent) {
    const userAgent = String(config.userAgent).trim();
    if (userAgent && !INVALID_HEADER_VALUE.test(userAgent) && userAgent.length <= 300) setHeader("User-Agent", userAgent);
  }
  return Object.fromEntries(headers.values());
}

function hasPrivateHeaderValues(config) {
  return Boolean(Object.keys(config.headers || {}).length || config.sessionHeader?.strategy === "fixed");
}

function buildModelRequestOptions(config, sessionId, options) {
  const headers = buildModelHeaders(config, sessionId, options);
  // Fetch can forward custom credentials on redirects, even when it strips Authorization.
  return hasPrivateHeaderValues(config) ? { headers, redirect: "error" } : { headers };
}

function formatProviderError(prefix, status, detail, config = {}) {
  const text = String(detail || "").slice(0, 500);
  if (/MissingSessionID|x-opencode-session/i.test(text)) {
    return `${prefix} (${status}): This provider requires a stable session header. In Settings → Models, choose the OpenCode Go preset or set Session header to x-opencode-session with the Thread strategy.`;
  }
  return `${prefix} (${status})${text && !hasPrivateHeaderValues(config) ? `: ${text}` : ""}`;
}

function formatModelRequestError(status, detail, config) {
  return formatProviderError("Model request failed", status, detail, config);
}

function formatConnectionError(status, detail, config) {
  return formatProviderError("Connection failed", status, detail, config);
}

module.exports = {
  buildModelHeaders,
  buildModelRequestOptions,
  formatConnectionError,
  formatModelRequestError,
  sanitizeHeaders,
  sanitizeSessionHeader,
};
