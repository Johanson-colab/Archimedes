import { Activity, FileText, FlaskConical, HelpCircle, Lightbulb, type LucideIcon } from "lucide-react";
import { useUISettings } from "../i18n";
import { GRAPH_NODE_HEIGHT, GRAPH_NODE_WIDTH, type GraphLayout } from "./graphLayout";
import type { ResearchNodeKind } from "./types";

const KIND_ICONS: Record<ResearchNodeKind, LucideIcon> = {
  question: HelpCircle,
  idea: Lightbulb,
  experiment: FlaskConical,
  result: Activity,
  writing: FileText,
};

const KIND_LABELS: Record<ResearchNodeKind, string> = {
  question: "Question",
  idea: "Idea",
  experiment: "Experiment",
  result: "Result",
  writing: "Writing",
};

type Props = {
  layout: GraphLayout;
  selectedId: string | null;
  onSelect: (nodeId: string) => void;
};

export default function ResearchGraphView({ layout, selectedId, onSelect }: Props) {
  const { t } = useUISettings();
  return <div
    className="research-graph-canvas"
    style={{ width: layout.width, height: layout.height }}
  >
    <svg
      className="research-graph-edges"
      width={layout.width}
      height={layout.height}
      viewBox={`0 0 ${layout.width} ${layout.height}`}
      aria-hidden="true"
    >
      {layout.edges.map(({ edge, path, feedback }) => (
        <path
          key={edge.id}
          d={path}
          className={`research-graph-edge kind-${edge.kind}${feedback ? " feedback" : ""}`}
        />
      ))}
    </svg>
    {layout.nodes.map(({ node, x, y }) => {
      const Icon = KIND_ICONS[node.kind];
      const verdict = node.kind === "result"
        ? String((node.current_revision?.content as { interpretation?: { verdict?: unknown } } | null)?.interpretation?.verdict || "")
        : "";
      const selected = node.id === selectedId;
      return <button
        key={node.id}
        type="button"
        className={[
          "research-graph-node",
          `kind-${node.kind}`,
          `status-${node.status}`,
          node.archived ? "archived" : "",
          verdict ? `verdict-${verdict}` : "",
          selected ? "selected" : "",
        ].filter(Boolean).join(" ")}
        style={{ left: x, top: y, width: GRAPH_NODE_WIDTH, height: GRAPH_NODE_HEIGHT }}
        onClick={() => onSelect(node.id)}
        aria-pressed={selected}
        title={node.title}
      >
        <span className="research-graph-node-icon"><Icon size={13} aria-hidden="true" /></span>
        <span className="research-graph-node-copy">
          <span className="research-graph-node-kind">{t(KIND_LABELS[node.kind])}</span>
          <span className="research-graph-node-title">{node.title}</span>
        </span>
        <span className="research-graph-node-status" aria-hidden="true" />
      </button>;
    })}
  </div>;
}
