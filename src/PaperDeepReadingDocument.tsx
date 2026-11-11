import { useCallback, useEffect, useRef } from "react";
import { useUISettings } from "./i18n";

export default function PaperDeepReadingDocument({ html, title, pageCount, onOpenSource, readingLanguage }: { html: string; title: string; pageCount: number; onOpenSource?: (page: number) => void; readingLanguage?: "zh" | "en" }) {
  const frame = useRef<HTMLIFrameElement>(null);
  const { language } = useUISettings();
  const effectiveLanguage = readingLanguage || language;
  const sourceHandler = useRef(onOpenSource);
  sourceHandler.current = onOpenSource;
  const sendTheme = useCallback(() => {
    const style = getComputedStyle(document.documentElement);
    const names = { paper: "--surface-canvas", card: "--surface-panel", ink: "--text-primary", muted: "--text-muted", accent: "--accent", line: "--border-soft", warm: "--accent" };
    const colors = Object.fromEntries(Object.entries(names).map(([name, token]) => [name, style.getPropertyValue(token).trim()]));
    frame.current?.contentWindow?.postMessage({ type: "paper-deep-reading:theme", colors }, "*");
  }, []);
  const sendLanguage = useCallback(() => frame.current?.contentWindow?.postMessage({ type: "paper-deep-reading:language", language: effectiveLanguage === "zh" ? "zh" : "en" }, "*"), [effectiveLanguage]);
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow) return;
      if (event.data?.type === "paper-deep-reading:ready") { sendTheme(); sendLanguage(); }
      if (event.data?.type === "paper-deep-reading:source" && Number.isInteger(event.data.page) && event.data.page >= 1 && event.data.page <= pageCount) sourceHandler.current?.(event.data.page);
    };
    window.addEventListener("message", onMessage);
    const observer = new MutationObserver(sendTheme);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "class"] });
    return () => { window.removeEventListener("message", onMessage); observer.disconnect(); };
  }, [pageCount, sendTheme, sendLanguage]);
  useEffect(sendLanguage, [sendLanguage]);
  return <iframe ref={frame} className="paper-deep-reading-document" title={title} srcDoc={html} sandbox="allow-scripts allow-popups" onLoad={() => { sendTheme(); sendLanguage(); }} />;
}
