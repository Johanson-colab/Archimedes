import { createContext, useContext, useMemo, type ComponentProps, type ReactNode } from "react";
import { defaultUrlTransform } from "react-markdown";
import { workspaceFileLink } from "./workspace-links";

const WorkspaceLinks = createContext<{ workspace: string; onOpenFile: (path: string) => void } | null>(null);

export function WorkspaceMarkdownProvider({ workspace, onOpenFile, children }: { workspace: string; onOpenFile: (path: string) => void; children: ReactNode }) {
  const value = useMemo(() => ({ workspace, onOpenFile }), [workspace, onOpenFile]);
  return <WorkspaceLinks.Provider value={value}>{children}</WorkspaceLinks.Provider>;
}

// Preserve file URLs only on anchors, whose click is handled below. Keep the
// default sanitizer for images and for executable/unsupported URL protocols.
export function workspaceMarkdownUrlTransform(url: string, key: string) {
  if (key === "href" && (/^file:/i.test(url) || /^[a-z]:[\\/]/i.test(url))) return url;
  return defaultUrlTransform(url);
}

export function WorkspaceMarkdownLink({ href, children, node: _node, ...props }: ComponentProps<"a"> & { node?: unknown }) {
  const context = useContext(WorkspaceLinks);
  if (!href) return <span>{children}</span>;
  if (/^(?:https?:|mailto:|tel:|\/\/)/i.test(href)) return <a {...props} href={href} target="_blank" rel="noreferrer">{children}</a>;
  if (href.startsWith("#")) return <a {...props} href={href}>{children}</a>;
  const filePath = context && workspaceFileLink(href, context.workspace);
  if (!filePath) return <span title={href}>{children}</span>;
  return <a {...props} href={href} onClick={(event) => {
    event.preventDefault();
    context.onOpenFile(filePath);
  }} onAuxClick={(event) => {
    event.preventDefault();
    if (event.button === 1) context.onOpenFile(filePath);
  }}>{children}</a>;
}
