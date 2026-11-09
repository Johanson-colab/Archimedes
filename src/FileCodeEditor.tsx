import { useEffect, useRef } from "react";
import { basicSetup } from "codemirror";
import { EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { HighlightStyle, LanguageDescription, indentUnit, syntaxHighlighting } from "@codemirror/language";
import { languages } from "@codemirror/language-data";
import { markdown } from "@codemirror/lang-markdown";
import { tags } from "@lezer/highlight";
import type { FileSelection } from "./file-editor";

const highlightStyle = HighlightStyle.define([
  { tag: tags.comment, color: "var(--code-comment)" },
  { tag: [tags.keyword, tags.modifier, tags.operatorKeyword], color: "var(--code-keyword)" },
  { tag: [tags.string, tags.special(tags.string), tags.regexp], color: "var(--code-string)" },
  { tag: [tags.number, tags.bool, tags.null], color: "var(--code-number)" },
  { tag: [tags.function(tags.variableName), tags.className, tags.typeName], color: "var(--code-function)" },
  { tag: [tags.propertyName, tags.attributeName], color: "var(--code-number)" },
  { tag: [tags.operator, tags.punctuation, tags.bracket], color: "var(--code-operator)" },
  { tag: tags.heading, color: "var(--code-keyword)", fontWeight: "700" },
  { tag: tags.link, color: "var(--code-function)", textDecoration: "underline" },
  { tag: tags.emphasis, fontStyle: "italic" },
  { tag: tags.strong, fontWeight: "700" },
]);

const editorTheme = EditorView.theme({
  "&": { height: "100%", color: "var(--code-fg)", backgroundColor: "var(--code-bg)", fontSize: "13px" },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "var(--font-mono)",
    lineHeight: "1.65",
  },
  ".cm-content": { padding: "13px 0 28px", caretColor: "var(--code-fg)" },
  ".cm-gutters": {
    color: "var(--code-line-number)",
    backgroundColor: "var(--code-bg)",
    border: "none",
  },
  ".cm-activeLine": { backgroundColor: "var(--code-line-hover)" },
  ".cm-activeLineGutter": { color: "var(--code-fg)", backgroundColor: "var(--code-line-hover)" },
  ".cm-cursor, .cm-dropCursor": { borderLeftColor: "var(--code-fg)" },
  "&.cm-focused": { outline: "none" },
});

async function languageExtension(filePath: string) {
  if (/\.(?:md|mdx)$/i.test(filePath)) return markdown({ codeLanguages: languages });
  const description = LanguageDescription.matchFilename(languages, filePath);
  return description ? (await description.load()).extension : [];
}

export default function FileCodeEditor({ filePath, value, onChange, onSave, onSelectionChange }: {
  filePath: string;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onSelectionChange?: (selection: FileSelection | null) => void;
}) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const valueRef = useRef(value);
  const onChangeRef = useRef(onChange);
  const onSaveRef = useRef(onSave);
  const onSelectionChangeRef = useRef(onSelectionChange);
  valueRef.current = value;
  onChangeRef.current = onChange;
  onSaveRef.current = onSave;
  onSelectionChangeRef.current = onSelectionChange;

  useEffect(() => {
    let cancelled = false;
    let view: EditorView | null = null;
    void languageExtension(filePath).then((language) => {
      if (cancelled || !hostRef.current) return;
      view = new EditorView({
        state: EditorState.create({
          doc: valueRef.current,
          extensions: [
            keymap.of([{ key: "Mod-s", preventDefault: true, run: () => { onSaveRef.current(); return true; } }]),
            basicSetup,
            EditorState.tabSize.of(2),
            indentUnit.of("  "),
            editorTheme,
            syntaxHighlighting(highlightStyle),
            EditorView.contentAttributes.of({ "aria-label": `Edit ${filePath}`, spellcheck: "false" }),
            EditorView.updateListener.of((update) => {
              if (update.docChanged) onChangeRef.current(update.state.doc.toString());
              if (!update.selectionSet && !update.docChanged) return;
              const range = update.state.selection.main;
              if (range.empty) {
                onSelectionChangeRef.current?.(null);
                return;
              }
              onSelectionChangeRef.current?.({
                startLine: update.state.doc.lineAt(range.from).number,
                endLine: update.state.doc.lineAt(range.to).number,
                excerpt: update.state.sliceDoc(range.from, range.to),
              });
            }),
            ...(filePath.endsWith(".md") || filePath.endsWith(".mdx") ? [EditorView.lineWrapping] : []),
            language,
          ],
        }),
        parent: hostRef.current,
      });
      viewRef.current = view;
      view.focus();
    });
    return () => {
      cancelled = true;
      view?.destroy();
      viewRef.current = null;
      onSelectionChangeRef.current?.(null);
    };
  }, [filePath]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current !== value) view.dispatch({ changes: { from: 0, to: current.length, insert: value } });
  }, [value]);

  return <div className="artifact-code-editor" ref={hostRef} />;
}
