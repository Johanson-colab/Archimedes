import { useEffect, useState } from "react";
import { KeyRound, LoaderCircle, X } from "lucide-react";

import { Dialog } from "./Dialog";

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
  const [busy, setBusy] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setError("");
    setValues({});
    setDraft({ name: "", value: "" });
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

  return <Dialog open={open} onClose={onClose} size="md" ariaLabel="Environment">
    <header className="app-dialog-header">
      <div>
        <h2><KeyRound size={16} />Environment</h2>
        <p>API keys and tokens injected into every command. Values stay encrypted on this Mac; the agent only sees whether a name is set.</p>
      </div>
      <button className="app-dialog-close" onClick={onClose} aria-label="Close"><X size={15} /></button>
    </header>

    <div className="app-dialog-body">
      {error && <p className="reproduce-env-error">{error}</p>}
      {running && <p className="reproduce-env-hint">This run already started. Changes apply to the next run.</p>}
      {loading && <p className="reproduce-env-hint"><LoaderCircle className="spin" size={12} /> Loading…</p>}

      {!loading && !items.length && <p className="reproduce-env-hint">The plan did not ask for any keys. Add one below if the repository needs it.</p>}

      <div className="reproduce-env-list">
        {items.map((item) => <div className="reproduce-env-row" key={item.name}>
          <div className="reproduce-env-meta">
            <code>{item.name}</code>
            <span>
              {item.required && <span className="reproduce-tag warn">required</span>}
              <span className={`reproduce-check-status ${item.hasValue ? "passed" : "manual"}`}>{item.hasValue ? "set" : "missing"}</span>
            </span>
            {item.reason && <small>{item.reason}{item.source ? ` · ${item.source}` : ""}</small>}
          </div>
          <div className="reproduce-env-controls">
            <input
              type="password"
              autoComplete="off"
              spellCheck={false}
              className="reproduce-env-input"
              placeholder={item.hasValue ? "•••••• saved" : "value"}
              aria-label={`${item.name} value`}
              value={values[item.name] || ""}
              onChange={(event) => setValues((current) => ({ ...current, [item.name]: event.target.value }))}
              onKeyDown={(event) => { if (event.key === "Enter") void save(item.name, values[item.name] || ""); }}
            />
            <button className="secondary-button" disabled={busy !== "" || !(values[item.name] || "")} onClick={() => void save(item.name, values[item.name] || "")}>
              {busy === item.name ? <LoaderCircle className="spin" size={13} /> : null}Save
            </button>
            {item.hasValue && <button className="quiet-icon-button" disabled={busy !== ""} onClick={() => void clear(item.name)} aria-label={`Remove ${item.name}`}><X size={13} /></button>}
          </div>
        </div>)}
      </div>

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
