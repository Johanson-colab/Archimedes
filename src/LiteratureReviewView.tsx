import { useRef, useState } from "react";
import { ArrowRight, BookOpenText, Check, Download, ExternalLink, LoaderCircle, Search, X } from "lucide-react";
import { useUISettings } from "./i18n";
import "./literature-review.css";

function safeLink(value: string) { try { const url = new URL(value); return ["https:", "http:"].includes(url.protocol) ? url.href : ""; } catch { return ""; } }
function cleanError(error: unknown) { return String(error).replace(/^Error invoking remote method '[^']+':\s*(?:Error:\s*)?|^Error:\s*/, ""); }

export default function LiteratureReviewView({ bridge }: { bridge: ResearchDeskBridge }) {
  const { t } = useUISettings();
  const [question, setQuestion] = useState("");
  const [searchedQuestion, setSearchedQuestion] = useState("");
  const [response, setResponse] = useState<DeepPaperSearchResponse | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [draft, setDraft] = useState<LiteratureReviewDraft | null>(null);
  const [draftPapers, setDraftPapers] = useState<AcademicSearchResult[]>([]);
  const [draftQuestion, setDraftQuestion] = useState("");
  const [busy, setBusy] = useState<"search" | "draft" | null>(null);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"papers" | "review">("papers");
  const request = useRef(0);
  async function search() {
    const q = question.trim(); if (q.length < 8 || busy) return;
    const id = ++request.current; setBusy("search"); setError("");
    try { const result = await bridge.deepSearchPapers({ prompt: q, topic: "all", limit: 18 }); if (id !== request.current) return; setResponse(result); setSearchedQuestion(q); setSelected([]); setDraft(null); setDraftPapers([]); setTab("papers"); }
    catch (cause) { if (id === request.current) setError(cleanError(cause)); }
    finally { if (id === request.current) setBusy(null); }
  }
  async function generate() {
    if (!response || !selected.length || busy) return;
    const papers = selected.map(index => response.results[index].paper); const id = ++request.current;
    setBusy("draft"); setError("");
    try { const result = await bridge.generateLiteratureReview({ question: searchedQuestion, papers }); if (id !== request.current) return; setDraft(result); setDraftPapers(papers); setDraftQuestion(searchedQuestion); setTab("review"); }
    catch (cause) { if (id === request.current) setError(cleanError(cause)); }
    finally { if (id === request.current) setBusy(null); }
  }
  function toggle(index: number) { setSelected(current => current.includes(index) ? current.filter(item => item !== index) : [...current, index].sort((a, b) => a - b)); }
  function download() {
    if (!draft) return;
    const sections = draft.sections.map(section => `## ${section.title}\n\n${section.paragraphs.map(paragraph => `${paragraph.text} ${paragraph.sources.map(id => `[${id}]`).join(" ")}`).join("\n\n")}`).join("\n\n");
    const refs = draftPapers.map((paper, index) => `[${index + 1}] ${paper.title} (${paper.year || "n.d."}). ${safeLink(paper.url)}`).join("\n\n");
    const content = `# Literature review\n\n${draftQuestion}\n\n> Draft based on titles and abstracts; verify claims against the original papers.\n\n${sections}\n\n## Limitations\n\n${draft.limitations || "Check original papers and source coverage."}\n\n## References\n\n${refs}\n`;
    const url = URL.createObjectURL(new Blob([content], { type: "text/markdown;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "literature-review.md"; anchor.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <main className="literature-review">
    <header className="lit-header"><div><span className="lit-mark"><BookOpenText size={19}/></span><div><h1>{t("Literature Review")}</h1><p>{t("From a research question to a source-linked draft.")}</p></div></div><span className="lit-status">{t("Abstract-based review")}</span></header>
    <div className="lit-body">
      <section className="lit-search"><div className="lit-search-copy"><h2>{t("What are you investigating?")}</h2><p>{t("Describe a question, method, or research direction. We’ll search scholarly indexes and help you assemble a reading set.")}</p></div><div className="lit-search-form"><label htmlFor="lit-question">{t("Research question")}</label><textarea id="lit-question" rows={3} value={question} maxLength={2000} onChange={event => setQuestion(event.target.value)} placeholder={t("For example: How do language agents learn from past failures?")} /><div className="lit-search-bottom"><span>{t("Searches arXiv, Semantic Scholar and OpenAlex")}</span><button className="primary-button" disabled={!!busy || question.trim().length < 8} onClick={() => void search()}>{busy === "search" ? <LoaderCircle size={15} className="spin"/> : <Search size={15}/>} {busy === "search" ? t("Searching…") : t("Find papers")} <ArrowRight size={14}/></button></div></div></section>
      {error && <div className="lit-notice" role="alert">{error}<button className="quiet-icon-button" aria-label={t("Dismiss")} onClick={() => setError("")}><X size={15}/></button></div>}
      {response?.warning && <p className="lit-warning" role="status">{response.warning}</p>}
      {!response ? <section className="lit-empty"><div><BookOpenText size={21}/><h2>{t("Build a reading set")}</h2><p>{t("Search for a topic, select the papers that matter, then draft a review grounded in their available abstracts.")}</p></div><div className="lit-empty-steps"><span><strong>{t("Discover")}</strong>{t("Search across scholarly indexes")}</span><span><strong>{t("Select")}</strong>{t("Choose papers for your review")}</span><span><strong>{t("Synthesize")}</strong>{t("Create a draft with source references")}</span></div><p className="lit-footnote">{t("This tool does not read full papers. Verify claims against original sources.")}</p></section> : <>
        <nav className="lit-tabs" aria-label={t("Literature review workspace")}><button className={tab === "papers" ? "active" : ""} onClick={() => setTab("papers")}>{t("Papers")} <span>{response.results.length}</span></button><button className={tab === "review" ? "active" : ""} disabled={!draft} onClick={() => setTab("review")}>{t("Review draft")}</button></nav>
        {tab === "papers" ? <section className="lit-results"><div className="lit-results-head"><div><h2>{t("Search results")}</h2><p>{searchedQuestion}</p><details><summary>{t("View search strategy")}</summary><ul>{response.plan.queries.map(query => <li key={query}>{query}</li>)}</ul><p>{t("Sources")}: {response.providers.join(", ") || "—"}</p></details></div><div className="lit-actions"><span>{t("{count} selected", { count: selected.length })}</span><button className="primary-button" disabled={!selected.length || !!busy} onClick={() => void generate()}>{busy === "draft" ? <LoaderCircle size={15} className="spin"/> : <BookOpenText size={15}/>} {busy === "draft" ? t("Drafting…") : t("Draft review")}</button></div></div>
          <div className="lit-paper-list">{response.results.map((result, index) => { const paper = result.paper; const link = safeLink(paper.url); const checked = selected.includes(index); return <article key={`${paper.external_id || paper.title}-${index}`} className={checked ? "lit-paper selected" : "lit-paper"}><button type="button" className="lit-select" onClick={() => toggle(index)} aria-pressed={checked} aria-label={t("Select {title}", { title: paper.title })}>{checked && <Check size={14}/>}</button><div className="lit-paper-main"><div className="lit-paper-meta"><span>{paper.year || "—"}</span><span>{paper.venue || paper.source || t("Unknown source")}</span></div><h3>{paper.title}{link && <a href={link} target="_blank" rel="noreferrer" aria-label={t("Open paper")}><ExternalLink size={14}/></a>}</h3><p className="lit-authors">{paper.authors.slice(0, 4).join(", ")}{paper.authors.length > 4 ? " et al." : ""}</p><p className="lit-abstract">{paper.abstract || t("No abstract available.")}</p><p className="lit-reason">{result.reason}</p></div><span className="lit-match">{result.relevance === "strong" ? t("Strong match") : result.relevance === "related" ? t("Related") : t("Background")}</span></article>; })}</div>
        </section> : draft && <section className="lit-draft"><div className="lit-results-head"><div><h2>{t("Review draft")}</h2><p>{draftQuestion}</p></div><button className="secondary-button" onClick={download}><Download size={15}/> {t("Export Markdown")}</button></div><p className="lit-warning">{t("Based on titles and abstracts only. Source references do not verify individual claims; read the original papers.")}</p>{draft.sections.map((section, index) => <section key={`${section.title}-${index}`}><h3>{section.title}</h3>{section.paragraphs.map((paragraph, p) => <p key={p}>{paragraph.text} {paragraph.sources.map(source => <a className="lit-citation" key={source} href={`#lit-reference-${source}`}>[{source}]</a>)}</p>)}</section>)}{draft.limitations && <section><h3>{t("Limitations")}</h3><p>{draft.limitations}</p></section>}<section className="lit-references"><h3>{t("References")}</h3>{draftPapers.map((paper, index) => { const link = safeLink(paper.url); return <p id={`lit-reference-${index + 1}`} key={index}><strong>[{index + 1}]</strong> {link ? <a href={link} target="_blank" rel="noreferrer">{paper.title}</a> : paper.title} · {paper.year || "—"}</p>; })}</section></section>}
      </>}
    </div>
  </main>;
}
