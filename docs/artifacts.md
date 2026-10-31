# Artifacts workbench

Artifacts is an independent workbench tab for the durable outputs produced in a
research conversation. It is separate from **Files** (the workspace browser) and
from **Changes** (the complete diff of agent writes).

## Behavior

- The tab is hidden by default. Enable it in **Settings → Workbench** or from
  the workbench `+` menu. The Settings UI does not label hidden tabs as
  "Optional"; visibility is a user preference.
- Items are scoped to the active research thread.
- Two sources are merged by workspace path, with an explicit `add_artifact`
  record winning over a change-set record:
  1. `add_artifact`: the agent registers an existing image, PDF, CSV/TSV, JSON,
     Markdown, HTML, SVG, or text output.
  2. Change sets: approved writes whose paths use one of the supported artifact
     extensions are surfaced automatically.
- Re-registering the same path creates a new version. The gallery shows the
  latest card and a `vN` marker; there is no version-history UI yet.
- A dot and badge count explicit artifacts that are unseen since the Artifacts
  tab was last opened.
- Images open a full-screen viewer with previous/next and `Open in Files`.
  Markdown, CSV/TSV, JSON, and HTML/SVG open inline previews. HTML/SVG render in
  a sandboxed iframe with scripts, network, and same-origin access disabled.
  PDFs open the Files preview.

## Data

`research_artifacts` stores one row per thread/path with `version`, `source`,
`seen`, size, modification time, and the originating turn. The table is created
by the existing schema migration. Writes are exposed through
`artifacts:list`, `artifacts:mark-seen`, `artifacts:unseen-count`, and
`artifacts:delete`.

The renderer can also merge change sets that have not been explicitly
registered; those rows are derived at read time and are not persisted.

## Agent interface

The `add_artifact` tool accepts a workspace-relative path and optional title. It
validates that the file exists, is a supported artifact type, and stays inside
the workspace, then records metadata and emits an `artifact` agent event so the
gallery can refresh. The system prompt asks the agent to use it for durable
research outputs, not routine source edits or temporary files.

## Current limitations

- No version-history browser; only the latest version is shown.
- No stale/deleted/renamed detection yet.
- Badge counts explicit records, not auto-detected change-set items.
- Large-image viewer is fit-only; no zoom or pan.
- PDF previews delegate to Files.
- Auto-detected change sets are limited to the supported extension list.
- Agent use of `add_artifact` is prompt-guided, not enforced.
- The Files surface was renamed in component/state code; legacy `artifact-*`
  CSS class names remain for compatibility with the existing editor styling.
