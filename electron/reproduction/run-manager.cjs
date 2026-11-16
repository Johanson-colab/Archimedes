const { runPilot: defaultPilot } = require("./pilot.cjs");
const { freshContract, initialSnapshot, planVersion } = require("./run-snapshot.cjs");
const { canonicalWorkspace } = require("../workspace-context.cjs");

function stopped(signal) {
  if (signal.aborted) throw Object.assign(new Error(String(signal.reason?.message || "Stopped by the user.")), { name: "AbortError" });
}

/** One owner, controller, store lease and finalizer from provisioning to disposal. */
function createReproductionRunManager({ store, runPilot = defaultPilot, complete, environmentItems = () => [], notify = () => {}, recoverResource = async () => {} }) {
  const active = new Map(), recovered = new Set(), recovering = new Set(), recoveryJobs = new Map();
  let closing = false;
  const key = (owner, id) => owner.runtimeThreadId(`reproduction:${id}`);

  function start({ record, backendKind, repoName, send, prepare, completion = complete }) {
    if (closing) throw new Error("The app is closing. Start this run after reopening.");
    const owner = store.currentStore(), identity = key(owner, record.id);
    if (active.has(identity)) throw new Error("This reproduction is already running.");
    const lease = owner.captureStore(), controller = new AbortController();
    let run, ownerToken;
    const contract = freshContract(record.contract);
    let reader, requirements;
    try {
      reader = record.paper_id ? owner.getPaperReader(record.paper_id, record.project_id) : null;
      requirements = environmentItems(record.id, owner);
      ({ run, ownerToken } = owner.startReproductionRun({ reproductionId: record.id, backend: backendKind, contract,
        snapshot: initialSnapshot(record, owner, { backend: backendKind, reader, requirements }) }));
    }
    catch (error) { lease.release(); throw error; }
    const session = { record, run, repoName, store: owner, ownerToken, controller, backend: null, contract, resource: null, disposal: null,
      send: payload => send({ reproductionId: record.id, runId: run.id, ...payload }),
      async stage(operation) { stopped(controller.signal); const result = await operation(controller.signal); stopped(controller.signal); return result; },
      adoptBackend(factory) {
        stopped(controller.signal);
        session.backend = factory();
        const resource = session.backend.resource?.();
        session.resource = resource ? { ...resource, dataRoot: owner.workspace } : null;
        if (session.resource) owner.setReproductionResource(run.id, session.resource);
        return session.backend;
      },
      dispose() {
        if (!session.disposal) session.disposal = (async () => {
          if (!session.backend) return;
          try {
            await session.backend.dispose();
            if (session.resource) owner.setReproductionResource(run.id, { ...session.resource, releasedAt: new Date().toISOString() });
          } catch (error) {
            if (session.resource) owner.setReproductionResource(run.id, { ...session.resource, cleanupError: error.message });
            return `Resource cleanup could not finish: ${error.message}`;
          }
        })();
        return session.disposal;
      },
    };
    active.set(identity, session);
    session.done = owner.run(async () => {
      let outcome = { status: "failed", steps: [], runbook: [], findings: [], log: "", summary: "The run could not start." };
      try {
        const prepared = await session.stage(signal => prepare(session, signal));
        owner.updateReproductionRunSnapshot(run.id, { prepared: { at: new Date().toISOString(),
          checkout: prepared?.checkout || null, image: session.backend.image || null, backend: session.backend.describe?.() || backendKind } });
        owner.updateReproduction(record.id, { status: "running" });
        session.send({ type: "attempt", attempt: 1 });
        session.send({ type: "started", detail: session.backend.describe?.() || "" });
        outcome = await runPilot({ title: record.title, summary: session.contract.summary, claims: session.contract.claims, repo: session.contract.repo, notes: session.contract.notes,
          steps: session.contract.steps, findings: session.contract.findings || [], repoName: session.repoName,
          paper: { title: record.title, text: (reader?.pages || []).map(page => `[page ${page.page_number}]\n${page.text || ""}`).join("\n\n").slice(0, 400_000) },
          env: requirements.map(({ name, required, reason, hasValue }) => ({ name, required, reason, hasValue })),
          backend: session.backend, target: session.backend.describe?.() || "", complete: completion, emit: session.send, signal: controller.signal, outputToken: run.id,
          budgetMs: Math.max(1, Number(record.budget?.wallClockMin) || 45) * 60_000,
          onRunbook: (steps, findings) => { session.contract = { ...session.contract, steps, findings }; owner.updateReproduction(record.id, { contract: session.contract }); },
        });
      } catch (error) { outcome = { ...outcome, status: controller.signal.aborted ? "stopped" : "failed", summary: error.message || "The run failed." }; }
      try {
        if (controller.signal.aborted) outcome = { ...outcome, status: "stopped", summary: String(controller.signal.reason?.message || "Stopped by the user.") };
        if (session.resource && outcome.logs?.length) session.resource = { ...session.resource, logs: outcome.logs };
        const cleanup = await session.dispose();
        const status = outcome.status || "failed";
        const summary = [outcome.summary || "The run stopped.", cleanup].filter(Boolean).join("\n");
        const contract = { ...session.contract, steps: outcome.runbook?.length ? outcome.runbook : session.contract.steps, findings: outcome.findings?.length ? outcome.findings : session.contract.findings || [] };
        owner.updateReproductionRunSnapshot(run.id, { final: { planVersion: planVersion(contract), runbook: contract.steps,
          findings: contract.findings, steps: outcome.steps || [], logs: outcome.logs || [], status, summary,
          finishedAt: new Date().toISOString() } });
        owner.updateReproductionRun(run.id, { status, steps: outcome.steps || [], log: outcome.log || "", error: status === "verified" && !cleanup ? "" : summary, finishedAt: new Date().toISOString() });
        owner.updateReproduction(record.id, { contract, status: status === "verified" ? "checks-passed" : status === "stopped" ? "cancelled" : "blocked", error: status === "verified" && !cleanup ? "" : summary });
        session.send({ type: "finished", status, summary, question: status === "manual" ? outcome.summary : "" });
        if (status !== "stopped") notify(record, summary);
        return outcome;
      } finally { active.delete(identity); lease.release(); }
    });
    // The renderer gets a run immediately; the main process owns completion.
    session.done.catch(() => {});
    return session;
  }

  function stop(id, reason = "Stopped by the user.") {
    const session = active.get(key(store.currentStore(), id));
    if (!session) return false;
    session.controller.abort(new Error(reason));
    session.send({ type: "preparing", detail: "Stopping and cleaning up this run…" });
    return true;
  }

  async function recoverWorkspace(owner) {
    if (recoveryJobs.has(owner.workspace)) return recoveryJobs.get(owner.workspace);
    if (recovered.has(owner.workspace) || closing) return;
    recovered.add(owner.workspace);
    const lease = owner.captureStore();
    const job = (async () => {
      const ownerToken = owner.reproductionResourceOwner();
      for (const row of owner.listUnreleasedReproductionResources()) {
        if (closing) break;
        // A copied DB has the same UUIDs. It must never acquire the original
        // folder's still-live resources by merely opening a copy elsewhere.
        let sameScope = false;
        try { sameScope = canonicalWorkspace(row.resource.dataRoot) === owner.workspace; } catch { /* Unknown/moved scope is not cleanup authority. */ }
        if (!sameScope) {
          owner.setReproductionResource(row.runId, { ...row.resource, cleanupError: "This resource has an unknown or different data workspace scope. It was not automatically reclaimed." });
          continue;
        }
        if (row.resource.ownerToken !== ownerToken || row.resource.runId !== row.runId) {
          owner.setReproductionResource(row.runId, { ...row.resource, cleanupError: "Resource ownership does not match this database and exact run. It was not automatically reclaimed." });
          continue;
        }
        try { await recoverResource(row.resource, owner); owner.setReproductionResource(row.runId, { ...row.resource, releasedAt: new Date().toISOString() }); }
        catch (error) { owner.setReproductionResource(row.runId, { ...row.resource, cleanupError: error.message }); }
      }
    })();
    recovering.add(job);
    recoveryJobs.set(owner.workspace, job);
    try { await job; } finally { recovering.delete(job); recoveryJobs.delete(owner.workspace); lease.release(); }
  }

  async function shutdown({ timeoutMs = 10_000 } = {}) {
    closing = true;
    const sessions = [...active.values()];
    for (const session of sessions) session.controller.abort(new Error("Stopped because the app is closing."));
    let timer;
    try {
      await Promise.race([Promise.allSettled([...sessions.map(session => session.done), ...recovering]), new Promise(resolve => { timer = setTimeout(resolve, timeoutMs); })]);
      // A backend that ignored cancellation still gets an owned cleanup request.
      for (const session of active.values()) void session.dispose().catch(() => {});
      return { pending: active.size };
    } finally { clearTimeout(timer); }
  }

  return { start, stop, recoverWorkspace, shutdown, get activeCount() { return active.size; } };
}

module.exports = { createReproductionRunManager };
