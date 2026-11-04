# Harness settings layout

Follow-up to [#239](https://github.com/Johanson-colab/Archimedes/issues/239), based on `157287d`. The owner requested vertically stacked Harness cards and readable permission guidance in Codex chat; the existing authorization to develop and push main applies.

## Changes

- Replace the horizontal selector and single card with three vertically stacked accordion cards: Codex, Claude Code, OpenCode. Cards start collapsed; opening a card does not change the active backend.
- Preserve independent drafts, connection status and model catalogs while switching cards. Native checks remain explicit and never run on mount.
- Replace the non-editable “Native permissions / Ask for approval” row with full-width guidance explaining that each CLI's permissions apply and approval requests can be answered in the conversation.
- Give Claude Code its own model description instead of showing OpenCode's `provider/model` format.

The original permission row was a flex row inside a two-column grid. Its control had `width: 100%`, shrinking the copy to zero layout width and forcing text into narrow word-by-word overflow. Static guidance now occupies its own full-width block.

## Visual and geometry evidence

Credential-free fixtures render the real React settings component in Electron, using Paper and Charcoal themes at 1100 × 960 and 680 × 960. No native CLI, credentials or user chats are loaded.

| State | Paper before / after | Charcoal before / after |
| --- | --- | --- |
| Collapsed list | [Before](paper-collapsed-before.png) / [After](paper-collapsed-after.png) | [Before](charcoal-collapsed-before.png) / [After](charcoal-collapsed-after.png) |
| Claude Code | [Before](paper-claude-before.png) / [After](paper-claude-after.png) | [Before](charcoal-claude-before.png) / [After](charcoal-claude-after.png) |
| OpenCode | [Before](paper-opencode-before.png) / [After](paper-opencode-after.png) | [Before](charcoal-opencode-before.png) / [After](charcoal-opencode-after.png) |

At 1100px, native guidance changed from 0px layout width / 17 lines to 834px / one line. At 680px, it occupies 588px / two lines. All 12 after-state geometry cases pass, including three aligned vertical cards and no horizontal document overflow. See `before-geometry.json` and `after-geometry.json`.

Reproduce with `node --max-old-space-size=512 scripts/capture-harness-settings.mjs before` or `after`, then run the printed Electron runner separately to release the build heap first. Capture process-tree peaks were 574 MiB before and 627 MiB after, under a 700 MiB watchdog.

## Behavior checks

Settings tests cover accordion expansion without activation, preserved drafts/status/catalogs, explicit checks and activation, errors and API reset, keyboard tab behavior, and bounded repeated mounts/StrictMode. They also verify that the native permission text is ordinary copy and that Claude fields no longer show OpenCode-specific instructions.

- Focused settings, translation and assertion-safety checks: 19 passed.
- TypeScript lint, production build and theme checks passed. Existing bundle-size warnings remain.
- Full serial suite: 959 tests, 948 passed, 4 skipped, 7 existing failures. Node used a 256 MiB heap and a 700 MiB process-tree watchdog; observed peak was 592.4 MiB.
- Existing failures: three Windows-shell checks on macOS; three Benchmark Radar tests affected by the adjacent local checkout; and the shared-confirm audit finding `window.confirm` in `PaperReviewView.tsx`. The latter file is identical to remote main `157287d`, where the native confirmation is already present. These modules and tests were not changed or weakened by this layout fix.
