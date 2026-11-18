# Research-app entry notice evidence

Both images use the actual `.main-workspace` grid with a full-height research-app
view at 980×620, Charcoal and English. The message and the synthetic catalog
content are identical.

- `before.png` uses the previous markup from `6ade07b`: the entry error is a
  normal second grid child using `.composer-attachment-error`, rendered as 9px
  text at the bottom edge of the workspace.
- `after.png` uses `ResearchAppEntryNotice` (the real `InlineNotice` with
  `app-entry-notice`): a bounded, centered danger alert at the top of the
  workspace with a dismiss control, independent of the full-height view.

The screenshots do not exercise MinerU authentication. They show presentation
of an entry failure only. The effective-harness behavior of the model setup hint
is covered by `electron/research-app-entry-notice.test.cjs`.

The composer pair uses the full App renderer in Electron at 1440 × 1000, Charcoal and English, with the API harness selected and no configured key. Both captures use the same local welcome assets and empty conversation. The before capture uses upstream main at `0637139`. The after capture shows the setup hint and **Configure model**. Clicking the button opened the Settings dialog.

| Before | After |
| --- | --- |
| ![Composer before model setup hint](composer-before.png) | ![Composer with model setup hint and action](composer-after.png) |
