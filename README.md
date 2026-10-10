# Archimedes

Archimedes is a local-first AI-for-Research agent that brings research conversations, literature, workspace tools, experiments, and scientific writing into one desktop application.

The current implementation includes:

- persistent multi-turn Research Chat with resumable threads;
- streaming model responses and auditable tool-call events;
- approval-gated workspace writes and shell commands;
- persistent literature libraries with search, import, reading state, and notes;
- daily arXiv paper discovery and keyword search;
- official conference paper search for ICML, ICLR, NeurIPS, CVPR, ICCV, ECCV, ACL, EMNLP, and AAAI (2023–2026), with presentation filters and durable source provenance;
- title-to-full-text reading of public papers with page-numbered PDF evidence, phrase lookup across up to 120 PDF pages, and optional vision inspection of individual PDF pages;
- optional general web and news search with batched queries, date and domain filters, page reading, in-page find, and a Deep research mode;
- a separate visible browser for dynamic pages and sites where the user needs to sign in;
- local files, folders, papers, plugins, and skills as selectable Agent context;
- an interactive terminal connected to the active research workspace.

## Run locally

```bash
cd "/Users/jackson/Documents/AI Research/ResearchDesk"
npm install
npm run dev
```

The renderer is available at `http://127.0.0.1:5173` while development is running. The full Agent, SQLite, filesystem, approval, and terminal capabilities run inside Electron.

## Local workspace data

Archimedes creates `.archimedes/archimedes.db` inside the selected workspace. It stores Research Chat threads and turns, Agent events, literature metadata, approvals, and command history locally. The directory is ignored by Git.

Existing local data created by earlier versions is migrated automatically when the workspace is opened.

## Model configuration

Copy `.env.example` to `.env.local` and configure an OpenAI-compatible Chat Completions endpoint:

```bash
ARCHIMEDES_LLM_API_KEY=your-local-api-key
ARCHIMEDES_LLM_BASE_URL=https://api.openai.com/v1
ARCHIMEDES_LLM_MODEL=gpt-4.1-mini
```

Model credentials stay in the Electron main process and are never exposed to the React renderer. Archimedes can read approved context automatically, while workspace writes and commands pause the Agent until the user approves or rejects them.

General web and news search uses a separate Brave Search API key. Save it from the globe button in Research Chat or set `ARCHIMEDES_WEB_SEARCH_API_KEY` in `.env.local`. The model API key does not provide web search. Search can cover papers, news, blogs, project sites, and documentation. The Agent can open public HTTPS pages, search within them, locate terms across public PDFs, and read selected PDF pages. Search hits are stored as discovery leads; text and page excerpts that were actually opened are stored separately as source evidence for each turn.

When an HTML page needs JavaScript or a user login, the Agent can open it in a separate, sandboxed browser window. The user can complete a sign-in there and ask the Agent to read the rendered page in a following turn. For figures or scanned pages, `inspect_pdf_page` renders one PDF page and sends it to the configured model; this requires an endpoint with image input support. It does not bypass paywalls or replace OCR for models that only accept text.

## Validation

```bash
npm run lint
npm run build
npm test
```

## Conference discovery

Open **Daily papers → 顶会检索**, choose a conference and year, and filter by title, author, topic, or presentation format. Day-range controls are disabled in conference mode. Results are paginated after filtering the entire downloaded catalog. Refresh rechecks the official source; normal searches reuse a six-hour workspace cache. Saved records keep their conference, presentation, source URLs, and retrieval time.

The catalog uses each conference's official virtual site, [CVF Open Access](https://openaccess.thecvf.com/), [ACL Anthology](https://aclanthology.org/), and [AAAI Press](https://ojs.aaai.org/index.php/AAAI/issue/archive). It excludes identifiable workshops, rejected/withdrawn entries, retractions, proceedings front matter, and duplicate presentation sessions. Presentation labels come from official decisions or schedules, never from model predictions. These labels describe conference presentation formats, not a universal ranking across conferences.

Unavailable editions and missing public data are shown explicitly. ICCV runs in odd years and ECCV in even years. On October 10, 2026, the EMNLP 2026 main Anthology volume was not yet public. ACL/EMNLP Anthology and AAAI Press do not supply per-paper Oral/Poster distinctions; those records remain **未标注**. CVPR's paginated export may deny public access to later pages; the adapter supplements it with official proceedings and schedules, reporting any remaining unclassified records. Source access failures are reported separately from empty search results; stale results disclose their cached status.

## Current boundary

The Agent currently provides persistent threads, streaming responses, bounded conversation context, tool execution records, and approval-aware continuation. Project memory, semantic retrieval over full-text papers, dynamic MCP discovery, and background research jobs are planned as later harness layers.
