# Incomplete response evidence

Both images render the actual `ChatActivityTimeline` at 860×520, Charcoal,
English, high chat verbosity. The fixture uses the same synthetic events: one
read tool call, its result, and an assistant answer whose persisted status is
`incomplete` with a `model_incomplete` event.

- `before.png` uses `10ac03d`: the footer reports **Completed** for that answer.
- `after.png` uses this PR: the footer reports **Incomplete** in the warning
  color. The partial answer and its tool evidence remain visible.

The static viewport is intentional so the footer difference is attributable to
the feature. Journey chapter/episode status is covered by
`electron/journey-event-state.test.cjs` and `electron/ui-audit-journey.test.cjs`.
