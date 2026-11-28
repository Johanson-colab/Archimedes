# Writing source-conflict recovery

Matched macOS Electron captures use the Paper theme, English interface, a 1440 × 920 CSS viewport, and the same in-memory manuscript fixture. The Retina PNGs are 2880 × 1776 pixels.

- `conflict-before.png`: an external edit rejects autosave while the local draft remains open; no recovery action is available.
- `conflict-after.png`: the same conflict exposes **Keep my draft**.
- `conflict-recovered-after.png`: after the explicit recovery action, the local draft is saved and the conflict clears.

The fixture uses the real `PaperWritingView` and Electron shell with a credential-free bridge. It does not read user data or contact the network.

Reproduce with:

```bash
node scripts/capture-paper-writing-conflict.mjs before
node scripts/capture-paper-writing-conflict.mjs after
```

`before.log` records the two new regressions failing on the pre-fix branch (29/31 passing). `after.log` records both passing (31/31). `focused.log` includes the Writing behavior and current UI audits (66/66). The JSON files record the checked draft, disk, recovery-action, overflow, and console-error state for each capture.

Final validation also passed `npm run lint`, `npm run build`, `npm run check:theme`, and the full macOS suite: 1,704 passed, 0 failed, 6 skipped (1,710 total).
