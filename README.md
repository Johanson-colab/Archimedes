# Axiom

Axiom is a local-first desktop research IDE. The first slice brings the main research loop into one interface:

- an evidence ledger connecting research claims to papers and evidence spans;
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

When a workspace is opened, Axiom creates `.axiom/axiom.db` inside that folder. It stores Agent task runs and approved command history locally; the directory is ignored by Git. For this development checkout, `.env.local` selects the surrounding `AI Research` directory without committing that personal path.

## Validation

```bash
npm run build
npm run lint
```

## Current boundary

This is the first local UI and execution slice, deliberately before persistent storage and a real model provider. The Agent panel uses a deterministic demo response so the evidence, approval, and terminal interaction can be tested without an API key. The next implementation milestones are SQLite artifact storage, a model adapter, Semantic Scholar search, and structured task-run traces.
