# Axiom

Axiom is a local-first desktop research IDE. The first slice brings the main research loop into one interface:

- an evidence ledger connecting research claims to papers and evidence spans;
- persistent literature libraries with paper search, reading state, notes, and import;
- a research-agent task panel with visible context and source links;
- an approval gate for commands proposed by the agent or typed by the user;
- a local process panel that streams command output back into the workspace.

## Run locally

```bash
cd "/Users/jackson/Documents/AI Research/ResearchDesk"
npm install
npm run dev
```

The renderer is also available at `http://127.0.0.1:5173` while development is running. On the first Electron launch, npm downloads the platform-specific Electron runtime.

## Local workspace data

When a workspace is opened, Axiom creates `.axiom/axiom.db` inside that folder. It stores literature libraries, paper metadata, Agent task runs, and approved command history locally; the directory is ignored by Git. For this development checkout, `.env.local` selects the surrounding `AI Research` directory without committing that personal path.

## Literature library

The first-run library contains four curated research directions and verified metadata for representative papers. Paper records keep canonical arXiv/DOI links without automatically downloading PDFs.

Inside the desktop app you can:

- create, edit, and delete literature libraries;
- search, inspect, star, annotate, and remove saved papers;
- search by topic, title, DOI, arXiv URL, or arXiv ID;
- import metadata from Semantic Scholar, with OpenAlex as a fallback;
- discover papers and save them into a selected library.

## Agent configuration

Copy the Agent variables from `.env.example` into `.env.local` and set a local API key for an OpenAI-compatible Chat Completions endpoint:

```bash
AXIOM_LLM_API_KEY=your-local-api-key
AXIOM_LLM_BASE_URL=https://api.openai.com/v1
AXIOM_LLM_MODEL=gpt-4.1-mini
```

The Agent can list and read non-hidden workspace files automatically. It can only propose file writes and shell commands; Axiom requires explicit approval before either is applied. Without a configured key, each Agent request is saved with a clear configuration-required status.

## Validation

```bash
npm run build
npm run lint
```

## Current boundary

The browser renderer uses a deterministic preview bridge so the literature, Agent, approval, and terminal interactions can be tested without desktop permissions. The Electron build uses SQLite and live academic metadata providers. PDF download, local full-text extraction, FTS indexing, evidence-span citations, and scheduled daily feeds remain the next literature milestones.
