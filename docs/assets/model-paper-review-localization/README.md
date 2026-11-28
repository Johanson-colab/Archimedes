# Paper review error localization

Matched macOS Electron captures use the Paper theme, Chinese interface, a 1280 × 900 CSS viewport, and the same credential-free `PaperReviewView` fixture. The Retina PNGs are 2560 × 1736 pixels.

- `paper-review-error-before.png`: the provider error remains English in the Chinese interface.
- `paper-review-error-after.png`: the same error renders as `评审失败`.

The fixture uses the real component and Electron shell. It does not read user data or contact the network.

Reproduce with:

```bash
node scripts/capture-paper-review-error.mjs before
node scripts/capture-paper-review-error.mjs after
```

The JSON files record the rendered error, overflow check, and console errors for each capture.

Focused model, FigureForge, speech, and Paper review suites passed 67/67. Final validation also passed `npm run lint`, `npm run build`, `npm run check:theme`, and the full macOS suite: 1,689 passed, 0 failed, 6 skipped (1,695 total).
