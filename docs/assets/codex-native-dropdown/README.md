# Native Codex settings dropdowns

The before and after images show the same expanded Codex settings in an isolated Electron fixture (1100 × 1050, Paper theme). The fixture uses a fixed six-effort model catalog and no personal workspace data. Both screenshots show the controls closed: the operating-system popup is rendered outside Electron's page capture.

The renderer and behavior tests verify that the effort and permission controls are both native `select` elements with the same class, that all model-supported effort options are present, and that catalog loading is bounded and retriable. A read-only check against the installed Codex CLI also returned all six efforts.
