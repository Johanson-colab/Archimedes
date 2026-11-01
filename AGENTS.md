# Repository Guidelines

## Project Structure & Module Organization

`src/` contains the React/TypeScript renderer and `src/i18n/translations/`. `electron/` contains the desktop process, preload, agent, and tests. `server/` implements collaboration APIs; `shared/` holds shared code. Assets live in `public/` and `electron/assets/`; documentation and PR evidence live in `docs/` and `docs/assets/`. Scripts are in `scripts/`.

## Build, Test, and Development Commands

- `npm install` installs dependencies and rebuilds the native `node-pty` module.
- `npm run dev` starts Vite and the Electron desktop app; `npm run dev:renderer` starts only Vite.
- `npm run lint` runs TypeScript project checks; `npm run build` checks types and builds the renderer.
- `npm test` runs Node tests and theme checks; `npm run server:test` runs server tests only.
- `npm run check:theme` verifies theme tokens and the hardcoded-color baseline.

## Coding Style & Naming Conventions

Use two-space indentation, TypeScript/TSX for renderer components, and `.cjs` for CommonJS desktop modules. Name components in PascalCase (for example, `LibraryView.tsx`) and supporting modules in kebab-case. Reuse `Dialog`, `Menu`, `Tabs`, `SettingsPrimitives`, `StateView`, and theme tokens; avoid custom replacements and hardcoded colors. Add user-facing strings to the appropriate translation shard, with English keys and Chinese values, alphabetically sorted. `npm run lint` checks types; it is not a formatter.

## Testing Guidelines

Use Node's test runner and name tests `*.test.cjs`; upstream FigureForge tests use `figure-forge-upstream-*.mjs`. Run focused tests with `node --test electron/agent-complete.test.cjs`. Add behavior tests and practical UI audits. Before a PR, run lint, test, build, and theme checks above. Report actual results: three Windows-shell tests may fail on macOS; do not weaken them.

## Commit & Pull Request Guidelines

Use focused commits with conventional-style messages, such as `feat(canvas): add paper notes`. Branch from `main`; never push directly to `main` or force-push shared branches. Before implementation, obtain an issue and written core-team approval for UI modules/workflows, data models, APIs, auth, permissions, collaboration, storage, UI refactors across three or more surfaces, dependencies, services, or build/release changes. Link both in the PR.

Describe the change, tests and results, known failures, and unfinished work. For each changed UI surface, commit a before/after screenshot pair using the same viewport, theme, and state under `docs/assets/<feature>/` and embed it in the PR. For nonvisual changes, provide before/after test output, logs, or benchmarks. Explain if screenshots are genuinely impossible.

## Security & Configuration

Use `.env.example` as a configuration reference. Never commit `.env.local`, API keys, `node_modules/`, `dist/`, or generated build output. Preserve unrelated work and ask before destructive operations.
