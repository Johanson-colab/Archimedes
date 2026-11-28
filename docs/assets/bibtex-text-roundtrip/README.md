# TeX characters in BibTeX import and export

The two captures use the real Bibliography dialog in Electron with a 1280 × 870 Paper viewport and a disposable SQLite library. Both import the same accent, caret, and tilde fixture and open its export preview.

The upstream baseline retains the accent commands as literal text and exports a raw caret and tilde. With the fix, the preview shows García and the export contains Unicode names and TeX escapes for both symbols.

[Before](before.png) · [After](after.png)

The legacy-title and URL pairs use identical Paper dialogs at 1280 × 870, before and after this follow-up. A repeat import of a previously stored TeX-accented title changes from a citation-key conflict to an optional title repair. The URL export preserves the literal tilde in the link.
