# Evidence selection and layouts

## Evidence plan

Build a slide-level claim → source section → figure/table/equation plan. Select original evidence for key methods and results when informative; do not impose a universal image quota. Use a figure's full context, then split panels or enlarge details. Redraw only when necessary; preserve relationships, units, legends, baselines, and state that it is adapted. An omission or replacement of a planned figure must be explained in the spec and reviewed. Cite section and figure/table number in the slide or speaker notes. Do not infer that a visually attractive slide is faithful to the paper.

Add `evidence` records per `schemas.md`, then run `python -m scripts.audit_deck <workdir>`. Inspect each warning and compare the slide with the original. The audit detects structural mismatches, not deceptive or inaccurate crops, claims, or data.

## Practical starting layouts (10 × 5.625 inches)

These are adaptable recipes, not fixed templates. Coordinates are maximum boxes; preserve aspect ratio. Use high-resolution source images and projection-readable text.

- **Architecture overview:** source image at x=.5 y=1.4 w=5.5 h=3.5; 2–3 explanations at x=6.3 y=1.5 w=3.1. If image labels become tiny, add a separate panel-detail slide instead of shrinking it.
- **Architecture detail:** selected panel at x=.5 y=1.4 w=4.3 h=3.5, explanation at x=5.1 y=1.4 w=4.3; state that it is a detail and link to the full figure.
- **Main results table:** use x=.5 y=1.4 w=9 h=2.7 for the original or an accurately selected row/column subset retaining column labels; place a sourced takeaway below. Split into pages if text is too small.
- **Curve + interpretation:** original chart including legend and axes at x=.5 y=1.4 w=5.6 h=3.6; conclusions and comparison conditions at x=6.4 y=1.5 w=3.1. Do not redraw numbers from an image unless verified.
- **Qualitative comparison:** 2–3 aligned original panels, each labeled with the same scenario and model; note if the paper selected examples. Do not hide unfavorable cases.
- **Theory / equation:** legible editable equation or faithful image with one worked interpretation; a text-only slide is fine if it is clearer than a decorative visual.

Vary composition to fit the evidence. Repeated layouts are not inherently wrong; avoid monotonous card-only decks and meaningless decorations.
