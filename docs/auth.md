# Authentication

Archimedes uses Supabase Auth for cloud identity. Login never gates local
projects, papers, files, local models, or local agent runs.

## Entry points

- **Sidebar account chip**: `Sign in` when signed out; name + `Cloud · Free plan`
  when signed in. Opens the account menu, settings, and sign-out.
- **Composer runtime chip**: `Local` is always selected. `Cloud` is locked when
  signed out; clicking it shows an inline gate above the composer without
  clearing the draft, attachments, or context. Cloud runtime itself is still
  gated for rollout.
- **Settings → Account**: profile, cloud identity, password change, session
  storage, and upload-boundary disclosures.

## Methods

| Method | Status | Notes |
| --- | --- | --- |
| Email + password | enabled | Sign-up, confirmation, sign-in, sign-out, change password |
| Email magic link | opt-in | `ARCHIMEDES_AUTH_MAGIC_LINK=1` plus loopback redirect allowlist |
| Google OAuth | provider-dependent | Shown only when Supabase reports Google enabled |
| Password reset | opt-in | Uses the recovery loopback redirect |
| Phone/WeChat | not enabled | Needs provider credentials and review |

## Desktop flow

Email links and OAuth use the system browser, PKCE, and a loopback listener on
`127.0.0.1:45871` (override with `ARCHIMEDES_AUTH_PORT`). The app never embeds a
provider webview. Refresh tokens are encrypted with Electron `safeStorage`;
access tokens stay in memory and are refreshed on demand.

## Supabase dashboard setup

1. Authentication → URL Configuration → Redirect URLs add:
   - `http://127.0.0.1:45871/auth/callback`
   - `http://127.0.0.1:45871/auth/recovery`
2. Authentication → Providers: enable Email. Optionally enable Google and set
   its client ID/secret.
3. Set `ARCHIMEDES_AUTH_MAGIC_LINK=1` only after the redirect URLs are saved.
4. Keep `mailer_autoconfirm` off if you want email confirmation.

Without the redirect allowlist, email/password sign-in and sign-up still work,
but magic links, OAuth callbacks, and password-reset links cannot return to the
desktop app. The UI hides magic link/reset unless `ARCHIMEDES_AUTH_MAGIC_LINK=1`;
Google is hidden unless Supabase reports it enabled.

## Upload boundary

Cloud runs upload the prompt, explicitly attached files, and selected context.
They do not upload the whole project or library by default. Signing out clears
cloud tokens only; local databases and files remain. Project sync is opt-in per
project.
