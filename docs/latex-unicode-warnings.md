# Unicode symbols in legacy-font LaTeX projects

A successful PDF build can still report missing-glyph warnings. With Tectonic's
XeTeX engine and legacy Times/T1 fonts, direct Unicode punctuation may not map to
the font's eight-bit character slots. A small real-engine fixture reproduced
missing U+2020, U+2011, U+2014, U+2019 and U+2013 while still producing a PDF.

For a document using that legacy-font setup, this tested preamble compatibility
mapping eliminated those five missing-character warnings without replacing the
conference's font configuration:

```latex
\usepackage{newunicodechar}
\newunicodechar{†}{\textdagger}
\newunicodechar{‑}{\mbox{-}}
\newunicodechar{—}{---}
\newunicodechar{’}{'}
\newunicodechar{–}{--}
```

Place it after the other packages and before begin{document}. This is an explicit
source-level compatibility choice, not an automatic rewrite of a user's paper.
Underfull hbox/vbox messages separately concern line/page spacing and do not by
themselves indicate a failed PDF build.

Two application-side logging issues are handled independently:

- stdout and stderr each use their own UTF-8 StringDecoder so a symbol split
  across buffer chunks does not acquire replacement characters.
- Some missing-glyph warnings already contain replacement characters when emitted
  by the engine. The Problems parser reconstructs the displayed symbol from the
  warning's explicit hexadecimal code point and deduplicates equivalent messages.
  The raw build log remains available for diagnosis; restoring a diagnostic label
  does not itself restore a missing glyph in the PDF.

Unit tests cover interleaved, byte-split Unicode streams and recovery of symbols
from damaged engine diagnostics. Real Tectonic checks compiled both versions of
the fixture: the direct-symbol version succeeded with five normalized warnings,
and the mapped version succeeded with no missing-character diagnostics. The
checks used the local validation bundle described in managed-latex-engine.md,
not the user's complete paper or a new public-bundle download.
