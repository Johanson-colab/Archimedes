# Paper review venue packs

Each JSON file is a **versioned, auditable venue pack** for the Paper review
micro app. The packs are open source. They contain a structured summary of a
venue's public review form and a compact rubric, not a verbatim copy of the
call for papers. Every pack links to the public source it was derived from.

A pack is intentionally data-only so it can be reviewed, diffed and replaced
without changing the agent pipeline. The schema is validated by
`electron/paper-review-venues.cjs`; unknown or malformed fields fail closed.

## Schema

```json
{
  "schemaVersion": 1,
  "id": "iclr-2026-main",
  "venue": "ICLR",
  "year": 2026,
  "track": "main",
  "displayName": "ICLR 2026 · Main",
  "version": "2026.1",
  "sourceUrls": ["https://..."],
  "notes": "Structured summary, not verbatim CFP text.",
  "anonymous": true,
  "pageLimit": 10,
  "overall": { "min": 1, "max": 10, "labels": { "1": "Strong reject" } },
  "confidence": { "min": 1, "max": 5, "labels": { "1": "Low" } },
  "subdimensions": [
    {
      "id": "soundness",
      "label": "Soundness",
      "min": 1,
      "max": 4,
      "weight": 0.4,
      "guidance": "..."
    }
  ],
  "decisionBands": [
    { "min": 1, "max": 3, "label": "Reject" },
    { "min": 4, "max": 5, "label": "Borderline" },
    { "min": 6, "max": 10, "label": "Accept" }
  ],
  "deskRejectRules": ["..."],
  "template": {
    "summary": "...",
    "strengths": "...",
    "weaknesses": "...",
    "questions": "...",
    "limitations": "..."
  },
  "rubric": {
    "summary": "...",
    "soundness": "...",
    "presentation": "...",
    "contribution": "..."
  }
}
```

## Copyright

The packs are our own structured summaries. They link to the venue's public
guidelines and do not reproduce protected CFP or reviewer-guideline text.
