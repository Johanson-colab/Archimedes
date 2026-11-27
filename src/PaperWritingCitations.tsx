import { useEffect, useState } from "react";
import { Dialog } from "./Dialog";
import { useUISettings } from "./i18n";
import type { BibliographyPaper } from "./bibliography";

export default function PaperWritingCitations({ bridge, projectId, paths, workspace, onClose, onInsert }: {
  bridge: ResearchDeskBridge;
  projectId: string;
  paths: string[];
  workspace: string;
  onClose(): void;
  onInsert(paper: BibliographyPaper, bibliography: WorkspaceFilePreview): Promise<void>;
}) {
  const { t } = useUISettings();
  const [papers, setPapers] = useState<BibliographyPaper[]>([]);
  const [query, setQuery] = useState("");
  const [selectedPaper, setSelectedPaper] = useState("");
  const [target, setTarget] = useState(paths[0]);
  const [bibliography, setBibliography] = useState<WorkspaceFilePreview>();
  const [loadedTarget, setLoadedTarget] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let current = true;
    void bridge.listLibraries(projectId).then(libraries => Promise.all(libraries.map(library => bridge.listLibraryPapers(library.id)))).then(groups => {
      if (current) setPapers([...new Map(groups.flat().map(paper => [paper.id, paper])).values()]);
    }).catch(reason => { if (current) setLoadError(String(reason)); });
    return () => { current = false; };
  }, [bridge, projectId]);

  useEffect(() => {
    let current = true;
    void bridge.readWorkspaceFile(workspace, target).then(file => {
      if (current) { setBibliography(file); setLoadedTarget(target); }
    }).catch(reason => { if (current) setError(String(reason)); });
    return () => { current = false; };
  }, [bridge, target, workspace]);

  const results = papers.filter(paper => [paper.title, ...paper.authors, paper.citekey ?? ""].some(value => value.toLowerCase().includes(query.toLowerCase())));
  const paper = results.find(item => item.id === selectedPaper);
  async function insert() {
    if (!paper || !bibliography || loadedTarget !== target) return;
    setBusy(true);
    setError("");
    try { await onInsert(paper, bibliography); onClose(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : String(reason)); }
    finally { setBusy(false); }
  }

  return <Dialog open onClose={() => { if (!busy) onClose(); }} size="sm" ariaLabel={t("Insert project citation")}>
    <header className="app-dialog-header"><h2>{t("Insert project citation")}</h2></header>
    <div className="app-dialog-body">
      <p><label>{t("Find a project reference")} <input type="search" value={query} onChange={event => setQuery(event.target.value)} /></label></p>
      <p><label>{t("Project reference")} <select value={selectedPaper} onChange={event => setSelectedPaper(event.target.value)} disabled={busy}><option value="">{t("Select a paper")}</option>{results.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select></label></p>
      <p><label>{t("Manuscript bibliography")} <select value={target} disabled={busy} onChange={event => { setError(""); setTarget(event.target.value); }}>{paths.map(value => <option key={value}>{value}</option>)}</select></label></p>
      {(loadError || error) && <p role="alert">{t(loadError || error)}</p>}
    </div>
    <footer className="app-dialog-footer"><button type="button" className="secondary-button" onClick={onClose} disabled={busy}>{t("Cancel")}</button><button type="button" className="primary-button" disabled={busy || !paper || loadedTarget !== target} onClick={() => void insert()}>{t("Insert citation")}</button></footer>
  </Dialog>;
}
