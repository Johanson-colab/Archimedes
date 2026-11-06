import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, KeyRound, LoaderCircle, X } from "lucide-react";

import { Dialog } from "./Dialog";

// A dataset path is not a secret and should be readable while typing; a token
// should not sit in plain sight on a shared screen.
function isSecretName(name: string) {
  return /(API_?KEY|TOKEN|SECRET|PASSWORD|CREDENTIAL)/i.test(name);
}

function readable(value: unknown, fallback: string) {
  const message = value instanceof Error ? value.message : String(value ?? "");
  return message.replace(/^Error invoking remote method '[^']+':\s*/i, "").replace(/^Error:\s*/i, "").trim() || fallback;
}

/**
 * API keys and tokens for one reproduction.
 *
 * Values are write-only over IPC: the renderer learns whether a name is set,
 * never what it is. The run sources them into the command's environment, so the
 * agent can use a key without ever seeing it.
 *
 * Required variables are shown. Everything else has a working default and stays
 * collapsed: eight rows with the same visual weight read as eight demands.
 */
export function ReproductionEnvironmentDialog({
  bridge,
  reproductionId,
  open,
  onClose,
  running,
}: {
  bridge: ResearchDeskBridge;
  reproductionId: string;
  open: boolean;
  onClose: () => void;
  running: boolean;
}) {
  const [items, setItems] = useState<ReproductionEnvItem[]>([]);
  const [values, setValues] = useState<Record<string, string>>({});
  const [draft, setDraft] = useState({ name: "", value: "" });
  const [showOptional, setShowOptional] = useState(false);
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [tests, setTests] = useState<Record<string, { state: "busy" | "ok" | "error"; text: string }>>({});

  useEffect(() => {
    if (!open) return;
    setError("");
    setValues({});
    setDraft({ name: "", value: "" });
    setTests({});
    setShowOptional(false);
    setLoading(true);
    void bridge.listReproductionEnv(reproductionId)
      .then(setItems)
      .catch((loadError) => setError(readable(loadError, "Could not load the environment.")))
      .finally(() => setLoading(false));
  }, [bridge, open, reproductionId]);

  const save = async (name: string, value: string) => {
    if (!value) { setError("Enter a value before saving."); return; }
    setBusy(name);
    try {
      setItems(await bridge.setReproductionEnv(reproductionId, name, value));
      setValues((current) => ({ ...current, [name]: "" }));
      setError("");
    } catch (saveError) {
      setError(readable(saveError, "The value could not be saved."));
    } finally {
      setBusy("");
    }
  };

  const clear = async (name: string) => {
    setBusy(name);
    try {
      setItems(await bridge.removeReproductionEnv(reproductionId, name));
      setError("");
    } catch (clearError) {
      setError(readable(clearError, "The value could not be removed."));
    } finally {
      setBusy("");
    }
  };

  const testToken = async (name: string) => {
    setTests((current) => ({ ...current, [name]: { state: "busy", text: "Testing…" } }));
    try {
      const result = await bridge.testReproductionEnv(reproductionId, name);
      if (!result.ok) {
        setTests((current) => ({ ...current, [name]: { state: "error", text: result.detail || "The token was rejected." } }));
        return;
      }
      const parts = [result.token || "token", result.role, result.user ? `user: ${result.user}` : ""].filter(Boolean);
      setTests((current) => ({ ...current, [name]: { state: "ok", text: `Valid · ${parts.join(" · ")}` } }));
    } catch (testError) {
      setTests((current) => ({ ...current, [name]: { state: "error", text: readable(testError, "The token could not be tested.") } }));
    }
  };

  const add = async () => {
    const name = draft.name.trim().toUpperCase();
    if (!name) { setError("A variable needs a name, for example HF_TOKEN."); return; }
    if (!draft.value) { setError("Enter a value for the new variable."); return; }
    setBusy("__new");
    try {
      setItems(await bridge.setReproductionEnv(reproductionId, name, draft.value));
      setDraft({ name: "", value: "" });
      setError("");
    } catch (addError) {
      setError(readable(addError, "The variable could not be added."));
    } finally {
      setBusy("");
    }
  };

  const required = items.filter((item) => item.required);
  const optional = items.filter((item) => !item.required && item.source !== "added by you");
  const added = items.filter((item) => !item.required && item.source === "added by you");

  const renderRow = (item: ReproductionEnvItem) => <div className="reproduce-env-row" key={item.name}>
    <div className="reproduce-env-meta">
      <code>{item.name}</code>
      <span>
        {item.required && <span className="reproduce-tag warn">required</span>}
        <span className={`reproduce-check-status ${item.hasValue ? "passed" : item.required ? "manual" : "needs-run"}`}>{item.hasValue ? "set" : "missing"}</span>
      </span>
      {item.reason && <small title={`${item.reason}${item.source ? ` · ${item.source}` : ""}`}>{item.reason}{item.source ? ` · ${item.source}` : ""}</small>}
    </div>
    <div className="reproduce-env-controls">
      <input
        type={isSecretName(item.name) ? "password" : "text"}
        autoComplete="off"
        spellCheck={false}
        className="reproduce-env-input"
        placeholder={item.hasValue ? "saved" : "value"}
        aria-label={`${item.name} value`}
        value={values[item.name] || ""}
        onChange={(event) => {
          const value = event.target.value;
          setValues((current) => ({ ...current, [item.name]: value }));
          setTests((current) => {
            if (!current[item.name]) return current;
            const next = { ...current };
            delete next[item.name];
            return next;
          });
        }}
        onKeyDown={(event) => { if (event.key === "Enter") void save(item.name, values[item.name] || ""); }}
      />
      <button className="secondary-button" disabled={busy !== "" || !(values[item.name] || "")} onClick={() => void save(item.name, values[item.name] || "")}>
        {busy === item.name ? <LoaderCircle className="spin" size={13} /> : null}Save
      </button>
      {item.hasValue && <button className="quiet-icon-button" disabled={busy !== ""} onClick={() => void clear(item.name)} aria-label={`Remove ${item.name}`}><X size={13} /></button>}
      {item.name === "HF_TOKEN" && item.hasValue && <button
        className="reproduce-env-test-button"
        disabled={tests[item.name]?.state === "busy"}
        onClick={() => void testToken(item.name)}
      >Test</button>}
    </div>
    {tests[item.name] && <p className={`reproduce-env-test ${tests[item.name].state}`}>{tests[item.name].text}</p>}
  </div>;

  return <Dialog open={open} onClose={onClose} size="md" ariaLabel="Environment">
    <header className="app-dialog-header">
      <div>
        <h2><KeyRound size={16} />Environment</h2>
        <p>Only the required variables block the run. Everything else has a working default. Values stay encrypted on this Mac; the agent only sees whether a name is set.</p>
      </div>
      <button className="app-dialog-close" onClick={onClose} aria-label="Close"><X size={15} /></button>
    </header>

    <div className="app-dialog-body">
      {error && <p className="reproduce-env-error">{error}</p>}
      {running && <p className="reproduce-env-hint">This run already started. Changes apply to the next run.</p>}
      {loading && <p className="reproduce-env-hint"><LoaderCircle className="spin" size={12} /> Loading…</p>}

      {!loading && !items.length && <p className="reproduce-env-hint">The plan did not ask for any values. Add one below if the repository needs it.</p>}

      {!loading && items.length > 0 && <p className="reproduce-env-summary">
        {required.length} required · {optional.length} optional{added.length ? ` · ${added.length} added by you` : ""}
      </p>}

      {required.length > 0 && <div className="reproduce-env-group">
        {required.map(renderRow)}
      </div>}

      {optional.length > 0 && <>
        <button className="reproduce-env-toggle" onClick={() => setShowOptional((current) => !current)} aria-expanded={showOptional}>
          {showOptional ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          {showOptional ? "Hide" : "Show"} {optional.length} optional variable{optional.length === 1 ? "" : "s"}
        </button>
        {showOptional && <div className="reproduce-env-group">{optional.map(renderRow)}</div>}
      </>}

      {added.length > 0 && <>
        <h3 className="reproduce-env-heading">Added by you</h3>
        <div className="reproduce-env-group">{added.map(renderRow)}</div>
      </>}

      <div className="reproduce-env-add">
        <input
          className="reproduce-env-input reproduce-env-name"
          placeholder="NAME"
          aria-label="New variable name"
          value={draft.name}
          onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value.toUpperCase() }))}
        />
        <input
          type="password"
          autoComplete="off"
          spellCheck={false}
          className="reproduce-env-input"
          placeholder="value"
          aria-label="New variable value"
          value={draft.value}
          onChange={(event) => setDraft((current) => ({ ...current, value: event.target.value }))}
          onKeyDown={(event) => { if (event.key === "Enter") void add(); }}
        />
        <button className="secondary-button" disabled={busy !== ""} onClick={() => void add()}>
          {busy === "__new" ? <LoaderCircle className="spin" size={13} /> : null}Add variable
        </button>
      </div>
    </div>
  </Dialog>;
}
