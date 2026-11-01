# AGENTS.md

Read this before changing code or opening a PR. Keep changes small and evidence-based.

## 1. Large changes need an approved issue first

Open an issue, discuss it with the core team, and get explicit written approval **before implementation** when the change:

- adds or redesigns a user-facing module, tab, or workflow;
- touches data models, APIs, auth, permissions, collaboration, or storage;
- is a cross-cutting UI refactor across 3+ surfaces/components;
- adds a dependency, service, or build/release change.

Link the issue and the approval comment in the PR. Small fixes can go directly to a PR.

## 2. Every change needs before/after evidence

- **UI/visual:** one before/after screenshot pair for every changed surface. Use the same viewport, theme, and state; crop or annotate the changed area. Commit images under `docs/assets/<feature>/` and embed them in the PR body.
- **Behavior/non-visual:** before/after test output, logs, or benchmark.
- If a screenshot is genuinely impossible, explain why in the PR.

## 3. Test before opening the PR

Run:

```bash
npm run lint
npm test
npm run build
npm run check:theme
```

Add or update tests for behavior changes. UI changes need an audit test where practical. Report failures honestly; never claim a command passed if it was not run. On macOS, the three Windows-shell tests may fail; list them as pre-existing instead of skipping or weakening assertions.

## 4. Keep the diff focused

- One concern per PR; no drive-by refactors or formatting churn.
- Branch from `main`. Do not push to `main` or force-push shared branches.
- Reuse existing primitives and tokens (`Dialog`, `Menu`, `Tabs`, `SettingsPrimitives`, `StateView`); do not hand-roll menus/dialogs or hardcode colors.
- Add new user-facing strings to the shard under `src/i18n/translations/` that matches the surface, in both `en` (the key) and `zh` (the value), and keep that file alphabetically sorted.
- Never commit `node_modules`, `dist`, `.env.local`, API keys, or generated build output.

## 5. PR checklist

- [ ] Issue linked; approval linked for large changes
- [ ] Summary: what changed and why
- [ ] Commands run and results
- [ ] Before/after images or evidence
- [ ] Tests added or updated
- [ ] Known failures and not-done items

Write short, specific PRs and commit messages. Ask when blocked; never guess destructive operations.
