# Illustrated paper reading

Library → Interactive paper now uses the upgraded reading workflow, bundled as **`paper-deep-reading`**. The former specialist-card orchestration has been replaced; existing saved text readings and Presentation output remain accessible.

## Use

1. Restart the Electron app after updating (`npm run dev`). Renderer hot reload alone cannot load the new preload/IPC methods.
2. Open a Library paper and prepare or attach its original PDF.
3. Open Interactive paper and choose **Generate reading**. For an existing text reading, choose **Read again** to create the new version.
4. Read the bilingual document, navigate its two-level contents, enlarge original figures, step through mechanisms, or jump to cited PDF pages.
5. Choose **Export reading** to save a standalone HTML, Chinese/English Markdown, report JSON, and the referenced image assets in a new directory.

Generation currently uses the configured **API model** in Settings → Models. Figure inspection requires image-input support. It does not invoke an installed Codex/Claude/OpenCode CLI. Scanned PDFs need a usable OCR text layer.

## Pipeline and persistence

The desktop runtime parses the cached PDF, inventories figure/table captions, plans seven chapters, visually crops selected originals, writes bilingual chapters, audits evidence, and validates the complete document before replacing its saved reading. Chapters are Overview, Related work, Method, Experiments, Limitations, Discussion, and References.

Models supply typed content rather than executable HTML. Trusted rendering provides formulas, figures, comparison tables and structured mechanism diagrams. Exported documents retain page references and uncertainty notes. Model-generated claims still require scholarly review; structural validation does not establish scientific correctness.

Calls and page rendering run sequentially. Cancellation removes incomplete staging output and preserves the prior report. Generation artifacts live under the current data workspace's `.archimedes/paper-deep-reading/<run-id>/`; explicit exports go to the directory the user chooses. Saved reports reopen without regenerating; changed source PDFs trigger a warning.

## Verification

TypeScript, production build and theme checks pass. The focused reading/presentation suite passes (21 tests); scoped-annotation checks also passed. The full suite records 1,134 passes, four skips and six existing environment failures: three macOS temporary Git-path checks and three Windows-shell checks on macOS. Real PDF extraction/cropping is exercised with controlled provider responses; a live paid-provider generation was not run.

Browser checks cover the actual workbench, in-document navigation, figure enlargement, bilingual mechanism state, host themes, and a 390px layout without page overflow. Screenshots use public-paper fixture content, not private Library data.

## Visual evidence

The first pair uses the same 1440px viewport and light theme.

Before:

![Previous text reading](assets/paper-deep-reading/before-light.png)

After:

![Illustrated reading](assets/paper-deep-reading/after-light.png)

![Method and original evidence](assets/paper-deep-reading/after-method-light.png)

![Method in dark theme](assets/paper-deep-reading/after-method-dark.png)

![Mobile reading](assets/paper-deep-reading/after-mobile.png)
