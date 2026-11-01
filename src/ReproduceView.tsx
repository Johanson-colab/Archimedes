import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertCircle, Check, ChevronLeft, FlaskConical, LoaderCircle, Play, Plus, RefreshCw, Square, Trash2 } from "lucide-react";

import { InlineNotice } from "./InlineNotice";
import { StateView } from "./StateView";
const STATUS_LABELS: Record<ReproductionStatus, string> = {
  draft: "Draft",
  planned: "Plan ready",
  queued: "Queued",
  provisioning: "Building environment",
  running: "Running",
  diagnosing: "Diagnosing",
  "checks-passed": "Checkpoints passed",
  verified: "Verified",
  diverged: "Diverged",
  blocked: "Blocked",
  cancelled: "Cancelled",
};

const STATUS_TONE: Record<ReproductionStatus, string> = {
  draft: "idle",
  planned: "ready",
  queued: "waiting",
  provisioning: "working",
  running: "working",
  diagnosing: "warning",
  "checks-passed": "good",
  verified: "good",
  diverged: "warning",
  blocked: "bad",
  cancelled: "idle",
};

function formatWhen(value: string) {
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return "";
  const minutes = Math.round((Date.now() - time) / 60_000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function readable(value: unknown, fallback: string) {
  const message = value instanceof Error ? value.message : String(value ?? "");
  return message.replace(/^Error invoking remote method '[^']+':\s*/i, "").replace(/^Error:\s*/i, "").trim() || fallback;
}

function statusLabel(status: ReproductionCheckStatus) {
  if (status === "passed") return "passed";
  if (status === "failed") return "failed";
  if (status === "needs-run") return "needs run";
  if (status === "blocked") return "blocked";
  return "manual";
}

const RUN_STEP_LABELS: Record<ReproductionRunStepStatus, string> = {
  pending: "pending",
  passed: "passed",
  failed: "failed",
  manual: "manual",
  blocked: "blocked",
  stopped: "stopped",
};

const RUN_STEP_TONES: Record<ReproductionRunStepStatus, string> = {
  pending: "needs-run",
  passed: "passed",
  failed: "failed",
  manual: "manual",
  blocked: "blocked",
  stopped: "needs-run",
};

const RUN_LABELS: Record<ReproductionRunStatus, string> = {
  running: "Running",
  verified: "All checkpoints passed",
  failed: "Stopped at a failed checkpoint",
  blocked: "Blocked by a step the plan marks impossible",
  manual: "Stopped at a checkpoint only a person can confirm",
  stopped: "Stopped",
  timeout: "Ran out of time",
  interrupted: "Interrupted",
};

function stepDuration(step: ReproductionRunStep) {
  if (!step.duration_ms) return "";
  return step.duration_ms < 1000 ? `${step.duration_ms} ms` : `${(step.duration_ms / 1000).toFixed(1)} s`;
}

function preflightSummary(results: Record<string, { status: ReproductionCheckStatus }>) {
  const counts = { passed: 0, failed: 0, needsRun: 0, manual: 0 } as Record<string, number>;
  for (const entry of Object.values(results)) {
    if (entry.status === "passed") counts.passed += 1;
    else if (entry.status === "failed" || entry.status === "blocked") counts.failed += 1;
    else if (entry.status === "needs-run") counts.needsRun += 1;
    else counts.manual += 1;
  }
  return [
    counts.passed ? `${counts.passed} passed` : "",
    counts.failed ? `${counts.failed} failed` : "",
    counts.needsRun ? `${counts.needsRun} need a run` : "",
    counts.manual ? `${counts.manual} manual` : "",
  ].filter(Boolean).join(" · ");
}

function checkLabel(check: ReproductionStep["check"]) {
  if (check.kind === "manual") return check.reason;
  if (check.kind === "file_exists") return `${check.path} exists`;
  if (check.kind === "file_contains") return `${check.path} matches ${check.pattern}`;
  if (check.kind === "command") return `${check.command} exits 0`;
  return `${check.url} returns ${check.status}`;
}

function expectedLabel(claim: ReproductionClaim) {
  if (claim.expected === null) return "no reported value";
  return `${claim.expected}${claim.unit ? ` ${claim.unit}` : ""}`;
}

export default function ReproduceView({ bridge, selectedId, onSelect }: {
  bridge: ResearchDeskBridge;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}) {
  const [items, setItems] = useState<Reproduction[]>([]);
  const [detail, setDetail] = useState<Reproduction | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"plan" | "approve" | "delete" | "create" | "run" | "stop" | "">("");
  const [error, setError] = useState("");
  const [planStatus, setPlanStatus] = useState("");
  const [openClaim, setOpenClaim] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<Record<string, { status: ReproductionCheckStatus; detail: string }> | null>(null);
  const [checking, setChecking] = useState(false);
  const [run, setRun] = useState<ReproductionRun | null>(null);
  const [runSteps, setRunSteps] = useState<Record<string, ReproductionRunStep>>({});
  const [liveLog, setLiveLog] = useState("");
  const [running, setRunning] = useState(false);
  const [runLine, setRunLine] = useState("");
  const logRef = useRef<HTMLPreElement | null>(null);

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [liveLog]);

  const [picking, setPicking] = useState(false);
  const [libraries, setLibraries] = useState<ResearchLibrary[]>([]);
  const [libraryId, setLibraryId] = useState("");
  const [query, setQuery] = useState("");
  const [papers, setPapers] = useState<LibraryPaper[]>([]);
  const [pickerLoading, setPickerLoading] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await bridge.listReproductions();
      setItems(next);
      setError("");
    } catch (loadError) {
      setError(readable(loadError, "Could not load reproductions."));
    } finally {
      setLoading(false);
    }
  }, [bridge]);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    const off = bridge.onReproductionPlanEvent?.((payload) => {
      if (payload?.detail) setPlanStatus(payload.detail);
    });
    return () => off?.();
  }, [bridge]);

  useEffect(() => {
    const off = bridge.onReproductionRunEvent?.((payload) => {
      if (!payload?.reproductionId || payload.reproductionId !== selectedId) return;
      if (payload.type === "preparing" || payload.type === "started" || payload.type === "error") {
        if (payload.detail) setRunLine(payload.detail);
        return;
      }
      if (payload.type === "output" && payload.chunk) {
        setLiveLog((current) => (current + payload.chunk).slice(-200_000));
        return;
      }
      if (payload.type === "step" && payload.step?.id) {
        const step = payload.step as ReproductionRunStep;
        setRunSteps((current) => ({ ...current, [step.id]: step }));
        return;
      }
      if (payload.type === "finished") {
        setRunning(false);
        setRunLine(payload.summary || "");
        void bridge.getReproduction(selectedId).then((record) => {
          if (!record) return;
          setDetail(record);
          setRun(record.run ?? null);
        }).catch(() => {});
        void refresh();
      }
    });
    return () => off?.();
  }, [bridge, refresh, selectedId]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    let cancelled = false;
    void bridge.getReproduction(selectedId).then((record) => {
      if (cancelled) return;
      setDetail(record);
      setPreflight(null);
      const previous = record?.run ?? null;
      setRun(previous);
      setRunSteps(Object.fromEntries((previous?.steps ?? []).map((entry) => [entry.id, entry])));
      setLiveLog(previous?.log ?? "");
      setRunning(previous?.status === "running");
      setRunLine("");
    }).catch((detailError) => { if (!cancelled) setError(readable(detailError, "Could not open this reproduction.")); });
    return () => { cancelled = true; };
  }, [bridge, selectedId]);

  const openPicker = useCallback(async () => {
    setPicking(true);
    setError("");
    try {
      const list = await bridge.listLibraries();
      setLibraries(list);
      setLibraryId((current) => current || list[0]?.id || "");
    } catch (pickerError) {
      setError(readable(pickerError, "Could not load libraries."));
    }
  }, [bridge]);

  useEffect(() => {
    if (!picking || !libraryId) { setPapers([]); return; }
    let cancelled = false;
    setPickerLoading(true);
    const timer = setTimeout(() => {
      void bridge.listLibraryPapers(libraryId, query.trim()).then((list) => {
        if (!cancelled) setPapers(list.slice(0, 30));
      }).catch(() => { if (!cancelled) setPapers([]); }).finally(() => { if (!cancelled) setPickerLoading(false); });
    }, 220);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [bridge, libraryId, picking, query]);

  const create = useCallback(async (paper: LibraryPaper) => {
    setBusy("create");
    setError("");
    try {
      const record = await bridge.createReproduction({ paperId: paper.id, repoUrl: paper.github_url || paper.url || "", title: paper.title });
      setPicking(false);
      setQuery("");
      await refresh();
      onSelect(record.id);
    } catch (createError) {
      setError(readable(createError, "Could not start a reproduction."));
    } finally {
      setBusy("");
    }
  }, [bridge, onSelect, refresh]);

  const plan = useCallback(async () => {
    if (!detail) return;
    setBusy("plan");
    setError("");
    setPlanStatus("Starting…");
    try {
      const next = await bridge.planReproduction(detail.id);
      setDetail(next);
      await refresh();
    } catch (planError) {
      setError(readable(planError, "The plan could not be generated."));
      const next = await bridge.getReproduction(detail.id).catch(() => null);
      if (next) setDetail(next);
    } finally {
      setBusy("");
      setPlanStatus("");
    }
  }, [bridge, detail, refresh]);

  const checkFiles = useCallback(async () => {
    if (!detail) return;
    setChecking(true);
    setError("");
    try {
      const result = await bridge.preflightReproduction(detail.id);
      setPreflight(Object.fromEntries(result.results.map((entry) => [entry.id, { status: entry.status, detail: entry.detail }])));
    } catch (checkError) {
      setError(readable(checkError, "Could not check the repository."));
    } finally {
      setChecking(false);
    }
  }, [bridge, detail]);

  const startRun = useCallback(async () => {
    if (!detail) return;
    setBusy("run");
    setError("");
    setRunLine("Starting…");
    setLiveLog("");
    setRunSteps({});
    try {
      const next = await bridge.runReproduction(detail.id);
      setDetail(next);
      setRun(next.run ?? null);
      setRunning(true);
    } catch (runError) {
      setError(readable(runError, "The runbook could not start."));
      setRunning(false);
      setRunLine("");
    } finally {
      setBusy("");
    }
  }, [bridge, detail]);

  const stopRun = useCallback(async () => {
    if (!detail) return;
    setBusy("stop");
    try {
      await bridge.stopReproduction(detail.id);
      setRunLine("Stopping…");
    } catch (stopError) {
      setError(readable(stopError, "The run could not be stopped."));
    } finally {
      setBusy("");
    }
  }, [bridge, detail]);

  const approve = useCallback(async () => {
    if (!detail?.contract) return;
    setBusy("approve");
    setError("");
    try {
      const next = await bridge.updateReproduction(detail.id, {
        status: "queued",
        contract: { ...detail.contract, frozen_at: new Date().toISOString() },
      });
      setDetail(next);
      await refresh();
    } catch (approveError) {
      setError(readable(approveError, "The contract could not be approved."));
    } finally {
      setBusy("");
    }
  }, [bridge, detail, refresh]);

  const remove = useCallback(async () => {
    if (!detail) return;
    setBusy("delete");
    try {
      await bridge.deleteReproduction(detail.id);
      onSelect(null);
      await refresh();
    } catch (deleteError) {
      setError(readable(deleteError, "Could not delete this reproduction."));
    } finally {
      setBusy("");
    }
  }, [bridge, detail, onSelect, refresh]);

  const activeCount = useMemo(() => items.filter((item) => ["queued", "provisioning", "running", "diagnosing"].includes(item.status)).length, [items]);

  if (selectedId) {
    if (!detail) {
      return <section className="reproduce-page">
        <StateView tone="loading" className="reproduce-empty" icon={<LoaderCircle className="spin" size={20} />} description="Opening reproduction…" />
      </section>;
    }
    const contract = detail.contract;
    return <section className="reproduce-page">
      <header className="reproduce-header">
        <button className="reproduce-back" onClick={() => onSelect(null)}><ChevronLeft size={15} />Reproduce</button>
        <h1>{detail.title}</h1>
        <span className={`reproduce-status ${STATUS_TONE[detail.status]}`}>{STATUS_LABELS[detail.status]}</span>
        <div className="reproduce-header-actions">
          <button className="quiet-icon-button" title="Delete" disabled={busy !== ""} onClick={() => void remove()}><Trash2 size={14} /></button>
        </div>
      </header>

      {error && <InlineNotice tone="danger" className="library-error">{error}</InlineNotice>}

      {!contract ? <div className="reproduce-blank">
        <FlaskConical size={26} />
        <strong>No plan yet</strong>
        <span>The planner reads the paper and its code to work out which numbers can be checked independently. It never touches a machine.</span>
        {detail.error && <div className="reproduce-note bad">{detail.error}</div>}
        <button className="primary-button" disabled={busy !== ""} onClick={() => void plan()}>
          {busy === "plan" ? <LoaderCircle className="spin" size={14} /> : <FlaskConical size={14} />}
          {busy === "plan" ? "Planning…" : "Generate plan"}
        </button>
        {busy === "plan" && planStatus && <span className="reproduce-hint">{planStatus}</span>}
      </div> : <>
        <div className="reproduce-summary">
          <p>{contract.summary}</p>
          <div className="reproduce-facts">
            <span className="reproduce-fact">{contract.claims.length} claims</span>
            <span className={`reproduce-fact ${contract.entrypoint.command ? "ok" : "warn"}`}>{contract.entrypoint.command ? "entrypoint found" : "no entrypoint"}</span>
            <span className="reproduce-fact">{contract.repo.commit ? contract.repo.commit.slice(0, 7) : "no commit"}</span>
            <span className="reproduce-fact">{detail.budget.wallClockMin} min</span>
          </div>
        </div>

        <section className="reproduce-block">
          <h2>Runbook
            {contract.repo.url || detail.repo_url
              ? <button className="reproduce-preflight" disabled={checking} onClick={() => void checkFiles()}>
                  {checking ? <LoaderCircle className="spin" size={11} /> : <RefreshCw size={11} />}
                  {checking ? "Checking…" : "Check files"}
                </button>
              : null}
          </h2>
          {preflight && <p className="reproduce-preflight-summary">{preflightSummary(preflight)}</p>}
          <ol className="reproduce-runbook">
            {(contract.steps ?? []).map((step, index) => {
              // A checkpoint nobody has evaluated is not a green tick: it is a
              // statement of what will be checked. Only a real verdict colours it.
              const verdict = runSteps[step.id]?.status ?? preflight?.[step.id]?.status ?? "";
              const tone = verdict === "passed" ? "" : verdict === "manual" || step.check.kind === "manual" ? " manual" : verdict ? " bad" : " idle";
              const VerdictIcon = verdict === "failed" || verdict === "blocked" || verdict === "manual" || step.check.kind === "manual" ? AlertCircle : Check;
              return <li className={`reproduce-step${step.blocked ? " blocked" : ""}`} key={step.id}>
              <span className="reproduce-step-index" aria-hidden="true">{index + 1}</span>
              <div className="reproduce-step-body">
                <div className="reproduce-step-head">
                  <strong>{step.title}</strong>
                  {runSteps[step.id]
                    ? <span className={`reproduce-check-status ${RUN_STEP_TONES[runSteps[step.id].status]}`}>{RUN_STEP_LABELS[runSteps[step.id].status]}</span>
                    : preflight?.[step.id] ? <span className={`reproduce-check-status ${preflight[step.id].status}`}>{statusLabel(preflight[step.id].status)}</span> : null}
                  {step.blocked && <span className="reproduce-tag warn">blocked</span>}
                </div>
                {step.detail && <p className="reproduce-step-detail">{step.detail}</p>}
                {step.command && <pre className="reproduce-step-command">{step.command}</pre>}
                {(step.checkpoint || step.check) && <p className={`reproduce-checkpoint${tone}`}>
                  <VerdictIcon size={11} />
                  <span>{step.checkpoint || checkLabel(step.check)}</span>
                  <span className="reproduce-check-kind">{step.check.kind === "manual" ? "manual" : step.check.kind.replace("_", " ")}</span>
                </p>}
                {step.source && <p className="reproduce-hint">from {step.source}</p>}
                {step.blocked && <p className="reproduce-hint warn">{step.blocked}</p>}
                {preflight?.[step.id]?.detail && preflight[step.id].status === "failed" && <p className="reproduce-hint bad">{preflight[step.id].detail}</p>}
                {runSteps[step.id]?.detail && <p className="reproduce-hint bad">{runSteps[step.id].detail}</p>}
                {runSteps[step.id] && (runSteps[step.id].exit_code !== null || runSteps[step.id].duration_ms > 0) && <p className="reproduce-hint">
                  {[runSteps[step.id].exit_code !== null ? `exit ${runSteps[step.id].exit_code}` : "", stepDuration(runSteps[step.id])].filter(Boolean).join(" · ")}
                </p>}
              </div>
            </li>;
            })}
          </ol>
        </section>

        {(run || running || runLine) && <section className="reproduce-block reproduce-run">
          <h2>Run
            {run && <span className={`reproduce-check-status ${run.status === "verified" ? "passed" : run.status === "running" ? "needs-run" : "failed"}`}>{RUN_LABELS[run.status]}</span>}
          </h2>
          {run?.backend && <p className="reproduce-hint">{run.backend}</p>}
          {runLine && <p className="reproduce-hint">{runLine}</p>}
          {(liveLog || running) && <pre className="reproduce-log" ref={logRef}>{liveLog || "Waiting for output…"}</pre>}
        </section>}

        <section className="reproduce-block">
          <h2>Numbers this runbook should produce</h2>
          <ol className="reproduce-claim-list">
            {(contract.claims ?? []).map((claim, index) => {
              const open = openClaim === claim.id;
              const where = [claim.evidence.table, claim.evidence.page ? `p. ${claim.evidence.page}` : ""].filter(Boolean).join(" · ");
              return <li className={open ? "open" : ""} key={claim.id}>
                <button className="reproduce-claim-row" aria-expanded={open} onClick={() => setOpenClaim(open ? null : claim.id)}>
                  <span className="reproduce-claim-index">{index + 1}</span>
                  <span className="reproduce-claim-text">{claim.statement}</span>
                  <span className="reproduce-claim-value">{expectedLabel(claim)}</span>
                </button>
                <div className="reproduce-claim-sub">
                  <span>{claim.dataset ? claim.dataset.split(/\s*\(/)[0].trim() : claim.metric}</span>
                  {where && <span>{where}</span>}
                  <span>±{Math.round(claim.tolerance * 1000) / 10}%</span>
                </div>
                {open && <div className="reproduce-claim-detail">
                  {claim.metric && <p><b>Metric</b> {claim.metric}</p>}
                  {(claim.evidence.row || claim.evidence.column) && <p><b>Where</b> {[claim.evidence.row, claim.evidence.column].filter(Boolean).join(" · ")}</p>}
                  {claim.evidence.quote && <blockquote>{claim.evidence.quote}</blockquote>}
                </div>}
              </li>;
            })}
          </ol>
        </section>

        <div className="reproduce-grid">
          <section>
            <h2>Entrypoint <span className={`reproduce-tag ${contract.entrypoint.command ? "ok" : "warn"}`}>{contract.entrypoint.command ? "found" : "missing"}</span></h2>
            {contract.entrypoint.command
              ? <pre>{contract.entrypoint.command}</pre>
              : <p className="reproduce-hint">No command in the paper or the repository produces these numbers.</p>}
            {contract.entrypoint.evidence.length > 0 && <ul className="reproduce-evidence">
              {contract.entrypoint.evidence.map((entry) => <li key={entry.path}><code>{entry.path}</code>{entry.line_count ? ` · ${entry.line_count} lines` : ""}</li>)}
            </ul>}
            {contract.entrypoint.unverified.length > 0 && <p className="reproduce-hint warn">Not in the repository: {contract.entrypoint.unverified.join(", ")}</p>}
            {contract.entrypoint.outputs.length > 0 && <p className="reproduce-hint">Writes {contract.entrypoint.outputs.join(", ")}</p>}
          </section>
          <section>
            <h2>Environment <span className={`reproduce-tag ${contract.environment.install.length || contract.environment.python ? "ok" : "warn"}`}>{contract.environment.install.length || contract.environment.python ? "found" : "missing"}</span></h2>
            <ul className="reproduce-env">
              {contract.environment.python && <li>Python {contract.environment.python}</li>}
              {contract.environment.cuda && <li>CUDA {contract.environment.cuda}</li>}
              {contract.environment.install.map((step) => <li key={step}><code>{step}</code></li>)}
              {contract.environment.source && <li className="reproduce-hint">from {contract.environment.source}</li>}
              {!contract.environment.python && !contract.environment.cuda && !contract.environment.install.length && <li className="reproduce-hint">Not identified in the paper or repository.</li>}
            </ul>
          </section>
        </div>

        <footer className="reproduce-footer">
          <button className="secondary-button" disabled={busy !== "" || running} onClick={() => void plan()}>
            {busy === "plan" ? <LoaderCircle className="spin" size={14} /> : <RefreshCw size={14} />}Re-plan
          </button>
          {contract.frozen_at
            ? running
              ? <button className="secondary-button" disabled={busy !== ""} onClick={() => void stopRun()}>
                  {busy === "stop" ? <LoaderCircle className="spin" size={14} /> : <Square size={13} />}Stop
                </button>
              : <button className="primary-button" disabled={busy !== ""} onClick={() => void startRun()}>
                  {busy === "run" ? <LoaderCircle className="spin" size={14} /> : <Play size={14} />}Run runbook
                </button>
            : <button className="primary-button" disabled={busy !== ""} onClick={() => void approve()}>
                <FlaskConical size={14} />Approve and queue
              </button>}
        </footer>
        {contract.frozen_at && !running && run?.status === "verified" && <p className="reproduce-hint reproduce-queued">Every checkpoint passed. Comparing the reported numbers is the next milestone.</p>}
      </>}
    </section>;
  }

  return <section className="reproduce-page">
    <header className="reproduce-header">
      <FlaskConical size={18} />
      <h1>Reproduce</h1>
      {activeCount > 0 && <span className="reproduce-status working">{activeCount} active</span>}
      <div className="reproduce-header-actions">
        <button className="secondary-button" onClick={() => void openPicker()}><Plus size={14} />New</button>
      </div>
    </header>

    {error && <InlineNotice tone="danger" className="library-error">{error}</InlineNotice>}

    {picking && <div className="reproduce-picker">
      <div className="reproduce-picker-bar">
        <select value={libraryId} onChange={(event) => setLibraryId(event.target.value)}>
          {libraries.map((library) => <option key={library.id} value={library.id}>{library.name}</option>)}
        </select>
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search this library…" />
        <button className="quiet-icon-button" onClick={() => setPicking(false)}>Cancel</button>
      </div>
      <div className="reproduce-picker-list">
        {pickerLoading && <StateView tone="loading" compact className="reproduce-empty" icon={<LoaderCircle className="spin" size={16} />} />}
        {!pickerLoading && !papers.length && <StateView compact className="reproduce-empty" description="No paper matches. Import it into a library first." />}
        {papers.map((paper) => <button key={paper.id} className="reproduce-picker-row" disabled={busy !== ""} onClick={() => void create(paper)}>
          <span>{paper.title}</span>
          <small>{paper.year || ""} {paper.github_url ? "· GitHub" : ""}</small>
        </button>)}
      </div>
    </div>}

    {loading ? <StateView tone="loading" className="reproduce-empty" icon={<LoaderCircle className="spin" size={20} />} description="Loading…" />
      : !items.length ? <StateView
          className="reproduce-empty"
          icon={<FlaskConical size={26} />}
          title="No reproductions yet"
          description="Open a paper and choose Reproduce, or start from a paper in your library."
          action={<button className="secondary-button" onClick={() => void openPicker()}><Plus size={14} />New</button>}
        />
      : <div className="reproduce-list">{items.map((item) => <button className="reproduce-row" key={item.id} onClick={() => onSelect(item.id)}>
          <span className={`reproduce-dot ${STATUS_TONE[item.status]}`} aria-hidden="true" />
          <span className="reproduce-row-main">
            <strong>{item.title}</strong>
            <small>{STATUS_LABELS[item.status]}{item.contract ? ` · ${item.contract.claims.length} claims` : ""}{item.error ? ` · ${item.error}` : ""}</small>
          </span>
          <span className="reproduce-row-time">{formatWhen(item.updated_at)}</span>
        </button>)}</div>}
  </section>;
}
