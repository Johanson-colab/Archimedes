import { useEffect, useState } from "react";
import { useDialogFocus } from "./useDialogFocus";
import DialogPortal from "./DialogPortal";

type AuthModalProps = {
  open: boolean;
  authState: AuthState | null;
  initialMode?: "choice" | "password" | "signup" | "reset" | "recovery";
  onClose: () => void;
  onSignIn: (email: string, password: string) => Promise<AuthState>;
  onSignUp: (email: string, password: string, displayName?: string) => Promise<AuthState>;
  onMagicLink: (email: string) => Promise<AuthState>;
  onOAuth: (provider: "google") => Promise<AuthState>;
  onResetPassword: (email: string) => Promise<AuthState & { recovery: boolean }>;
  onUpdatePassword: (password: string) => Promise<AuthState>;
  onOpenExternal: (url: string) => void;
};

type Mode = "choice" | "password" | "signup" | "reset" | "recovery";

function readableAuthError(message: string) {
  if (/rate limit|too many|after \d+ seconds/i.test(message)) {
    return "Email sending is rate-limited right now. Wait a few minutes, or sign in with your password.";
  }
  return message;
}

export default function AuthModal({ open, authState, initialMode = "choice", onClose, onSignIn, onSignUp, onMagicLink, onOAuth, onResetPassword, onUpdatePassword, onOpenExternal }: AuthModalProps) {
  const dialogRef = useDialogFocus<HTMLElement>(open, onClose);
  const [mode, setMode] = useState<Mode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [emailCooldownUntil, setEmailCooldownUntil] = useState(0);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setError("");
    setNotice("");
    setPassword("");
    setConfirmPassword("");
    setDisplayName("");
  }, [initialMode, open]);

  useEffect(() => {
    if (!open || emailCooldownUntil <= Date.now()) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [emailCooldownUntil, open]);

  if (!open) return null;
  const providers = authState?.providers || { email: true, google: false, magicLink: false };
  const emailCooldown = Math.max(0, Math.ceil((emailCooldownUntil - now) / 1000));
  const changingPassword = Boolean(authState?.user) && mode === "password";

  async function run(action: () => Promise<AuthState | void>, success = "") {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
      if (success) setNotice(success);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const seconds = Number(message.match(/(?:after|in)\s+(\d+)\s+seconds?/i)?.[1] || 60);
      if (/rate limit|too many|after \d+ seconds/i.test(message)) {
        setEmailCooldownUntil(Date.now() + Math.max(30, seconds) * 1000);
        setNow(Date.now());
      }
      setError(readableAuthError(message));
    } finally {
      setBusy(false);
    }
  }

  function magic() {
    if (!email.trim()) { setError("Enter your email address first."); return; }
    void run(async () => {
      setNotice("Check your email. Finish signing in in the browser.");
      await onMagicLink(email.trim());
      onClose();
    });
  }

  function passwordSignIn() {
    if (!email.trim() || !password) { setError("Enter your email and password."); return; }
    void run(async () => { await onSignIn(email.trim(), password); onClose(); });
  }

  function createAccount() {
    if (!email.trim() || password.length < 8) { setError("Use an email and at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("The passwords do not match."); return; }
    void run(async () => {
      const next = await onSignUp(email.trim(), password, displayName.trim());
      if (next.needsConfirmation) {
        setNotice("Check your email to confirm the account, then sign in here.");
        setMode("choice");
      } else {
        onClose();
      }
    });
  }

  function reset() {
    if (!email.trim()) { setError("Enter the email for your account."); return; }
    void run(async () => {
      setNotice("Check your email for the reset link.");
      const next = await onResetPassword(email.trim());
      if (next.recovery) setMode("recovery");
    });
  }

  function savePassword() {
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("The passwords do not match."); return; }
    void run(async () => { await onUpdatePassword(password); onClose(); });
  }

  const title = mode === "recovery" || changingPassword
    ? "Choose a new password"
    : mode === "signup"
      ? "Create account"
      : mode === "reset"
        ? "Reset password"
        : "Sign in";

  return <DialogPortal><div className="modal-backdrop auth-backdrop" role="presentation" onMouseDown={onClose}>
    <section ref={dialogRef} tabIndex={-1} className="auth-modal app-dialog app-dialog-sm" role="dialog" aria-modal="true" aria-label="Sign in to Archimedes" onMouseDown={(event) => event.stopPropagation()}>
      <header className="auth-header">
        <h2>{title}</h2>
        <button className="auth-close" onClick={onClose} aria-label="Close sign-in">×</button>
      </header>

      {mode !== "recovery" && !changingPassword && <p className="auth-intro">Local projects, papers, and agent runs always work without an account. Cloud runs upload only the prompt, explicit attachments, and selected context.</p>}

      <div className="auth-body">
        {error && <div className="auth-error">{error}</div>}
        {notice && <div className="auth-notice">{notice}</div>}

        {(mode === "choice" || mode === "password") && !changingPassword && <>
          {providers.google && <button className="secondary-button auth-submit" disabled={busy} onClick={() => void run(async () => { await onOAuth("google"); onClose(); })}>Continue with Google</button>}
          <label className="auth-field"><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@university.edu" autoComplete="email" autoFocus onKeyDown={(event) => { if (event.key === "Enter") passwordSignIn(); }} /></label>
          <label className="auth-field"><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" autoComplete="current-password" onKeyDown={(event) => { if (event.key === "Enter") passwordSignIn(); }} /></label>
          <button className="primary-button auth-submit" disabled={busy || !providers.email} onClick={passwordSignIn}>{busy ? "Signing in…" : "Sign in"}</button>
          {providers.magicLink && <button className="secondary-button auth-submit" disabled={busy || !email.trim() || !providers.email || emailCooldown > 0} onClick={magic}>{emailCooldown > 0 ? `Try again in ${emailCooldown}s` : busy ? "Waiting for browser…" : "Email me a sign-in link"}</button>}
          <div className="auth-links">
            {providers.magicLink && <button onClick={() => setMode("reset")}>Forgot password?</button>}
            <button onClick={() => setMode("signup")}>Create account</button>
          </div>
          {!providers.email && <p className="auth-hint">Email sign-in is disabled for this project.</p>}
        </>}

        {changingPassword && <>
          <p className="auth-hint">Signed in as {authState?.user?.email}.</p>
          <label className="auth-field"><span>New password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" autoComplete="new-password" autoFocus /></label>
          <label className="auth-field"><span>Confirm password</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat password" autoComplete="new-password" onKeyDown={(event) => { if (event.key === "Enter") savePassword(); }} /></label>
          <button className="primary-button auth-submit" disabled={busy} onClick={savePassword}>{busy ? "Saving…" : "Update password"}</button>
        </>}

        {mode === "signup" && <>
          <label className="auth-field"><span>Display name</span><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Ada Lovelace" autoComplete="name" autoFocus /></label>
          <label className="auth-field"><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@university.edu" autoComplete="email" /></label>
          <label className="auth-field"><span>Password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" autoComplete="new-password" /></label>
          <label className="auth-field"><span>Confirm password</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat password" autoComplete="new-password" onKeyDown={(event) => { if (event.key === "Enter") createAccount(); }} /></label>
          <button className="primary-button auth-submit" disabled={busy || emailCooldown > 0} onClick={createAccount}>{emailCooldown > 0 ? `Try again in ${emailCooldown}s` : busy ? "Creating account…" : "Create account"}</button>
          <div className="auth-links"><button onClick={() => setMode("choice")}>Back to sign in</button></div>
        </>}

        {mode === "reset" && <>
          <p className="auth-hint">We will email a secure reset link.</p>
          <label className="auth-field"><span>Email</span><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@university.edu" autoComplete="email" autoFocus /></label>
          <button className="primary-button auth-submit" disabled={busy || !email.trim() || emailCooldown > 0} onClick={reset}>{emailCooldown > 0 ? `Try again in ${emailCooldown}s` : busy ? "Waiting for browser…" : "Send reset link"}</button>
          <div className="auth-links"><button onClick={() => setMode("choice")}>Back to sign in</button></div>
        </>}

        {mode === "recovery" && <>
          <p className="auth-hint">The reset link is verified. Choose a new password.</p>
          <label className="auth-field"><span>New password</span><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" autoComplete="new-password" autoFocus /></label>
          <label className="auth-field"><span>Confirm password</span><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat password" autoComplete="new-password" onKeyDown={(event) => { if (event.key === "Enter") savePassword(); }} /></label>
          <button className="primary-button auth-submit" disabled={busy} onClick={savePassword}>{busy ? "Saving…" : "Save new password"}</button>
        </>}
      </div>

      <footer className="auth-footer">
        <button className="auth-skip" onClick={onClose}>Continue without an account</button>
        <span>By continuing you agree to the <button onClick={() => onOpenExternal("https://github.com/Johanson-colab/Archimedes/blob/main/docs/legal/terms.md")}>Terms</button> and <button onClick={() => onOpenExternal("https://github.com/Johanson-colab/Archimedes/blob/main/docs/legal/privacy.md")}>Privacy Policy</button>.</span>
      </footer>
    </section>
  </div></DialogPortal>;
}
