# Settings information architecture

Verified on Windows against `main` commit `bc12ac0` with the real Electron 43.4.1 renderer. The fixture mounts the actual `SettingsModal` and its panels with credential-free data at 1180 × 900, English locale, no animations, and the same paper/charcoal themes. HTTP(S) requests were blocked.

## Structure

The flat 14-item list becomes 10 durable modules in three groups:

- **Personal**: General (includes About), Appearance, Account
- **Research**: Workbench, Research aids, Models, Research Apps, Workspace
- **Connections**: Web search, SSH servers

Journey, Terminal, and project Members no longer occupy top-level entries. Existing deep links still work through aliases:

| Legacy entry | New location |
| --- | --- |
| `journey` | Workbench → Research path |
| `terminal` | Workbench → Terminal |
| `proactive` | Research aids → Proactive agent |
| `members` | Workspace → Members |
| `about` | General → About |

Workbench now owns **Layout**, **Terminal**, and **Research path**. Research aids owns **Proactive agent**, **Comments**, and **Snapshots**. Workspace owns **Folder** and **Members**.

## Conversation tools

Comments and Snapshots now have real preferences instead of being toolbar-only actions:

- Show/hide the comments button, and open with resolved comments visible.
- Show/hide the snapshot button.
- Default snapshot format (Markdown / JSON / long PNG), sources, and diagnostic events.

Preferences persist under `archimedes-session-tools-v1` and are applied to the conversation toolbar, the comments panel, and new snapshot exports.

## Navigation

| Theme | Before | After |
| --- | --- | --- |
| Paper | ![Before](paper-general-before.png) | ![After](paper-general-after.png) |
| Charcoal | ![Before](charcoal-general-before.png) | ![After](charcoal-general-after.png) |

Measured navigation: **14 → 10** items, **0 → 3** group labels, no horizontal or body overflow at either theme.

## Workbench

| Surface | Before | After |
| --- | --- | --- |
| Research path | ![Before](charcoal-research-path-before.png) | ![After](charcoal-research-path-after.png) |
| Terminal | ![Before](charcoal-terminal-before.png) | ![After](charcoal-terminal-after.png) |

The after view exposes an in-page tab strip (`Layout / Terminal / Research path`) while the embedded terminal keeps its save actions and the Journey panel keeps every existing control.

## Research aids

Proactive remains the first tab; Comments and Snapshots are no longer standalone top-level pages.

| Surface | Before | After |
| --- | --- | --- |
| Proactive agent | ![Before](charcoal-proactive-before.png) | ![After](charcoal-proactive-after.png) |
| Comments | — | ![After](charcoal-comments-after.png) |
| Snapshots | — | ![After](charcoal-snapshots-after.png) |

## Model and harness marks

Brand marks are rendered directly on the surrounding surface. The white tiles and the redundant Custom icon are removed, and single-color SVGs invert only on charcoal so they remain visible.

| Surface | Before | After |
| --- | --- | --- |
| Providers / Custom | ![Before](charcoal-models-custom-before.png) | ![After](charcoal-models-custom-after.png) |
| Harnesses | ![Before](charcoal-models-harnesses-before.png) | ![After](charcoal-models-harnesses-after.png) |

Computed backgrounds for provider and harness icon containers: `rgb(255, 255, 255)` / `rgb(232, 240, 235)` before, `rgba(0, 0, 0, 0)` after, in both themes. `Custom` has no icon node after the change.

## Validation

- `npm run lint`, `npm run build`, and `npm run check:theme` pass.
- New `settings-information-architecture` suite: **7 pass**.
- Focused settings/Journey/Proactive/Comments/Snapshot/Workbench suite: **57 pass, 1 pre-existing failure** (`library.ts` translation ordering, also fails on unchanged `bc12ac0`).
- Full `npm test` with the same dependency tree:

| Source | Tests | Passed | Failed | Skipped |
| --- | ---: | ---: | ---: | ---: |
| Unchanged `bc12ac0` | 1237 | 1130 | 89 | 18 |
| This branch | 1244 | 1137 | 89 | 18 |

No new failing test names; all 89 failures are shared with the unchanged baseline.

The machine-readable render observations are in `before-observations.json` and `after-observations.json`. The capture script is `scripts/capture-settings-ia.mjs`; it uses a temporary profile and an isolated hidden Electron window.
