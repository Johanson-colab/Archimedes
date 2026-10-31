import { useEffect, useState } from "react";
import { ArrowRight, CheckCircle2, Globe2, KeyRound, Laptop, LoaderCircle, LockKeyhole, Mail, ShieldCheck, UserRound, X } from "lucide-react";
import { useDialogFocus } from "./useDialogFocus";

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

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setError("");
    setNotice("");
    setPassword("");
    setConfirmPassword("");
    setDisplayName("");
  }, [initialMode, open]);

  if (!open) return null;
  const providers = authState?.providers || { email: true, google: false, magicLink: false };
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
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }

  function magic() {
    if (!email.trim()) { setError("Enter your email address first."); return; }
    void run(async () => {
      setNotice("Waiting for the email link. Finish signing in in your browser.");
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
        setNotice("Check your email to confirm the account, then sign in here. Your local data is unaffected.");
        setMode("choice");
      } else {
        onClose();
      }
    });
  }

  function reset() {
    if (!email.trim()) { setError("Enter the email for your account."); return; }
    void run(async () => {
      setNotice("Check your email for the reset link. This window will continue when you return.");
      const next = await onResetPassword(email.trim());
      if (next.recovery) setMode("recovery");
    });
  }

  function savePassword() {
    if (password.length < 8) { setError("Use at least 8 characters."); return; }
    if (password !== confirmPassword) { setError("The passwords do not match."); return; }
    void run(async () => { await onUpdatePassword(password); onClose(); }, "Password updated.");
  }

  return <div className="modal-backdrop auth-backdrop" role="presentation" onMouseDown={onClose}>
    <section ref={dialogRef} tabIndex={-1} className="auth-modal" role="dialog" aria-modal="true" aria-label="Sign in to Archimedes" onMouseDown={(event) => event.stopPropagation()}>
      <header className="auth-header">
        <div>
          <span className="eyebrow">Archimedes account</span>
          <h2>{mode === "recovery" || changingPassword ? "Choose a new password" : mode === "signup" ? "Create your account" : "Sign in to collaborate"}</h2>
        </div>
        <button className="settings-close" onClick={onClose} aria-label="Close sign-in"><X size={16} /></button>
      </header>

      {mode !== "recovery" && <div className="auth-local-first">
        <span className="auth-local-icon"><Laptop size={17} /></span>
        <div><strong>Your research stays local by default.</strong><p>Projects, papers, and local agent runs work without an account. Cloud runs upload only the prompt, explicit attachments, and selected context. Sync is opt-in per project.</p></div>
      </div>}

      <div className="auth-body">
        {error && <div className="auth-error">{error}</div>}
        {notice && <div className="auth-notice"><CheckCircle2 size={14} /><span>{notice}</span></div>}

        {(mode === "choice" || mode === "password") && !changingPassword && <>
          {providers.google && <button className="auth-provider" disabled={busy} onClick={() => void run(async () => { await onOAuth("google"); onClose(); })}><Globe2 size={16} /><span>Continue with Google</span><ArrowRight size={14} /></button>}
          <label className="auth-field"><span>Email</span><div><Mail size={14} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@university.edu" autoComplete="email" autoFocus onKeyDown={(event) => { if (event.key === "Enter") passwordSignIn(); }} /></div></label>
          <label className="auth-field"><span>Password</span><div><LockKeyhole size={14} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Your password" autoComplete="current-password" onKeyDown={(event) => { if (event.key === "Enter") passwordSignIn(); }} /></div></label>
          <button className="primary-button auth-primary" disabled={busy || !providers.email} onClick={passwordSignIn}>{busy ? <LoaderCircle className="spin" size={14} /> : <KeyRound size={14} />}{busy ? "Signing in…" : "Sign in"}</button>
          {providers.magicLink && <button className="secondary-button auth-primary" disabled={busy || !email.trim() || !providers.email} onClick={magic}><Mail size={14} />{busy ? "Waiting for browser…" : "Email me a sign-in link"}</button>}
          <div className="auth-links">
            {providers.magicLink && <button onClick={() => setMode("reset")}>Forgot password?</button>}
            <button onClick={() => setMode("signup")}><UserRound size={12} />Create account</button>
          </div>
          {!providers.email && <p className="auth-hint">Email sign-in is disabled for this project.</p>}
        </>}

        {changingPassword && <>
          <p className="auth-hint">You are signed in as {authState?.user?.email}. Your local data is unaffected.</p>
          <label className="auth-field"><span>New password</span><div><LockKeyhole size={14} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" autoComplete="new-password" autoFocus /></div></label>
          <label className="auth-field"><span>Confirm password</span><div><LockKeyhole size={14} /><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat password" autoComplete="new-password" onKeyDown={(event) => { if (event.key === "Enter") savePassword(); }} /></div></label>
          <button className="primary-button auth-primary" disabled={busy} onClick={savePassword}>{busy ? <LoaderCircle className="spin" size={14} /> : <KeyRound size={14} />}{busy ? "Saving…" : "Update password"}</button>
        </>}

        {mode === "signup" && <>
          <label className="auth-field"><span>Display name</span><div><UserRound size={14} /><input value={displayName} onChange={(event) => setDisplayName(event.target.value)} placeholder="Ada Lovelace" autoComplete="name" autoFocus /></div></label>
          <label className="auth-field"><span>Email</span><div><Mail size={14} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@university.edu" autoComplete="email" /></div></label>
          <label className="auth-field"><span>Password</span><div><LockKeyhole size={14} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" autoComplete="new-password" /></div></label>
          <label className="auth-field"><span>Confirm password</span><div><LockKeyhole size={14} /><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat password" autoComplete="new-password" onKeyDown={(event) => { if (event.key === "Enter") createAccount(); }} /></div></label>
          <button className="primary-button auth-primary" disabled={busy} onClick={createAccount}>{busy ? <LoaderCircle className="spin" size={14} /> : <UserRound size={14} />}{busy ? "Creating account…" : "Create account"}</button>
          <div className="auth-links"><button onClick={() => setMode("choice")}>Back to sign in</button></div>
        </>}

        {mode === "reset" && <>
          <p className="auth-hint">We will email a secure reset link. Your local data is not affected.</p>
          <label className="auth-field"><span>Email</span><div><Mail size={14} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="you@university.edu" autoComplete="email" autoFocus /></div></label>
          <button className="primary-button auth-primary" disabled={busy || !email.trim()} onClick={reset}>{busy ? <LoaderCircle className="spin" size={14} /> : <Mail size={14} />}{busy ? "Waiting for browser…" : "Send reset link"}</button>
          <div className="auth-links"><button onClick={() => setMode("password")}>Back to password sign-in</button></div>
        </>}

        {mode === "recovery" && <>
          <p className="auth-hint">The reset link is verified. Choose a new password for your account.</p>
          <label className="auth-field"><span>New password</span><div><LockKeyhole size={14} /><input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="At least 8 characters" autoComplete="new-password" autoFocus /></div></label>
          <label className="auth-field"><span>Confirm password</span><div><LockKeyhole size={14} /><input type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} placeholder="Repeat password" autoComplete="new-password" onKeyDown={(event) => { if (event.key === "Enter") savePassword(); }} /></div></label>
          <button className="primary-button auth-primary" disabled={busy} onClick={savePassword}>{busy ? <LoaderCircle className="spin" size={14} /> : <KeyRound size={14} />}{busy ? "Saving…" : "Save new password"}</button>
        </>}
      </div>

      <footer className="auth-footer">
        <button className="auth-skip" onClick={onClose}>Continue without an account</button>
        <span><ShieldCheck size={11} />By continuing you agree to the <button onClick={() => onOpenExternal("https://github.com/Johanson-colab/Archimedes/blob/main/docs/legal/terms.md")}>Terms</button> and <button onClick={() => onOpenExternal("https://github.com/Johanson-colab/Archimedes/blob/main/docs/legal/privacy.md")}>Privacy Policy</button>.</span>
      </footer>
    </section>
  </div>;
}
