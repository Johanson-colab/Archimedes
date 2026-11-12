# Settings About logo evidence

The seven-block Paper logo is displayed above the existing product name, using
the active theme's primary text color. The transparent mask has no white/black
background tile, no shadow, and retains the original block geometry and radii.
Existing monograms elsewhere in the application are unchanged.

## UI audit

- Real renderer in Chrome, 1440 × 1000, English, Settings → About.
- Light (`paper`): `rgb(44, 40, 38)`; dark (`charcoal`): `rgb(234, 232, 230)`.
- Both masks loaded, 80 × 65 CSS pixels, decorative `aria-hidden="true"`.
- `ui-audit.json` records the actual computed styles and asset fetch results.
- Before/after pairs use the same viewport, theme, and About state. Before images
  reconstruct the previous view by removing only the added logo element from
  the live DOM; no product text or other UI is changed.
- This is renderer verification, not a packaged Electron smoke test.

## Validation (Windows, 2026-11-12)

| Command | Result |
| --- | --- |
| `npm run lint` | Pass |
| `npm run build` | Pass; existing large-chunk warning |
| `npm run check:theme` | Pass |
| `node --test electron/about-logo.test.cjs electron/ui-audit-settings.test.cjs` | 7 pass |
| `npm test`, unchanged `origin/main` (`822b182`) | 1160 tests: 1055 pass, 88 fail, 17 skipped |
| `npm test`, logo branch | 1163 tests: 1059 pass, 87 fail, 17 skipped |

All 87 failing test names on the logo branch also fail on the unchanged baseline.
The baseline additionally failed the timing-sensitive test `switching apps retains
sort/search and closes menus and preview scroll locks`, which passed on the logo
branch. No tests were modified or weakened to mask these failures.
