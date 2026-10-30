import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Compass, ExternalLink, LoaderCircle, RotateCw, X } from "lucide-react";
import { useUISettings } from "./i18n";

const BROWSER_PARTITION = "archimedes-browser";
const BROWSER_URL_STORAGE_KEY = "archimedes-workbench-browser-url";

type BrowserWebview = HTMLElement & {
  loadURL: (url: string) => Promise<void>;
  goBack: () => void;
  goForward: () => void;
  reload: () => void;
  stop: () => void;
  canGoBack: () => boolean;
  canGoForward: () => boolean;
  getURL: () => string;
  setAudioMuted: (mute: boolean) => void;
};

type WebviewEvent = Event & {
  url?: string;
  title?: string;
  errorCode?: number;
  errorDescription?: string;
  isMainFrame?: boolean;
};

export function normalizeBrowserAddress(input: string): string | null {
  const value = input.trim();
  if (!value || /\s/.test(value)) return null;
  const withScheme = /^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`;
  try {
    const parsed = new URL(withScheme);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return null;
    if (!parsed.hostname) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

function storedBrowserUrl() {
  if (typeof window === "undefined") return "";
  const saved = window.localStorage.getItem(BROWSER_URL_STORAGE_KEY) || "";
  return normalizeBrowserAddress(saved) ?? "";
}

export default function BrowserView({ active = true, onOpenExternal }: { active?: boolean; onOpenExternal: (url: string) => void | Promise<unknown> }) {
  const { t } = useUISettings();
  const [url, setUrl] = useState(storedBrowserUrl);
  const [draft, setDraft] = useState(url);
  const [title, setTitle] = useState("");
  const [loading, setLoading] = useState(Boolean(url));
  const [canGoBack, setCanGoBack] = useState(false);
  const [canGoForward, setCanGoForward] = useState(false);
  const [error, setError] = useState("");
  const [addressError, setAddressError] = useState("");
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<BrowserWebview | null>(null);
  const attachedRef = useRef(false);
  const urlRef = useRef(url);
  const activeRef = useRef(active);

  useEffect(() => {
    urlRef.current = url;
  }, [url]);

  useEffect(() => {
    activeRef.current = active;
    const view = viewRef.current;
    if (!view || !attachedRef.current) return;
    try { view.setAudioMuted(!active); } catch { /* not ready yet */ }
  }, [active]);

  useEffect(() => {
    if (!url || viewRef.current) return;
    const host = hostRef.current;
    if (!host) return;
    const view = document.createElement("webview") as BrowserWebview;
    view.setAttribute("src", url);
    view.setAttribute("partition", BROWSER_PARTITION);
    view.setAttribute("allowpopups", "");
    view.setAttribute("webpreferences", "contextIsolation=yes, sandbox=yes, nodeIntegration=no");
    view.setAttribute("aria-label", t("Browser page"));
    view.style.width = "100%";
    view.style.height = "100%";

    const syncNavigation = () => {
      if (!attachedRef.current) return;
      try {
        setCanGoBack(view.canGoBack());
        setCanGoForward(view.canGoForward());
      } catch {
        setCanGoBack(false);
        setCanGoForward(false);
      }
    };
    const onReady = () => {
      attachedRef.current = true;
      try { view.setAudioMuted(!activeRef.current); } catch { /* not ready yet */ }
      syncNavigation();
    };
    const onStart = () => {
      setLoading(true);
      setError("");
    };
    const onStop = () => {
      setLoading(false);
      syncNavigation();
    };
    const onNavigate = (event: Event) => {
      const detail = event as WebviewEvent;
      if (!detail.url) return;
      setDraft(detail.url);
      setUrl(detail.url);
      setAddressError("");
      try { window.localStorage.setItem(BROWSER_URL_STORAGE_KEY, detail.url); } catch { /* storage unavailable */ }
      syncNavigation();
    };
    const onTitle = (event: Event) => {
      const detail = event as WebviewEvent;
      if (typeof detail.title === "string") setTitle(detail.title);
    };
    const describeError = (detail: WebviewEvent) => {
      const description = detail.errorDescription || "";
      if (/ERR_NAME_NOT_RESOLVED/.test(description) || detail.errorCode === -105) return t("This address could not be resolved. Check the URL or your connection.");
      if (/ERR_CONNECTION_REFUSED/.test(description) || detail.errorCode === -102) return t("The site refused the connection.");
      if (/ERR_INTERNET_DISCONNECTED/.test(description) || detail.errorCode === -106) return t("You appear to be offline.");
      if (/ERR_CONNECTION_CLOSED|ERR_CONNECTION_RESET/.test(description)) return t("The connection closed before the page loaded.");
      if (/ERR_CONNECTION_TIMED_OUT|ERR_TIMED_OUT/.test(description)) return t("The site took too long to respond.");
      if (/ERR_ADDRESS_UNREACHABLE/.test(description) || detail.errorCode === -109) return t("The site could not be reached.");
      if (/ERR_CERT_|ERR_SSL_/.test(description)) return t("The secure connection to this site failed.");
      return description || t("This page could not be loaded.");
    };
    const onFail = (event: Event) => {
      const detail = event as WebviewEvent;
      if (detail.errorCode === -3 || detail.isMainFrame === false) return;
      if (!urlRef.current) return;
      setLoading(false);
      setTitle("");
      setError(describeError(detail));
      syncNavigation();
    };

    view.addEventListener("dom-ready", onReady);
    view.addEventListener("did-start-loading", onStart);
    view.addEventListener("did-stop-loading", onStop);
    view.addEventListener("did-navigate", onNavigate);
    view.addEventListener("did-navigate-in-page", onNavigate);
    view.addEventListener("page-title-updated", onTitle);
    view.addEventListener("did-fail-load", onFail);
    host.replaceChildren(view);
    viewRef.current = view;
  }, [t, url]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || !url || !attachedRef.current) return;
    let current = "";
    try { current = view.getURL(); } catch { /* not attached yet */ }
    if (current === url) return;
    setLoading(true);
    setError("");
    const target = url;
    try {
      void view.loadURL(url).catch((reason: unknown) => {
        if (urlRef.current !== target) return;
        const message = reason instanceof Error ? reason.message : String(reason);
        if (/ERR_ABORTED|\(-3\)/.test(message)) return;
        setLoading(false);
        setError(message || t("This page could not be loaded."));
      });
    } catch (reason) {
      if (urlRef.current !== target) return;
      setLoading(false);
      setError(reason instanceof Error ? reason.message : t("This page could not be loaded."));
    }
  }, [t, url]);

  useEffect(() => () => {
    attachedRef.current = false;
    viewRef.current?.remove();
    viewRef.current = null;
  }, []);

  function navigate() {
    const next = normalizeBrowserAddress(draft);
    if (!next) {
      setAddressError(t("Enter an http:// or https:// address."));
      return;
    }
    setAddressError("");
    if (next === url) {
      setError("");
      setLoading(true);
      try { viewRef.current?.reload(); } catch { /* not ready yet */ }
      return;
    }
    setUrl(next);
  }

  function openExternal() {
    if (!url) return;
    void onOpenExternal(url);
  }

  function pageHost(value: string) {
    try { return new URL(value).hostname; } catch { return value; }
  }

  return <section className="browser-view" aria-label={t("Browser")}>
    <header className="browser-toolbar">
      <button className="browser-nav-button" onClick={() => viewRef.current?.goBack()} disabled={!canGoBack} title={t("Back")} aria-label={t("Back")}><ArrowLeft size={14} /></button>
      <button className="browser-nav-button" onClick={() => viewRef.current?.goForward()} disabled={!canGoForward} title={t("Forward")} aria-label={t("Forward")}><ArrowRight size={14} /></button>
      <button className="browser-nav-button" onClick={() => loading ? viewRef.current?.stop() : viewRef.current?.reload()} disabled={!url} title={loading ? t("Stop") : t("Reload")} aria-label={loading ? t("Stop") : t("Reload")}>
        {loading ? <X size={14} /> : <RotateCw size={14} />}
      </button>
      <form className={addressError ? "browser-address invalid" : "browser-address"} onSubmit={(event) => { event.preventDefault(); navigate(); }}>
        <Compass size={13} />
        <input
          value={draft}
          onChange={(event) => { setDraft(event.target.value); setAddressError(""); }}
          placeholder={t("Enter a URL")}
          aria-label={t("Address")}
          aria-invalid={Boolean(addressError)}
          spellCheck={false}
          autoComplete="off"
        />
        {loading && <LoaderCircle className="spin browser-address-spinner" size={12} aria-hidden="true" />}
      </form>
      <button className="browser-nav-button" onClick={openExternal} disabled={!url} title={t("Open in system browser")} aria-label={t("Open in system browser")}><ExternalLink size={14} /></button>
    </header>

    {addressError && <div className="browser-status error" role="alert">{addressError}</div>}

    <div className="browser-page">
      {!url ? <div className="browser-empty">
        <Compass size={26} />
        <strong>{t("A lightweight browser")}</strong>
        <span>{t("Enter an address above to read a page beside your research.")}</span>
        <p>{t("Only http:// and https:// pages load here. They run in an isolated session, and links that open new windows go to your system browser.")}</p>
      </div> : <>
        <div className="browser-page-host" ref={hostRef} />
        {error && <div className="browser-error" role="alert">
          <strong>{t("This page could not be loaded")}</strong>
          <span>{error}</span>
          <div className="browser-error-actions">
            <button className="secondary-button" onClick={() => { setError(""); setLoading(true); try { viewRef.current?.reload(); } catch { /* not ready yet */ } }}>{t("Retry")}</button>
            <button className="secondary-button" onClick={openExternal}>{t("Open in system browser")}</button>
          </div>
        </div>}
      </>}
    </div>

    <footer className="browser-footer">
      <span>{title || t("No page loaded")}</span>
      <span>{url ? pageHost(url) : t("New page")}</span>
    </footer>
  </section>;
}
