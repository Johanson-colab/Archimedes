# Paper review

Paper review is a built-in micro app that simulates a conference review from the
paper's own pages. It is deliberately **not** a decision predictor and it is
**not** the same surface as Library → Interactive paper.

- Sidebar group: **Evaluate**
- Entry: **Paper review**
- Library reader tab: **Interactive paper** (renamed from Review)
- Result label: **Simulated review**

## Why a separate group

Library, Daily papers, News and Benchmark Radar are sources you read. Reproduce,
Paper writing and Image creation are outputs you create. A simulated review is
an assessment of a manuscript against a venue's public review form, so it has
its own **Evaluate** group rather than being mixed into either column.

## Pipeline

The pipeline follows the publicly described CSPaper shape, adapted to a local,
auditable implementation:

1. **Ingest** — Library PDF, arXiv ID/URL, or a local PDF. Page text and page
   numbers are cached in `paper-review.sqlite`; the PDF is copied to the user
   data folder.
2. **Preflight** — page count, parser coverage, desk-reject rules, and
   instruction-shaped text (prompt injection). A PDF with too little readable
   text stops at the gate without calling a model.
3. **Paper card** — one evidence-grounded JSON object with contributions,
   claims, method, experiments, limitations and page references.
4. **Score-conditioned reviewers** — one independent reviewer per overall score
   in the venue scale. Each is asked to write the most defensible review for
   exactly that score, which covers reject and accept perspectives instead of
   anchoring on one model opinion. A failed or truncated JSON answer is retried
   once with a compact schema.
5. **Selector** — chooses the best-justified, optimistic and critical reviews
   and marks generic / unsupported / nitpicky / invalid (GUNI) material.
6. **Synthesizer** — uses the best-justified review as the backbone, absorbs
   supported insights from the other two, and keeps real disagreement visible.
7. **Calibrator** — reconciles the overall score with the venue subdimensions,
   clamps to the venue scale, and maps the result to the venue decision band.
   It also reports a normalized 0–100 score (not an acceptance probability) and
   reviewer agreement.
8. **Local pool** — once five completed runs exist for the same venue, the UI
   shows a local percentile. It is explicitly local-only and never claims to be
   a real acceptance rate.

## Venue packs

Venue rules live in `shared/paper-review/venue-packs/*.json`. A pack contains the
venue/year/track, page limit, overall and confidence scales, subdimensions and
weights, decision bands, desk-reject rules, review template and a rubric. Packs
are validated at startup; gaps, missing score labels or non-HTTPS sources fail
closed.

The shipped packs are structured summaries of public review forms, not verbatim
copies of copyrighted CFPs or reviewer guidelines. Each links to its public
source. The schema and copyright note are documented in
`shared/paper-review/README.md`.

## Model selection and privacy

- Default: the **main agent model** from Settings → Models.
- Optional: a custom provider with its own base URL, model and API key.
- The API key is never returned to the renderer; the settings screen only
  receives `configured: true/false`.
- Runs and page text stay in local SQLite. The paper text is sent to the chosen
  model provider only when a review starts. The UI states this before the run.
- The settings file is written with mode `0600` where the filesystem supports it.

## Storage

`paper-review.sqlite` holds:

- documents (page text, parser coverage)
- runs (venue pack version, model, timings, scores, trace and result JSON)
- findings (normalized strengths/weaknesses/questions/limitations)
- dimension scores

The renderer reads only run summaries and results; it never receives the PDF
bytes or the API key.

## Differences from Library → Interactive paper

| Surface | Purpose |
|---|---|
| Interactive paper | Read the original PDF with four evidence-grounded readings and a research memorandum. |
| Paper review | Simulate a venue review with score-conditioned reviewers, a selector, a synthesized review and calibrated scores. |

The two surfaces are independent in this version. They do not share runs, prompts
or state.

## Testing

- Venue-pack validation, store, settings, provider adapters, pipeline, selector,
  calibration, Markdown export, i18n and UI audits are covered by Node tests.
- A local mock provider was used for end-to-end UI tests without network model
  calls.
- A real run against the configured main agent model (`deepseek-flash`) reviewed
  the 19-page LongRAG paper: 5 score-conditioned reviewers, 8 extracted claims,
  a synthesized review at 3/5 (Borderline), 143k–192k input tokens depending on
  the run, and a complete local trace.

## Known follow-ups

- Rebuttal / author-response interaction.
- A public benchmark harness with leakage splits and MAE / Spearman reporting.
- Reviewer discussion threads and multi-version diffing.
- Sharing runs with collaborators (intentionally out of scope for the local MVP).
