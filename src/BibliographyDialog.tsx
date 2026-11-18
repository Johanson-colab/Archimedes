import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog } from "./Dialog";
import { InlineNotice } from "./InlineNotice";
import { useUISettings } from "./i18n";
import { citationKeyIdentity, exportBibliography, matchBibliographyPaper, metadataDifferences, parseBibliography, type BibliographyBridge, type BibliographyPaper, type MetadataPatch } from "./bibliography";
import "./bibliography.css";

export default function BibliographyDialog({ bridge, library, onClose, onChanged }: { bridge: ResearchDeskBridge; library: ResearchLibrary; onClose: () => void; onChanged: () => Promise<void> }) {
  const { t } = useUISettings();
  const [input, setInput] = useState("");
  const [known, setKnown] = useState<BibliographyPaper[]>([]);
  const [targetPapers, setTargetPapers] = useState<BibliographyPaper[]>([]);
  const [projectPapers, setProjectPapers] = useState<BibliographyPaper[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [repairs, setRepairs] = useState<Record<number, string[]>>({});
  const [done, setDone] = useState<Set<number>>(new Set());
  const [error, setError] = useState("");
  const [exportText, setExportText] = useState("");
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const parsed = useMemo(() => parseBibliography(input), [input]);
  const preview = useMemo(() => parsed.entries.map((entry, index) => {
    const existing = matchBibliographyPaper(entry.paper, targetPapers, { strongOnly: true })
      || matchBibliographyPaper(entry.paper, projectPapers, { strongOnly: true })
      || matchBibliographyPaper(entry.paper, known, { strongOnly: true })
      || matchBibliographyPaper(entry.paper, targetPapers)
      || matchBibliographyPaper(entry.paper, projectPapers)
      || matchBibliographyPaper(entry.paper, known);
    const duplicate = parsed.entries.findIndex((candidate) => matchBibliographyPaper(entry.paper, [candidate.paper as BibliographyPaper])) < index;
    const keyIdentity = citationKeyIdentity(entry.citekey);
    const keyConflict = targetPapers.some((paper) => paper.citekey && citationKeyIdentity(paper.citekey) === keyIdentity && paper.id !== existing?.id) || parsed.entries.some((candidate, candidateIndex) => candidateIndex < index && citationKeyIdentity(candidate.citekey) === keyIdentity && !matchBibliographyPaper(entry.paper, [candidate.paper as BibliographyPaper]));
    return { entry, existing, duplicate, keyConflict, differences: existing ? metadataDifferences(entry.paper, existing) : {} };
  }), [parsed.entries, known, targetPapers, projectPapers]);
  useEffect(() => {
    let active = true;
    void (async () => {
      const projects = bridge.listLibraryProjects ? await bridge.listLibraryProjects() : [];
      const projectIds = [...new Set([library.project_id, ...projects.map((project) => project.project_id)])];
      const libraries = (await Promise.all(projectIds.map((id) => bridge.listLibraries(id)))).flat();
      const all = await Promise.all(libraries.map(async (item) => ({ id: item.id, papers: await bridge.listLibraryPapers(item.id) })));
      if (!active) return;
      setKnown([...new Map(all.flatMap((item) => item.papers).map((paper) => [paper.id, paper])).values()]);
      setTargetPapers(all.find((item) => item.id === library.id)?.papers || []);
      const localLibraries = new Set(libraries.filter(item => item.project_id === library.project_id).map(item => item.id));
      setProjectPapers([...new Map(all.filter(item => localLibraries.has(item.id)).flatMap(item => item.papers).map(paper => [paper.id, paper])).values()]);
    })().catch((cause) => { if (active) setError(String(cause)); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [bridge, library.id]);
  function changeInput(value: string) {
    setInput(value); setDone(new Set()); setRepairs({}); setExportText("");
    setSelected(new Set(parseBibliography(value).entries.map((_, index) => index)));
  }
  async function apply() {
    setBusy(true); setError("");
    try {
      for (const [index, row] of preview.entries()) {
        if (!alive.current) break;
        if (!selected.has(index) || done.has(index) || row.duplicate || row.keyConflict) continue;
        let paper = await bridge.addLibraryPaper(library.id, row.existing || row.entry.paper) as BibliographyPaper;
        if (!alive.current) return;
        const fields = repairs[index] || [];
        if (row.existing && fields.length) {
          const patch = Object.fromEntries(fields.filter((field) => field in row.differences).map((field) => [field, row.differences[field as keyof MetadataPatch]]));
          if (Object.keys(patch).length) paper = await (bridge as BibliographyBridge).repairLibraryPaperMetadata(paper.id, patch);
        }
        // Repeat imports cannot replace a user's citation key or entry type.
        if (!alive.current) return;
        if (!paper.citekey || fields.includes("citekey")) await (bridge as BibliographyBridge).setPaperBibliography(paper.id, { citekey: row.entry.citekey, entryType: row.entry.entryType });
        setDone((current) => new Set(current).add(index));
      }
      if (!alive.current) return;
      await onChanged();
      if (!alive.current) return;
      const refreshed = await bridge.listLibraryPapers(library.id);
      if (!alive.current) return;
      setTargetPapers(refreshed);
      setProjectPapers(current => [...new Map([...current, ...refreshed].map(paper => [paper.id, paper])).values()]);
      setKnown((current) => [...new Map([...current, ...refreshed].map((paper) => [paper.id, paper])).values()]);
    } catch (cause) { setError(String(cause)); }
    finally { setBusy(false); }
  }
  function download() {
    const blob = new Blob([exportText], { type: "application/x-bibtex;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "references.bib"; link.click(); URL.revokeObjectURL(url);
  }
  return <Dialog open onClose={() => { if (!busy) onClose(); }} size="lg" className="workspace-modal paper-import-modal bibliography-dialog" ariaLabel={t("BibTeX interchange")}>
    <header className="modal-header"><h2>{t("BibTeX interchange")} · {library.name}</h2><button className="secondary-button" disabled={busy} onClick={onClose}>{t("Close")}</button></header>
    <p>{t("Preview first. Existing metadata, PDF files and personal notes are kept unless you explicitly select metadata repairs.")}</p>
    <label>{t("Choose a BibTeX file")}<input type="file" accept=".bib,.bibtex,text/plain" disabled={busy} onChange={(event) => { const file = event.target.files?.[0]; if (file) void file.text().then(changeInput).catch((cause) => setError(String(cause))); }} /></label>
    <textarea aria-label={t("BibTeX source")} value={input} disabled={busy} onChange={(event) => changeInput(event.target.value)} />
    {error && <InlineNotice tone="danger">{error}</InlineNotice>}
    {parsed.warnings.map((warning, index) => <InlineNotice tone="warning" key={index}>{warning}</InlineNotice>)}
    {preview.map((row, index) => <article className="external-paper" key={index}>
      <div><label><input type="checkbox" checked={selected.has(index) && !row.duplicate && !row.keyConflict} disabled={busy || done.has(index) || row.duplicate || row.keyConflict} onChange={(event) => setSelected((current) => { const next = new Set(current); if (event.target.checked) next.add(index); else next.delete(index); return next; })} />{row.entry.citekey}: {row.entry.paper.title}</label>
        <small>{t(row.keyConflict ? "Citation key conflict: edit the source before importing" : row.duplicate ? "Duplicate in this import" : row.existing ? Object.keys(row.differences).length ? "Existing paper with metadata differences" : "Existing paper" : "New paper")}{done.has(index) ? ` · ${t("Imported")}` : ""}</small>
        {row.existing?.citekey && row.existing.citekey !== row.entry.citekey && <label><input type="checkbox" disabled={busy || done.has(index)} checked={(repairs[index] || []).includes("citekey")} onChange={(event) => setRepairs((current) => ({ ...current, [index]: event.target.checked ? [...(current[index] || []), "citekey"] : (current[index] || []).filter((name) => name !== "citekey") }))} />{t("Replace citation key explicitly")}: {row.existing.citekey} → {row.entry.citekey}</label>}
        {row.existing && Object.entries(row.differences).map(([field, value]) => <label key={field}><input type="checkbox" disabled={busy || done.has(index)} checked={(repairs[index] || []).includes(field)} onChange={(event) => setRepairs((current) => ({ ...current, [index]: event.target.checked ? [...(current[index] || []), field] : (current[index] || []).filter((name) => name !== field) }))} />{t("Repair selected metadata")}: {field}: {JSON.stringify(row.existing![field as keyof MetadataPatch])} → {JSON.stringify(value)}</label>)}
      </div>
    </article>)}
    <footer><button className="primary-button" disabled={busy || loading || !preview.some((row, index) => selected.has(index) && !done.has(index) && !row.duplicate && !row.keyConflict)} onClick={() => void apply()}>{t("Import selected references")}</button><button className="secondary-button" disabled={busy || loading} onClick={() => setExportText(exportBibliography(targetPapers))}>{t("Preview BibTeX export")}</button></footer>
    {exportText && <><textarea readOnly aria-label={t("BibTeX export preview")} value={exportText} /><button className="secondary-button" onClick={download}>{t("Download BibTeX")}</button></>}
  </Dialog>;
}
