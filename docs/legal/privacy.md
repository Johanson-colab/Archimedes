# Archimedes Privacy Notice

Status: draft for the collaboration beta.

## Data that stays local

Projects, papers, files, local notes, local agent runs, local models, and BYOK
credentials stay on your device by default.

## Data sent to the cloud

Signing in sends account identity to Supabase Auth. When you use cloud features,
Archimedes sends the prompt, explicitly attached files, and selected context.
Project sync is opt-in. Guest links contain a read-only snapshot and expire.

## Session security

Refresh tokens are stored with the operating system keychain when Electron
`safeStorage` is available. Access tokens are kept in memory. Signing out
clears cloud tokens, not local data.

## Your choices

You can continue using Archimedes without an account, sign out at any time, and
export shared project data from Members. Account deletion and organization-wide
retention controls are beta follow-ups; contact the maintainers before a
production deployment.

This draft must be reviewed by counsel before a paid public launch.
