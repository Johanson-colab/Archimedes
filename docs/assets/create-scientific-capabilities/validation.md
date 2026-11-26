# Nonvisual verification — Create capability library

Date: 2026-11-25. Tracking: #256. No renderer surface changed, so before/after UI screenshots are not applicable.

## Before

Clean branch base: the same HEAD from which `feat/create-scientific-capabilities` was created. Baseline source was extracted with `git archive HEAD` into a temporary directory, sharing only the existing node_modules directory. Running the four failing test files against this unmodified source produced 25 tests: 21 passed and the same 4 failures.

- `experiment-retry-audit.test.cjs`: temporary-directory canonical path assertion (`/var` vs `/private/var`).
- `i18n-translations.test.cjs`: existing ordering in `native.ts`.
- `latex-workspace.test.cjs`: built-in template compilation with the installed TeX environment (missing style file).
- `ui-audit-tabs.test.cjs`: existing LibraryView Tabs primitive expectation.

No baseline tests were changed or weakened. Imported upstream resources retain their original bytes (including existing whitespace); whitespace checks for authored code exclude that vendored subtree.

## After

- Focused tests: 67 passed, 0 failed. Includes resource hashes for all 788 bundled resources, bilingual retrieval, pagination, zero/one/multiple dependencies, per-App export/no overwrite, unsafe-path rejection, mode enforcement through the API tool registry, and protocol-fixture tests for actual Codex/Claude/OpenCode Create prompts.
- Full `npm test` run: 1,562 tests; 1,553 passed, 4 failed, 5 skipped. All four failures reproduced on the baseline above. The later native prompt assertions and export-mode fix passed in the focused run.
- `npm run lint`: passed.
- `npm run build`: passed; existing chunk-size warning remains.
- `npm run check:theme`: passed.
- Python syntax: all 183 bundled Python files parsed successfully; this does not establish package/runtime compatibility.
- Thirteen selected dependency-free CLI `--help` checks passed (see `cli-help.json`). These are startup checks, not scientific validation.
- Exported-resource smoke checks on Python 3.13.5: CSV profile returned mean 2 and one missing numeric value; synthetic OpenAlex abstract reconstructed exactly; manuscript linter correctly reported `UNRESOLVED_PLACEHOLDER` with exit 1. No network, global Skill installation, provider/model call or scientific package installation was used.

## Limits

No real Codex/Claude/OpenCode model call, paid database request, full scientific dependency sweep, packaged-ASAR launch or generated-page UI preview was performed. All 56 catalog entries intentionally retain `runtime: not-verified`. Existing native permission and process-lifecycle tests pass. This increment does not register generated Apps or introduce a preview sandbox.
