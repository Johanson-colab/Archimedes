# PDF.js root layout stability

PDF.js TextLayer creates `.hiddenCanvasElement` font-measuring canvases directly under `document.body`. Archimedes had copied text-layer styling without the PDF.js viewer rule that hides these canvases. Even after a measuring canvas is reset to zero pixels, its inline line box adds document height. The resulting root scrollbar narrows every Research App by 10px and restarts PDF fit-to-width rendering. Repeated font measurements and cleanup can therefore keep the whole window moving, including while a paper reader remains cached behind another app.

The fix restores PDF.js's `.hiddenCanvasElement` rule in the globally loaded stylesheet. It does not hide the visible paper canvas or disable page scrolling, PDF selection, highlighting, or resizing.

`before.png` and `after.png` show the same 1200px-wide paper-themed Chromium fixture with a cached zero-sized measuring canvas. `measurements-before.json` records width changing between 1200px and 1190px and root height exceeding the viewport; after the fix the width remains 1200px and the document fits the viewport across repeated 150px, 100px, and zero-sized font measurements and cleanup. The fixture uses generic content, not user records.

Run the real Electron regression on a desktop session:

```sh
ARCHIMEDES_RUN_ELECTRON_LAYOUT_TESTS=1 node --test electron/pdf-root-layout.test.cjs
```

The test is opt-in so ordinary headless Node CI does not require a graphical desktop.

Validation:

- Nine focused scrollbar/PDF layout tests passed, including the real Electron regression. The regression fails with the original stylesheet.
- Type checks, theme checks and both macOS DMG builds passed.
- With an isolated local copy of a real paper workspace, the packaged arm64 renderer maintained a constant 1440px application width during PDF reading and switches to Image creation, Paper to Slides and back to Library. `app-switch-measurements.json` contains only geometry; no copied user database or private conversation is included.
- Full suite: 1,263 passed, 5 failed, 6 skipped. Remaining failures are the previously reported translation ordering, missing local TeX font and three Windows-shell tests on macOS. Git tests pass with a physical macOS temporary directory.
- These UI checks use Electron 43.4.1 on an arm64 Mac. They do not constitute an Intel hardware startup validation.
