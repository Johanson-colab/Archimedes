# Recovered answer in Journey

Both captures show the production Journey Story view in Electron at 680 × 760, Charcoal and English. The same local SQLite fixture was copied before reopening. Its task had stored a completed answer, while the corresponding turn was still marked running.

Upstream main at `0637139` leaves that turn **Running** with no answer episode. At `9ff902a`, a fresh process changes the persisted turn to **Complete** and writes one `assistant_message` event with the saved answer. Journey displays that event as **Drafted the answer**. The answer text and recorded tool activity are fixture data.

| Before | After |
| --- | --- |
| ![Journey shows a running session with no answer](journey-before.png) | ![Journey shows the completed session and recovered answer](journey-after.png) |
