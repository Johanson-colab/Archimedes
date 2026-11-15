# Contributing

Read [`AGENTS.md`](./AGENTS.md) first. It defines the module layout, commands, coding style, and the evidence a pull request needs.

## Branches

- `main` — ongoing development. Keeps the full feature set.
- `release/0.1.0` — the v0.1.0 stable line. Accounts and team features are hidden here; release-only changes land on this branch.

Fix bugs on `main` and cherry-pick into `release/0.1.0` when the release needs them.

## Before a pull request

Run the checks listed in `AGENTS.md`:

```bash
npm run lint
npm run build
npm test
npm run check:theme
```

Include before/after evidence for UI changes, or explain why a screenshot is not possible. Never commit `.env.local`, API keys, `node_modules/`, `dist/`, or `release/`.

## License

By contributing you agree that your work is released under the [MIT License](./LICENSE).
