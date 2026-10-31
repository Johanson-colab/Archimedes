import { useEffect, useRef, useState } from "react";
import * as Y from "yjs";
import { LoaderCircle, NotebookPen } from "lucide-react";
import { useUISettings } from "./i18n";

type SharedNoteEditorProps = {
  bridge: ResearchDeskBridge;
  projectId: string;
  docKey?: string;
  initialText?: string;
  onTextChange?: (text: string) => void;
  title?: string;
};

function decodeState(value: string | undefined) {
  if (!value) return new Uint8Array();
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function encodeState(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}

export default function SharedNoteEditor({ bridge, projectId, docKey = "project-notes", initialText = "", onTextChange, title }: SharedNoteEditorProps) {
  const { t } = useUISettings();
  const [value, setValue] = useState("");
  const [status, setStatus] = useState<"loading" | "ready" | "saving" | "error">("loading");
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);
  const docRef = useRef<Y.Doc | null>(null);
  const textRef = useRef<Y.Text | null>(null);
  const applyingRemote = useRef(false);
  const versionRef = useRef(0);
  const initialTextRef = useRef(initialText);
  const onTextChangeRef = useRef(onTextChange);
  onTextChangeRef.current = onTextChange;

  useEffect(() => {
    let cancelled = false;
    const doc = new Y.Doc();
    const text = doc.getText("text");
    docRef.current = doc;
    textRef.current = text;
    let debounce: number | null = null;
    const observer = () => {
      if (cancelled) return;
      onTextChangeRef.current?.(text.toString());
      if (applyingRemote.current) return;
      setValue(text.toString());
      if (debounce) window.clearTimeout(debounce);
      debounce = window.setTimeout(() => {
        if (cancelled || typeof bridge.applySharedDocumentUpdate !== "function") return;
        setStatus("saving");
        const update = encodeState(Y.encodeStateAsUpdate(doc));
        void bridge.applySharedDocumentUpdate(projectId, docKey, update).then((document) => {
          if (cancelled) return;
          applyingRemote.current = true;
          Y.applyUpdate(doc, decodeState(document.state));
          setValue(text.toString());
          applyingRemote.current = false;
          versionRef.current = document.version;
          setVersion(document.version);
          setStatus("ready");
        }).catch((cause) => {
          if (cancelled) return;
          setError(cause instanceof Error ? cause.message : String(cause));
          setStatus("error");
        });
      }, 320);
    };
    text.observe(observer);

    async function pull() {
      if (typeof bridge.getSharedDocument !== "function") return;
      try {
        const document = await bridge.getSharedDocument(projectId, docKey);
        if (cancelled) return;
        if (document && document.version > versionRef.current) {
          applyingRemote.current = true;
          Y.applyUpdate(doc, decodeState(document.state));
          versionRef.current = document.version;
          setVersion(document.version);
          setValue(text.toString());
          onTextChangeRef.current?.(text.toString());
          applyingRemote.current = false;
        } else if (!document && initialTextRef.current) {
          applyingRemote.current = true;
          text.insert(0, initialTextRef.current);
          applyingRemote.current = false;
          setValue(text.toString());
          onTextChangeRef.current?.(text.toString());
          const saved = await bridge.applySharedDocumentUpdate?.(projectId, docKey, encodeState(Y.encodeStateAsUpdate(doc)));
          if (saved) {
            versionRef.current = saved.version;
            setVersion(saved.version);
          }
        }
        setStatus("ready");
        setError("");
      } catch (cause) {
        if (cancelled) return;
        setError(cause instanceof Error ? cause.message : String(cause));
        setStatus("error");
      }
    }

    void pull();
    const timer = window.setInterval(() => void pull(), 2_000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      if (debounce) window.clearTimeout(debounce);
      text.unobserve(observer);
      doc.destroy();
    };
  }, [bridge, docKey, projectId]);

  function update(next: string) {
    setValue(next);
    const text = textRef.current;
    const doc = docRef.current;
    if (!text || !doc) return;
    doc.transact(() => {
      text.delete(0, text.length);
      text.insert(0, next);
    });
  }

  return <section className="settings-section shared-note">
    <h3 className="settings-section-title"><NotebookPen size={15} />{title || t("Shared project note")}</h3>
    <div className="settings-group">
      <textarea className="shared-note-editor" value={value} onChange={(event) => update(event.target.value)} placeholder={t("Write a note together. Edits merge as you type.")} rows={7} aria-label={t("Shared project note")} />
      <div className="shared-note-footer">
        <span>{t("CRDT document · version {version}", { version })}</span>
        {status === "loading" && <span><LoaderCircle className="spin" size={12} />{t("Loading…")}</span>}
        {status === "saving" && <span><LoaderCircle className="spin" size={12} />{t("Saving…")}</span>}
        {status === "error" && <span className="warning">{error}</span>}
      </div>
    </div>
  </section>;
}
