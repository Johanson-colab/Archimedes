import { useSyncExternalStore } from "react";
import protocol from "./context-tokens.json";

export type AgentBackend = "codex" | "claude" | "opencode";
export type HostContext = { theme: "paper" | "charcoal"; language: string };
let context: HostContext = { theme: "paper", language: "en" };
let hostOrigin: string | undefined;
const listeners = new Set<() => void>();
const pending = new Map<string, { finish: (error?: string, result?: string) => void }>();

window.addEventListener("message", event => {
  if (window.parent === window || event.source !== parent || (hostOrigin && event.origin !== hostOrigin)) return;
  const data = event.data;
  if (data?.type === "archimedes:context" && ["paper", "charcoal"].includes(data.theme)) {
    hostOrigin = event.origin;
    document.documentElement.dataset.theme = data.theme;
    for (const name of protocol.tokens) {
      const value = data.tokens?.[name];
      if (typeof value === "string" && value.length < 200) document.documentElement.style.setProperty(name, value);
    }
    if (typeof data.fontFamily === "string" && data.fontFamily.length < 300) document.documentElement.style.setProperty("--app-font", data.fontFamily);
    context = { theme: data.theme, language: typeof data.language === "string" ? data.language : "en" };
    listeners.forEach(listener => listener());
  } else if (data?.type === "archimedes:agent-result" && typeof data.requestId === "string") {
    pending.get(data.requestId)?.finish(data.error, data.result);
  }
});
if (window.parent !== window) parent.postMessage({ type: "archimedes:context-request" }, "*");

export function useHostContext() {
  return useSyncExternalStore(listener => { listeners.add(listener); return () => { listeners.delete(listener); }; }, () => context);
}
export function requestAgent(backend: AgentBackend, prompt: string, options: { signal?: AbortSignal } = {}): Promise<string> {
  if (window.parent === window) return Promise.reject(new Error("Open this App inside Archimedes to use an Agent."));
  if (!["codex", "claude", "opencode"].includes(backend) || !prompt.trim() || prompt.length > 12000) return Promise.reject(new Error("Choose a declared backend and a prompt of 1–12000 characters."));
  const requestId = Array.from(crypto.getRandomValues(new Uint8Array(16)), value => value.toString(16).padStart(2, "0")).join("");
  return new Promise((resolve, reject) => {
    const abort = () => finish("Agent request cancelled.");
    const finish = (error?: string, result?: string) => {
      clearTimeout(timer); pending.delete(requestId); options.signal?.removeEventListener("abort", abort);
      error ? reject(new Error(error)) : resolve(result || "");
    };
    const timer = setTimeout(() => finish("Agent request timed out."), 600000);
    pending.set(requestId, { finish });
    options.signal?.addEventListener("abort", abort, { once: true });
    if (options.signal?.aborted) { abort(); return; }
    parent.postMessage({ type: "archimedes:agent-request", requestId, backend, prompt }, hostOrigin && /^https?:\/\//.test(hostOrigin) ? hostOrigin : "*");
  });
}
/** App-local HTTP only. Keys stay in the Python process, never in browser code. */
export async function appFetch<T>(url: string, init?: RequestInit): Promise<T> {
  if (!url.startsWith("/api/") || /[\\\r\n]/.test(url)) throw new Error("Use an App-relative /api/ endpoint.");
  const target = new URL(url, location.origin);
  if (target.origin !== location.origin || !target.pathname.startsWith("/api/")) throw new Error("Use an App-relative /api/ endpoint.");
  const response = await fetch(target, init);
  if (!response.ok) throw new Error(`Request failed (${response.status}).`);
  return response.json() as Promise<T>;
}
