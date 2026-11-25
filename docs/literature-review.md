# Literature Review workflow

Archimedes implements a bounded literature workflow informed by PaperSeek revision `de11b26`. It does not launch PaperSeek or depend on its MCP server. See `third-party/paperseek` for attribution and license.

Each search selects one source: OpenAlex, arXiv, Semantic Scholar, Crossref, or PubMed. The configured Agent API model proposes queries, searches run in bounded rounds, and a second round may be proposed using hit counts and sample titles. Search events and query hit counts appear in the UI. OpenAlex can retrieve additional recent and highly cited candidates, then expand up to two seed works in both citation directions; incomplete expansion is reported.

Local candidate fusion combines weighted reciprocal rank, primary-source rank, BM25, token-hash cosine similarity and query-term coverage. The API model can score up to 64 candidates using title and abstract metadata; failed or partial model scoring falls back to local order with a warning. Local hash similarity is not a learned embedding. A query plan is not a guarantee of exhaustive retrieval, study quality or enforcement of all requested constraints.

Completed searches, explicit outline saves, and completed drafts are persisted locally, scoped by workspace and project. Search cancellation aborts network calls; incomplete jobs are not resumed after an app restart. Search results may be exported as BibTeX, RIS, CSV or JSON; a review can be exported as Markdown.

Review outlines are editable, including paper assignments. Drafts are generated from selected titles and abstracts, not PDFs. Each retained paragraph must contain at least one excerpt found verbatim in its source abstract. This verifies that the excerpt exists, not that the paragraph's interpretation follows from it. Users must inspect original papers.

Limitations: no PaperSeek service, Web of Science, Google Scholar/Serper, Wanfang, NSSD, Chinese medical databases, full-corpus bibliometrics, draft version history, Word export, or automatic recovery of interrupted work. Citation expansion is capped, depends on OpenAlex availability, and can be incomplete. Native Codex/Claude/OpenCode are not used for query planning or review drafting: those stages use Archimedes's configured Agent API model. Keys for OpenAlex and Semantic Scholar can be saved in Settings → Environment; they are sent only to the matching service for the chosen source.
