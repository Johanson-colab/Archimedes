# Session comments

The toolbar action toggles placement mode. Click non-interactive conversation
content or whitespace to place a note; links, buttons, selections, editors, and
approval controls keep their original behavior. Escape exits placement mode.
Notes remain discoverable as opening-text summaries outside placement mode.
Nearby notes share one summary with a small extra-note count. Hovering or
keyboard focus opens a read-only preview without moving focus; clicking opens
a persistent compact card with actions.

The input opens next to the clicked point (both x and y), shifting or flipping
only to fit the conversation viewport. Its height is measured so a growing
input or preview stays inside the pane. A preview never covers its summary
button. The summary rail follows the actual conversation-pane width (22%,
bounded at 64–220px), reserving space instead of covering the transcript. CSS
ellipsis fits the opening text using real glyph widths, so narrower panes show
fewer characters without splitting Unicode graphemes in stored content.

## Position contract

Comments still use the existing `thread` resource identifier and comment APIs.
The UI calls them sessions; no persisted resource identifiers are renamed.
`anchor_json` contains:

```json
{ "type": "session-position", "version": 1, "y": 680,
  "messageId": "message-a", "offset": 20, "fraction": 0.4 }
```

`y` is measured in CSS pixels from the conversation content origin, not from
the viewport. A point inside a message also records a fractional offset;
whitespace records the distance after its nearest preceding message. Message
positions are remeasured on resize, font/layout changes and scrolling. If an
anchor refers to paginated history, the renderer expands history before placing
it. Once all history is loaded, missing/deleted messages fall back to the saved
document coordinate. Old unanchored comments appear together at the top instead
of disappearing. Malformed coordinates cannot position markers off the page.

The placement layer does not enter the transcript or change message content.
Session/project/data-workspace changes remount the comment layer; pending requests
cannot populate a different session. Background reads do not replace newer local
mutations. Local permissions still control viewing, posting and resolution.

## Collaboration

Local projects read and write local comments. Shared projects also use the existing
project/session synchronization on entry, window focus, periodic visible-window
refresh (30 seconds), and after mutations. Offline comments remain local and the UI
reports unavailable synchronization. This is **not real-time co-editing** and
requires the existing configured collaboration service and project access.
Position anchors are included in pushes and accepted in both cloud anchor shapes;
older cloud updates do not overwrite newer local notes. Resolution changes are
sent through the existing comment update endpoint rather than recreating comments.

## Visual evidence and verification

`docs/assets/session-comments/before.png` and `after.png` use the same 1560×900,
Paper-theme controlled conversation fixture with the real old/new components.
The old version blocks the transcript with a discussion dialog; the new version
places a compact note at the corresponding message height. `after-narrow.png`
exercises a 550px viewport with larger text.

Browser checks: create, refresh/reload, session switch, draft isolation,
Resolve, and reflow (marker y 178 → 303 as width/font changed). Pure helper
tests cover paginated and deleted messages, legacy data, whitespace and invalid
coordinates. Store/sync tests cover reopening, peer access, cloud anchors and
resolution updates. No live multi-account cloud deployment was used for this PR.

Follow-up evidence: `input-near-click-before/after.png` shows the old right-edge
composer versus click-local placement; `summary-before/after.png` replaces the
numeric marker. `summary-hover-preview.png` and `summary-narrow-after.png`
verify hover preview and responsive text truncation. These use the same real
components in a Paper-theme controlled fixture at 1560×900 (narrow: 550×700).
