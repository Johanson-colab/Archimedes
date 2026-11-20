# TeX characters in BibTeX import and export

The two captures use the real Bibliography dialog in Electron with a 1280 × 870 Paper viewport and a disposable SQLite library. Both import the same accent, caret, and tilde fixture and open its export preview.

The upstream baseline retains the accent commands as literal text and exports a raw caret and tilde. With the fix, the preview shows García and the export contains Unicode names and TeX escapes for both symbols.

[Before](before.png) · [After](after.png)
