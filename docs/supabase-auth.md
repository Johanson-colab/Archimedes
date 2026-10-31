# Supabase auth

The desktop now has a Supabase Auth shell. It is independent of the local
identity and does not replace local-only usage.

## Configuration

`shared/supabase-config.json` contains the project URL and **publishable** key.
These are public client credentials; never put the secret/service-role key in
the repo or desktop app. The URL/key can be overridden by a deployment build.

## Flow

1. Settings → Account shows the local profile and the **Cloud account** section.
2. A user can create an account or sign in with email/password.
3. Supabase email confirmation is currently required. After sign-up, the user
   must confirm the email and then sign in.
4. Sessions are stored in app userData `supabase-session.json`, encrypted with
   Electron `safeStorage` when available.
5. Signing out clears the local session; the local identity and local data stay.

## What this does not do yet

- No OAuth/SSO/OTP UI (email/password only).
- No sync: the account is not yet connected to projects/libraries/threads.
- No API JWT verification in the collaboration server.
- No profile merge with the local identity.
- No password reset UI.
- Email confirmation redirect/Site URL must be configured in Supabase before a
  production flow.

## Next

- Add API JWT verification and project/member sync.
- Add password reset and OAuth/OTP.
- Link the cloud user to the local identity and show sync status.
