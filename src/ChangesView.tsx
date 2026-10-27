import { useMemo, useState } from "react";
import { FilePlus2, FilePenLine, FileX2, GitCompareArrows } from "lucide-react";
import { useUISettings } from "./i18n";

type ChangesViewProps = {
  changeSets: WorkspaceChangeSet[];
  hasThread: boolean;
  onOpenFile: (path: string) => void;
};

type ChangeFilter = "all" | WorkspaceFileChange["status"];

const FILTERS: Array<{ id: ChangeFilter; label: string }> = [
  { id: "all", label: "All" },
  { id: "modified", label: "Modified" },
  { id: "created", label: "Created" },
  { id: "deleted", label: "Deleted" },
];

function formatChangeTime(value: string, language: "en" | "zh") {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(language === "zh" ? "zh-CN" : "en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function changeIcon(status: WorkspaceFileChange["status"]) {
  if (status === "created") return <FilePlus2 size={14} />;
  if (status === "deleted") return <FileX2 size={14} />;
  return <FilePenLine size={14} />;
}

export default function ChangesView({ changeSets, hasThread, onOpenFile }: ChangesViewProps) {
  const { language, t } = useUISettings();
  const [filter, setFilter] = useState<ChangeFilter>("all");
  const groups = useMemo(() => [...changeSets]
    .filter((changeSet) => changeSet.changes.length > 0)
    .sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()), [changeSets]);
  const allChanges = useMemo(() => groups.flatMap((group) => group.changes), [groups]);
  const visibleChanges = allChanges.filter((change) => filter === "all" || change.status === filter);
  const additions = visibleChanges.reduce((total, change) => total + change.additions, 0);
  const deletions = visibleChanges.reduce((total, change) => total + change.deletions, 0);
  const hasAnyChanges = allChanges.length > 0;

  return <section className="changes-view" aria-label={t("Changes")}>
    <div className="changes-summary">
      <div>
        <strong>{visibleChanges.length === 1 ? t("1 file") : t("{count} files", { count: visibleChanges.length })}</strong>
        <span>{hasAnyChanges ? t("Changed by the agent in this conversation.") : t("No file changes yet.")}</span>
      </div>
      <div className="changes-totals" aria-label={t("Line changes")}>
        <span className="add">+{additions}</span>
        <span className="del">-{deletions}</span>
      </div>
    </div>

    <div className="changes-filters" role="group" aria-label={t("Filter changes")}>
      {FILTERS.map((item) => <button key={item.id} className={filter === item.id ? "active" : ""} onClick={() => setFilter(item.id)} aria-pressed={filter === item.id}>{t(item.label)}</button>)}
    </div>

    {visibleChanges.length === 0 ? <div className="changes-empty">
      <GitCompareArrows size={24} />
      <strong>{hasAnyChanges ? t("No matching changes") : hasThread ? t("No file changes yet") : t("Start a conversation")}</strong>
      <span>{hasAnyChanges ? t("Try a different filter.") : t("Files changed by the agent will appear here.")}</span>
    </div> : <div className="changes-groups">
      {groups.map((group) => {
        const changes = group.changes.filter((change) => filter === "all" || change.status === filter);
        if (!changes.length) return null;
        return <section className="changes-group" key={group.id}>
          <header>
            <span>{group.kind === "command" ? t("Command") : t("Agent edit")}</span>
            <time dateTime={group.createdAt}>{formatChangeTime(group.createdAt, language)}</time>
            <small>{changes.length === 1 ? t("1 file") : t("{count} files", { count: changes.length })}</small>
          </header>
          {changes.map((change) => <button
            className={`change-row ${change.status}`}
            key={`${group.id}:${change.path}:${change.status}`}
            disabled={change.status === "deleted"}
            onClick={() => onOpenFile(change.path)}
            title={change.status === "deleted" ? t("Deleted file") : t("Open {path}", { path: change.path })}
          >
            <span className="change-row-icon">{changeIcon(change.status)}</span>
            <span className="change-row-copy">
              <strong>{change.path}</strong>
              <small>{t(change.status === "created" ? "Created" : change.status === "deleted" ? "Deleted" : "Modified")}</small>
            </span>
            <span className="change-row-count add">+{change.additions}</span>
            <span className="change-row-count del">-{change.deletions}</span>
          </button>)}
        </section>;
      })}
    </div>}
  </section>;
}
