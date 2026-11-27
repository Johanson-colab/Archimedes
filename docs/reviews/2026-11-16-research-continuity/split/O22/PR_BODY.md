Home, command-palette, proactive and paper-source actions now enable the chosen Research App before opening its view. A failed preference save keeps the current page and shows a retryable error. FigureForge and chat expose a model-configuration route when an API model is missing. The published-chart gallery is named **Paper chart references**, appears with evidence resources, and remains searchable by its old name; saved module IDs and visibility preferences stay stable.

Split from https://github.com/Johanson-colab/Archimedes/pull/336 following the maintainer's request; base: upstream `main` at `1f4b375`.

Validation: 24 focused entry-route and adjacent settings/gallery/welcome checks pass; lint, build and theme checks pass. Standard `npm test`: 1,273 tests, 1,259 pass, 7 fail, 7 skip. The unchanged base has the same seven failures: three canonical Git/worktree checks, three Windows shell path fixtures on macOS and the library translation ordering check. Final copy/layout adjustments were rechecked with focused checks, lint/build and the renderer.

The actual 1440×1000 charcoal/English preview journeys opened Reproduce from home, Available extensions from the palette, Settings → Models from Configure model, and chart references from FigureForge. The pairs use matching initial preferences and input state. The chart pair shows entry naming while the remote catalogue loads.

| Before | After |
| --- | --- |
| ![Home route before](https://raw.githubusercontent.com/feiiiiii5/Archimedes/6ade07bf9c25d4c5dba806b2c594703f505b4a64/docs/assets/research-app-entry/home-before.png) | ![Reproduce route after](https://raw.githubusercontent.com/feiiiiii5/Archimedes/6ade07bf9c25d4c5dba806b2c594703f505b4a64/docs/assets/research-app-entry/home-after.png) |
| ![Figure setup before](https://raw.githubusercontent.com/feiiiiii5/Archimedes/6ade07bf9c25d4c5dba806b2c594703f505b4a64/docs/assets/research-app-entry/configure-before.png) | ![Model setup route after](https://raw.githubusercontent.com/feiiiiii5/Archimedes/6ade07bf9c25d4c5dba806b2c594703f505b4a64/docs/assets/research-app-entry/configure-after.png) |
| ![Chart references before](https://raw.githubusercontent.com/feiiiiii5/Archimedes/6ade07bf9c25d4c5dba806b2c594703f505b4a64/docs/assets/research-app-entry/references-before.png) | ![Chart references after](https://raw.githubusercontent.com/feiiiiii5/Archimedes/6ade07bf9c25d4c5dba806b2c594703f505b4a64/docs/assets/research-app-entry/references-after.png) |
