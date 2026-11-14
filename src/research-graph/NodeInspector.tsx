import { useEffect, useState } from "react";
import { Plus } from "lucide-react";
import { useUISettings } from "../i18n";
import type { ResearchEdgeKind, ResearchNode, ResearchNodeKind } from "./types";

export type ChildOption = {
  kind: ResearchNodeKind;
  edge: ResearchEdgeKind | "cite-after-create";
  label: string;
};

type Props = {
  node: ResearchNode;
  childOptions: ChildOption[];
  busy: boolean;
  onCreateChild: (option: ChildOption, title: string) => Promise<void>;
};

const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  active: "Active",
  retracted: "Retracted",
};

export default function NodeInspector({ node, childOptions, busy, onCreateChild }: Props) {
  const { t } = useUISettings();
  const [childKind, setChildKind] = useState(childOptions[0]?.kind ?? "");
  const [title, setTitle] = useState("");

  useEffect(() => {
    setChildKind(childOptions[0]?.kind ?? "");
    setTitle("");
  }, [node.id, childOptions]);

  const option = childOptions.find((item) => item.kind === childKind) || childOptions[0] || null;
  const content = node.current_revision?.content ?? {};

  return <div className="research-graph-inspector">
    <div className="research-graph-inspector-head">
      <strong>{node.title}</strong>
      <span>{t(STATUS_LABELS[node.status] || node.status)}</span>
    </div>
    {node.summary && <p className="research-graph-summary">{node.summary}</p>}
    <details className="research-graph-content-details" open>
      <summary>{t("Content")}</summary>
      <pre className="research-graph-content-json">{JSON.stringify(content, null, 2)}</pre>
    </details>
    {option && <form
      className="research-graph-add-child"
      onSubmit={(event) => {
        event.preventDefault();
        const nextTitle = title.trim();
        if (!nextTitle || busy) return;
        void onCreateChild(option, nextTitle).then(() => setTitle(""));
      }}
    >
      <span className="research-graph-add-label">{t("Add child")}</span>
      <div className="research-graph-add-row">
        <select
          value={childKind}
          onChange={(event) => setChildKind(event.target.value as ResearchNodeKind)}
          aria-label={t("Add child")}
          disabled={busy}
        >
          {childOptions.map((item) => <option key={item.kind} value={item.kind}>{t(item.label)}</option>)}
        </select>
        <input
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("Child title")}
          aria-label={t("Child title")}
          maxLength={200}
          disabled={busy}
        />
        <button type="submit" disabled={busy || !title.trim()} aria-label={t("Create")}>
          <Plus size={12} />
        </button>
      </div>
    </form>}
  </div>;
}
