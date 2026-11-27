# Project research index handoff

Implementation frozen for integration review on 2026-11-16; no commit/push.

## Feature files

- `src/project-research.ts`: shared stable object locators, view/bridge types, filtering and status labels.
- `src/ProjectResearchView.tsx`, `src/project-research.css`: current-project overview, source reopening, search/type filters, editable conclusions/questions with evidence. Conversations and ordinary artifacts are secondary filter entries. Notes move above the list at narrow widths.
- `src/i18n/translations/projectResearch.ts`: English/Chinese strings.
- `electron/project-research.cjs`: live adapters over existing domain records plus the small project-owned `project_research_notes` table. Sources are not copied into an index domain model.
- `electron/project-research-commands.cjs`: list/save/delete IPC registration.
- `docs/project-research.md`: public usage documentation.

## Source reopening and transfer edits

- `src/LibraryView.tsx`, `src/LibraryWorkspace.tsx`: optional paper/library/token/review request opens the original paper and requested reading surface.
- `src/PaperReviewView.tsx`: optional run/token request loads the exact existing review.
- `src/ReproduceView.tsx`: optional run/token request loads and expands the exact recorded run; its reproduction ownership is checked.
- `electron/project-transfer.cjs`: notes and evidence refs use existing project-package ID/root remapping. Separate milestone blocks reuse writing-history export/import helpers and existing package blob storage; failed imports remove only their new version registrations.
- `src/project-transfer.ts`, `src/ProjectTransferDialog.tsx`: named-version package selection and note/version counts. Milestone portions belong with the writing-history feature when splitting PRs; note portions belong with the index feature.

The integration agent owns `App.tsx`, project sidebar/navigation, store facades/schema call, main/preload/types and translation imports. The backend accepts `listManuscriptVersions` and `listManuscriptVersionOwners` callbacks; main passes the writing-history helpers. Stored DB ownership is used for normal objects. The writing-history owner registry lets a standalone old-root manuscript remain discoverable without inventing a conversation.

## Verification

- `electron/project-research.test.cjs`: five real-store/SQLite/preload/IPC/package journeys. Covers save/edit/reopen, project isolation, removed evidence, full ID/root remapping, and a standalone named manuscript after the default folder changes.
- `electron/project-research-ui.test.cjs`: actual view behavior with a real store behind its bridge; adds a linked conclusion, reopens it, follows the original locator, edits it into a question, filters sessions, and switches projects.
- `electron/library-workspace.test.cjs`: added normal index request to a paper in an initially unloaded folder.
- `electron/reproduction-owner-view.test.cjs`: added externally requested run disclosure to the existing actual component test.
- `npm run lint`, `npm run check:theme`, `git diff --check`: passed at this handoff.
- Current combined focused log: `project-index-focused.log`. The 34 checks have 33 passes; the only failure is the newly integrated writing translation imports missing the existing `...Strings` aliases. The integration agent was notified and owns that correction. Index/store/component/transfer/source checks passed. A previous direct index+transfer run passed 21/21. Do not claim the combined run passed until the alias correction is checked.

## Native work still with the writing agent

The writing agent is the sole native UI operator. Existing project/writing before captures are in `docs/assets/research-continuity/`. `seed-project-index.cjs` in this local review folder seeds only the isolated research-continuity fixture with actual project papers/analysis/run and editable notes. Native after capture and clicks through paper, analysis, recorded run and named version remain for that operator. A new overview has no old equivalent; document the original project-entry comparison and any fixture-data differences honestly.
