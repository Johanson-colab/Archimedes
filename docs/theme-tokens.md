# Theme tokens

This document is the working map for the appearance customization work in
[#148](https://github.com/Johanson-colab/Archimedes/issues/148). It describes
where theme values live, how they resolve, and how to migrate a hardcoded color
without changing the rendered interface.

## Why this exists

Before this pass the theme was split across five `:root` blocks, a separate
paper block, and a duplicate set of `--night-*` values in `typography.css`.
`src/styles.css` contained 3,820 hardcoded hex colors and 838 lines of
`.theme-paper` overrides. Adding a single customization knob would have meant
editing every one of those surfaces.

The refactor moves all theme tokens into one file and makes the legacy names
resolve to semantic tokens. Rules keep working unchanged while they migrate.

## File ownership

| File | Owns |
| --- | --- |
| `src/tokens.css` | Primitive ramps, semantic tokens, component tokens, fonts, theme overrides |
| `src/styles.css` | Layout and component rules; no theme token declarations |
| `src/typography.css` | Type scale rules; no theme token declarations |
| `src/main.tsx` | Import order: `tokens.css` → `styles.css` → `typography.css` |

`tokens.css` is imported first on purpose. It is the single source of truth; the
guard script fails if it moves after `styles.css`.

## Layers

### 1. Primitives

Raw ramps. They describe color, not meaning, and are only used by semantic
tokens in the same file.

- `--graphite-950 … --graphite-50`: charcoal neutral ramp
- `--paper-50 … --paper-900`: paper neutral ramp
- `--amber-400 … --amber-800`: accent ramp
- `--state-success`, `--state-warning`, `--state-danger`, `--state-info`

### 2. Semantic tokens

The names components should use. They exist in both themes.

| Token | Charcoal | Paper |
| --- | --- | --- |
| `--surface-ground` | `--graphite-950` | `--paper-50` |
| `--surface-canvas` | `#1b1b1b` | `--paper-150` |
| `--surface-sidebar` | `--graphite-900` | `--paper-100` |
| `--surface-panel` | `--graphite-850` | `--paper-200` |
| `--surface-raised` | `--graphite-800` | `--paper-250` |
| `--surface-soft` | `--graphite-750` | `--paper-300` |
| `--surface-control` | `#262626` | `#f0ede8` |
| `--surface-control-active` | `#363636` | `#e4dfd8` |
| `--border-default` | `--graphite-550` | `--paper-400` |
| `--border-soft` | `--graphite-600` | `--paper-350` |
| `--border-strong` | `--graphite-400` | `--paper-500` |
| `--text-primary` | `--graphite-50` | `--paper-900` |
| `--text-secondary` | `--graphite-100` | `--paper-800` |
| `--text-muted` | `--graphite-200` | `--paper-700` |
| `--text-faint` | `--graphite-300` | `--paper-600` |
| `--text-on-accent` | `#111111` | `#ffffff` |
| `--accent` | `--amber-500` | `--amber-700` |
| `--accent-hover` | `--amber-400` | `--amber-800` |
| `--accent-subtle` | `#a6a6a6` | `#57534e` |
| `--accent-strong` | `#d6d6d6` | `#24211e` |
| `--focus-ring` | `--amber-500` | `--amber-700` |
| `--resizer-accent` | `--amber-600` | `--amber-700` |
| `--selected` | `--surface-control-active` | `#e8e4de` |
| `--selected-row` | `#2a2a2a` | `#ece5d8` |

State colors are shared by both themes. They intentionally do not change with
the surface theme.

### 3. Component tokens

Some palettes intentionally differ from the semantic surface palette and stay
explicit until the design unifies them:

- `--mono-*`: the graphite sidebar/mono palette; paper values are warmer and
  slightly different from `--surface-*`
- `--rail-*`: Files and Trajectory rows
- `--file-tone-*`: file-tree icon palette; the base values live in
  `tokens.css`, per icon-style overrides stay in `styles.css` behind
  `data-file-icons`
- `--chat-send-*`: composer send control
- `--code-*`: syntax highlighting
- `--scrollbar-*`, `--turn-rail-*`

These are still theme-aware and live in `tokens.css`. They are candidates for
the next consolidation pass, but merging them now would change pixels.

## Legacy aliases

Existing rules use `--night-*` in roughly a thousand places. Rather than
rewriting everything at once, the old names are aliases:

```css
--night-ground: var(--surface-ground);
--night-panel: var(--surface-panel);
--night-ink: var(--text-primary);
```

Direction matters: the alias points **to** the semantic token. A future theme
pack overrides `--surface-*`, and every `--night-*` consumer follows
automatically. Do not add new `--night-*` declarations.

The complete alias list:

`--night-ground`, `--workbench-ground`, `--night-sidebar`, `--night-panel`,
`--night-panel-raised`, `--night-panel-soft`, `--night-line`,
`--night-line-soft`, `--night-ink`, `--night-ink-soft`, `--night-muted`,
`--night-faint`, `--night-accent`, `--night-accent-strong`,
`--night-success`, `--night-warning`, `--night-danger`, `--night-blue`,
`--accent-ink`.

## Theme resolution

```
:root primitives + semantic (charcoal)
  → :root[data-theme="paper"] primitives + semantic
  → component/scoped tokens
  → rules consume semantic or legacy names
```

The app sets `document.documentElement.dataset.theme` and the `.theme-paper`
class. Semantic tokens respond to `data-theme`; a few component tokens still
use `.theme-paper` because they predate the token pass.

## Migration status

Done in this pass:

- all `:root`, paper, `--mono-*`, `--rail-*`, base `--file-tone-*`,
  `--chat-send-*`, code, scrollbar, turn-rail and UI-scale declarations moved
  to `src/tokens.css`
- duplicate `--night-*` and font tokens removed from `typography.css`
- legacy `--night-*` aliases introduced
- semantic surface / border / text / accent / state layer added
- 142 theme-scoped colors replaced by semantic tokens with
  `scripts/codemod-theme-colors.mjs`
- 98 scoped palette declarations (`--review-*`, `--welcome-*`, `--reading-*`,
  `--presentation-*`, `--sb-*`, `--work-*`, `--context-usage-color`) moved from
  `styles.css` into component scopes in `tokens.css`
- visual baseline: 6 screenshots (chat, Library, Appearance × charcoal, paper)
  pixel-diff **0**

Still to migrate:

| Item | Count |
| --- | --- |
| Hardcoded colors in `styles.css` | 3,745 |
| Hardcoded colors in `typography.css` | 11 |
| Theme token declarations in `styles.css` | 0 |
| PDF runtime and file-icon declarations in `styles.css` | 50 |
| `.theme-paper` / dark override lines | ~930 |

The counts are a ratchet. They may go down, never up. See
`scripts/theme-baseline.json`.

## Playbook

### Use a token

```css
/* before */
.panel { background: #211e1c; color: #eae8e6; border-color: #3a332f; }

/* after */
.panel {
  background: var(--surface-panel);
  color: var(--text-primary);
  border-color: var(--border-default);
}
```

### Add a token

1. Add the primitive ramp value in both themes if it differs.
2. Add the semantic name to both `:root` and `:root[data-theme="paper"]`.
3. Add it to the required list in `scripts/check-theme-tokens.mjs`.
4. Document it in the table above.

### Migrate a hardcoded color

1. Find the closest semantic token; if none fits, the color is component debt.
2. Prefer the codemod for theme-scoped rules:

   ```bash
   npm run codemod:theme          # dry run
   npm run codemod:theme -- --list
   npm run codemod:theme -- --write
   ```

3. Run `npm run check:theme`, then compare the surface before/after.
4. Lower `scripts/theme-baseline.json` by the number of colors removed.

### Theme-specific override

Prefer overriding a semantic token under `:root[data-theme="paper"]`. Do not add
new `.theme-paper .component { color: … }` rules; those are what the migration
is removing.

## Commands

```bash
npm run audit:theme      # inventory + most repeated colors
npm run check:theme      # CI guard (also runs at the end of npm test)
npm run lint
npm run build
```

## Next milestones

1. **M1b — remaining codemod batches.** The theme-scoped rules are migrated;
   the remaining debt is mostly base rules whose value intentionally differs
   between Charcoal and Paper (`#fff`, `#252422`, light knowledge-module
   surfaces). Those need new semantic tokens or component tokens before they
   can move, rather than a mechanical replacement.
2. **M2 — ThemePack v1.** Introduce `appearance` settings, a provider that
   writes semantic tokens, and make Charcoal/Paper the first two packs.
3. **M3 — Appearance editor.** Curated controls + live preview + reset.
4. **M4 — Import/export.** Theme pack validation, contrast guard, advanced JSON.

The guard script and this document should be updated in the same PR as each
milestone.


