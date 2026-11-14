# Sidebar footer

The lower utility row reads left to right: account action, optional Update,
app package version, Settings. Settings is a single icon-only action at the far
right. Signed out, the account action is a single **Sign in** label; signed in,
it becomes the user's avatar. Both continue to open the existing account menu.

This app currently has no application updater/detector. The optional Update
button is hidden unless a future updater publishes
`archimedes:update-available` with a version. `archimedes:update-cleared` hides
it again. Until a real updater exists, clicking Update opens the canonical
Archimedes Releases page; it does not claim to download/install the app. Any
provided release URL is restricted to the Archimedes GitHub releases path.

At narrow sidebar widths, the version and Update label are hidden, Update
becomes icon-only, Settings remains accessible by its label, and Sign in stays
visible. The account/avatar menu and focus outlines are preserved.
