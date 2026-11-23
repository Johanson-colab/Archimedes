# Changelog

## 0.1.0 — 2026-11-15

First public build. Local-first research workspace for Windows and macOS.

### Included

- **Research chat and agents** — OpenAI-compatible model backends plus native Codex, Claude Code, and OpenCode harnesses. Tool calls, file writes and shell commands pause for approval.
- **Library and PDF reading** — project libraries, PDF reader with search, highlights, notes, translation, figure capture, and source-grounded paper chat.
- **Daily papers** — recent papers from arXiv and Hugging Face, with conference discovery.
- **Paper writing** — LaTeX project tree, templates, multi-file editing, managed Tectonic compilation, diagnostics, and source search.
- **Data analysis** — local CSV/TSV profiling, statistics, charts, and SVG export. Session-only by design.
- **Workbench** — trajectory, files, changes, notes, terminal, and artifacts.
- **Canvas** — paper figure and quote boards saved per workspace.
- **Session tools** — comments and snapshot export (Markdown, JSON, PNG).

### Beta, off by default

These can be enabled in **Settings → Research Apps**:

- Image creation (FigureForge) — reference gallery and CLIP weights load from an external host.
- Data charts — a browsable gallery of published figures, not local analysis.
- Paper to Slides — requires a MinerU API token and uploads the PDF for parsing.
- Reproduce — runbooks and evidence collection; numeric comparison is not implemented yet.

### Not included in 0.1.0

Accounts, cloud sync, guest links, and team collaboration are not available. Their entry points are hidden in this build.

### Platforms

- Windows 10/11 x64 (NSIS installer).
- macOS Apple Silicon and Intel (DMG, one per architecture).

Builds are unsigned. Windows shows a SmartScreen warning; macOS requires right-click → Open on first launch.

### Known limitations

- The first LaTeX compile downloads TeX packages and needs network access.
- There is no auto-update channel; new versions must be downloaded manually.
- Presentation preview requires LibreOffice on the machine.
- Data analysis keeps files only for the current session.
- Figure galleries and the FigureForge reference index depend on external hosts.
