# Session snapshot export

The dialog uses the already-frozen snapshot, not the current scroll viewport.
Choose all turns, the latest turn, or individual turns. The selection drives the
preview, Markdown copy, JSON copy, and all downloaded files. Empty selections
cannot be exported. Sources can be omitted; diagnostic events are opt-in and
carry a warning because they can contain paths, commands, or sensitive payloads.
The default JSON deliberately omits session owner IDs and arbitrary turn fields.
Partial exports include evidence only from selected turns, not unrelated/global
sources. Preview excerpts are limited for responsiveness; files keep full text.

## Guest links are different

Guest-link UI is not mounted when signed out. Existing links are cleared on
logout; a change of account or snapshot remounts the dialog. The existing server
API shares a **complete session resource**, not an immutable selected snapshot.
The dialog says this explicitly. Links are disabled for partial/private sessions,
so choosing a small excerpt cannot accidentally grant access to the rest.
Authentication, membership, and link authorization remain enforced by the server.
No new anonymous publication API is introduced.

## Long PNG images

PNG export lays out the full selected **text transcript** with the current theme
colors, at 600/900/1200 pixels wide. It is not a pixel-exact capture of the app:
Markdown syntax is retained as readable text, and external images, videos,
attachments, embedded pages and interactive widgets are not rasterized or fetched.
Use Markdown/JSON when machine-readable fidelity is important.

Long images are split into numbered files below common canvas-height limits
(550 text lines per image). Multi-image results show explicit per-file download
buttons rather than silently relying on browsers allowing multiple downloads.
Extreme selections fail with a recommendation to select fewer turns or download
Markdown, instead of silently truncating text. Closing the dialog cancels pending
image work. No screenshot/native-capture permission or new dependency is needed.

## Verification

Controlled real-component Chromium fixture checks:
- signed-out guest controls absent; logout removes a generated link;
- selecting one middle turn copies only that turn's JSON;
- latest-turn selection cannot create a full-session guest link;
- a normal PNG is 900×992; a 900-line sample exports two images (900×14408 and
  900×9468), not a clipped screenshot;
- the 550px viewport has no horizontal dialog overflow.

Screenshots in `docs/assets/session-snapshot/` use Paper at 1560×900; narrow uses
550×800. Baseline and new screenshots use the same frozen three-turn fixture.
Live cloud link creation was mocked for UI checks, not tested against production.
