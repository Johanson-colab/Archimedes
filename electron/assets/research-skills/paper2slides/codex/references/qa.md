# QA — the verification loop (self-contained)

The QA protocol for Stage 5. This file is **self-contained**: the deck-rendering QA loop and the visual-subagent
prompt template live here in full, so no external skill is needed. The paper-specific evidence and visual checks live in
[design-style.md](design-style.md) §0.4 and "Visual review and fixes" —
this file points to them rather than restating.

**First read `config.json/visual_qa`**: content QA always runs; visual QA runs only when `visual_qa == true`.

## Mindset

**Assume there are problems. Your job is to find them.** The first render is almost never correct — approach QA as
a bug hunt, not a confirmation step. If you found zero issues on first inspection, you weren't looking hard enough.

## A. Content QA (always runs)

```bash
conda run -n paper2anything --no-capture-output python -m markitdown <workdir>/output.pptx
```

Check for missing content, typos, wrong order, and — for a paper deck — additionally:

- every number (percentage, improvement, model scale) traces to the caption or paper text; no fabrication
- bullet wording is consistent with the paper's abstract / contributions, not lifted verbatim or invented
- no leftover placeholder text in titles or bodies:

```bash
conda run -n paper2anything --no-capture-output python -m markitdown <workdir>/output.pptx | grep -iE "xxxx|lorem|ipsum|placeholder"
```

If grep returns results, fix them before declaring success.

## B. Visual QA (only when `config.json/visual_qa == true`)

### B.1 Render slides to images

```bash
soffice --headless --convert-to pdf --outdir <workdir>/qa <workdir>/output.pptx
pdftoppm -jpeg -r 150 <workdir>/qa/output.pdf <workdir>/qa/slide
```

This creates `<workdir>/qa/slide-01.jpg`, `slide-02.jpg`, … To re-render only specific slides after a fix:

```bash
pdftoppm -jpeg -r 150 -f N -l N <workdir>/qa/output.pdf <workdir>/qa/slide-fixed
```

(`soffice` = LibreOffice, `pdftoppm` = Poppler; both must be on PATH. All QA intermediate outputs go under
`<workdir>/qa/` — use the `qa_dir` field from `python -m scripts.workdir resolve <paper.pdf>`.)

### B.2 Dispatch a single subagent to batch-review

Convert the slides to images, then dispatch **one subagent** (use a subagent even for 2–3 slides — you've been
staring at the spec and will see what you expect, not what's there; the subagent has fresh eyes). Use the prompt
template below. **Which slides to list** under "Read and analyze these images" follows the recheck-narrowing rule in
[design-style.md](design-style.md) "Visual review and fixes" (round 1 all; recheck rounds list only
flagged ∪ changed pages; the last pass lists all) — not the full deck every round.

```
Visually inspect these slides. Assume there are issues — find them.

Look for:
- Overlapping elements (text through shapes, lines through words, stacked elements)
- Text overflow or cut off at edges/box boundaries
- Decorative lines positioned for single-line text but title wrapped to two lines
- Source citations or footers colliding with content above
- Elements too close (< 0.3" gaps) or cards/sections nearly touching
- Uneven gaps (large empty area in one place, cramped in another)
- Insufficient margin from slide edges (< 0.5")
- Columns or similar elements not aligned consistently
- Low-contrast text (e.g., light gray text on cream-colored background)
- Low-contrast icons (e.g., dark icons on dark backgrounds without a contrasting circle)
- Text boxes too narrow causing excessive wrapping
- Leftover placeholder content

For each slide, list issues or areas of concern, even if minor.

Read and analyze these images:
1. /path/to/slide-01.jpg (Expected: [brief description])
2. /path/to/slide-02.jpg (Expected: [brief description])

Report ALL issues found, including minor ones.
```

For each selected figure or table, compare the original with the slide: crop boundaries, labels, axes, legend, units, baselines and any redraw. Check visual hierarchy, legibility and actual layout repetition. Treat intentional whitespace as a design choice, not an automatic failure. Distinguish rendering defects from editorial or source-fidelity concerns.

## Verification Loop

1. Generate slides → convert to images → inspect
2. **List issues found** (if none found, look again more critically)
3. Fix issues — edit `slide_spec.json` (not `slide_outline.json`, unless the problem is upstream), following [design-style.md](design-style.md)
4. `--from-stage render` to **fully re-render** (render is cheap and deterministic; a crop / spec change must
   propagate to the whole deck — what gets narrowed is the per-page subagent review, not the render), then
   **re-verify the affected slides** — one fix often creates another problem
5. Repeat until a full pass reveals no new issues

If no issue is found after an adequate independent review, no artificial edit is required. Check changed pages after fixes, then run a final full-deck pass.

## Reporting

- **The final report must state whether visual QA was run.** When skipped, note: "visual QA was skipped per config;
  to change config use `--from-stage configure` then `--from-stage qa`".
- Report content accuracy, evidence fidelity and visual design as separate outcomes; retain unresolved concerns and source limitations.
- Run `python -m scripts.audit_deck <workdir>` before delivery and resolve reported structural errors. A successful audit is not proof of visual or numerical fidelity.

For the full A/B protocol, the `qa_log.json` structure, and the convention of putting all artifacts under
`<workdir>/qa/`, see [pipeline.md](pipeline.md) §Stage 5.
