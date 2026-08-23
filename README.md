# Archimedes

Archimedes is a local-first AI-for-Research agent that brings research conversations, literature, workspace tools, experiments, and scientific writing into one desktop application.

The current implementation includes:

- persistent multi-turn Research Chat with resumable threads;
- streaming model responses and auditable tool-call events;
- approval-gated workspace writes and shell commands;
- persistent literature libraries with search, import, reading state, and notes;
- daily arXiv paper discovery and keyword search;
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

## Validation

```bash
npm run lint
npm run build
```

## Current boundary

The Agent currently provides persistent threads, streaming responses, bounded conversation context, tool execution records, and approval-aware continuation. Project memory, semantic retrieval over full-text papers, dynamic MCP discovery, and background research jobs are planned as later harness layers.
