import { useState } from "react";
import { Download, ExternalLink, FileText, FolderUp, Search } from "lucide-react";
import official from "../shared/official-latex-templates.json";
import { useUISettings } from "./i18n";
import "./paper-template-library.css";

export const paperTemplates: LatexTemplateSummary[] = [
  ...official,
];

export default function PaperTemplateLibrary({ selected, onSelect, onCreate, onImport, onSource, projectName, onNameChange, creating, importing, error }: {
  selected: string; onSelect: (id: string) => void; onCreate: () => void; onImport: () => void;
  onSource: (url: string) => void; projectName: string; onNameChange: (value: string) => void;
  creating: boolean; importing: boolean; error: string;
}) {
  const { t } = useUISettings();
  const [query, setQuery] = useState("");
  const filtered = paperTemplates.filter((template) => `${template.name} ${template.category} ${template.description} ${template.year || ""} ${(template.venues || []).join(" ")}`.toLowerCase().includes(query.trim().toLowerCase()));
  const active = paperTemplates.find((template) => template.id === selected);
  return <div className="paper-template-library">
    <aside className="paper-template-categories" aria-label={t("Template categories")}>
      <button aria-pressed="true" onClick={() => setQuery("")}>{t("All templates")}<span>{paperTemplates.length}</span></button>
      <button disabled={importing || creating} onClick={onImport}><FolderUp size={15} />{t(importing ? "Importing…" : "Import existing folder")}</button>
    </aside>
    <section className="paper-template-content">
      <label className="paper-template-search"><Search size={16} /><input aria-label={t("Search templates")} placeholder={t("Search conference, publisher or template")} value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <p className="paper-template-notice">{t("Archimedes manages the compiler, fonts and packages. First use needs Internet access; downloaded dependencies are cached.")}</p>
      <div className="paper-template-grid">
        {filtered.map((template) => <article key={template.id} className={`paper-template-card${selected === template.id ? " selected" : ""}`}>
          <button className="paper-template-select" aria-pressed={selected === template.id} onClick={() => onSelect(template.id)}>
            <div className="paper-template-cover">{template.previewUrl ? <img src={`${import.meta.env.BASE_URL}${template.previewUrl}`} alt={t("Layout preview")} /> : <FileText size={26} />}<strong>{template.name}</strong><span>{t(template.sourceKind === "mirror" ? "Community mirror" : template.sourceUrl ? "Official author kit" : "General layout")}</span></div>
            <strong>{template.name}</strong><small>{t(template.category)} {template.year && `· ${template.year}`}</small>
            <p>{t(template.description)}</p>{template.requirements && <small>{t(template.requirements)}</small>}
            <span className="paper-template-delivery">{template.delivery === "download" && <Download size={12} />}{t(template.delivery === "download" ? "Download on first use" : template.delivery === "external" ? "Download from source" : "Included · offline")}</span>
          </button>
          {template.sourceUrl && <button className="paper-template-source" onClick={() => onSource(template.sourceUrl!)}>{t(template.sourceKind === "mirror" ? "Mirror source" : "Official source")}<ExternalLink size={12} /></button>}
          {template.officialSourceUrl && <button className="paper-template-source" onClick={() => onSource(template.officialSourceUrl!)}>{t("Venue instructions")}<ExternalLink size={12} /></button>}
        </article>)}
        {!filtered.length && <p role="status">{t("No matching templates")}</p>}
      </div>
      <form className="paper-template-create" onSubmit={(event) => { event.preventDefault(); if (!creating && active && active.delivery !== "external") onCreate(); }}>
        <label>{t("Project folder")}<input value={projectName} onChange={(event) => onNameChange(event.target.value)} disabled={creating} /></label>
        <span>{active?.name}</span>
        {active?.delivery === "external" ? <button type="button" className="primary-button" onClick={() => onSource(active.sourceUrl!)}>{t("Open official source")}<ExternalLink size={14} /></button> : <button className="primary-button" disabled={creating || importing || !active || !projectName.trim()}>{t(creating ? "Preparing template…" : "Create project")}</button>}
      </form>
      {error && <p className="paper-template-error" role="alert">{error}</p>}
    </section>
  </div>;
}
