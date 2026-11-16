const { createHash } = require("node:crypto");

function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, stable(value[key])]));
  return value;
}
const digest = value => createHash("sha256").update(JSON.stringify(stable(value))).digest("hex");

function freshContract(contract) {
  const copy = structuredClone(contract || {});
  copy.steps = (copy.steps || []).map(step => ({ ...step, status: "pending", evidence: "", note: "", exit_code: null, duration_ms: 0 }));
  copy.findings = [];
  return copy;
}

function planVersion(contract) {
  return digest(freshContract(contract));
}

function paperInput(record, reader) {
  return { paperId: record.paper_id || null, readerSha256: reader?.asset?.sha256 || null,
    indexedAt: reader?.asset?.indexed_at || null, pageCount: reader?.asset?.page_count ?? null };
}

function initialSnapshot(record, owner, { backend, requirements = [], reader } = {}) {
  const contract = freshContract(record.contract);
  return { version: 1, reproductionId: record.id, createdAt: new Date().toISOString(),
    owner: { dataRoot: owner.workspace, projectId: record.project_id || null, workspaceId: record.workspace_id || null, executionRoot: record.execution_root || null },
    plan: { version: planVersion(contract), contract }, paper: paperInput(record, reader),
    environment: { backend, declared: structuredClone(contract.environment || {}),
      requirements: requirements.map(({ name, required, reason, hasValue }) => ({ name, required: Boolean(required), reason: reason || "", hasValue: Boolean(hasValue) })),
      coverage: "Declared requirements only; installed packages, datasets and external inputs are not fingerprinted." },
    prepared: null, final: null };
}

function snapshotApplicability(snapshot, record, reader) {
  if (!snapshot) return { status: "legacy-unrecorded", reasons: ["This historical run has no input snapshot."] };
  const reasons = [];
  if (planVersion(record.contract) !== (snapshot.final?.planVersion || snapshot.plan.version)) reasons.push("The current plan differs from this run's recorded plan.");
  const currentPaper = paperInput(record, reader);
  if (currentPaper.paperId !== snapshot.paper.paperId || currentPaper.readerSha256 !== snapshot.paper.readerSha256) reasons.push("The recorded paper input has changed.");
  if (snapshot.restoration) reasons.unshift("Imported historical evidence; this run was not executed in the restored workspace.");
  return { status: snapshot.restoration ? "restored-history" : reasons.length ? "stale" : "recorded", reasons,
    limitations: ["Current checkout, installed environment and external dataset contents are not revalidated by opening history."] };
}

async function localCheckoutSnapshot(root, { url = "", branch = "", signal } = {}) {
  const { runProcess } = require("./process-runner.cjs");
  const options = { signal, timeoutMs: 10_000, separateOutput: true, captureChars: 2_000 };
  const commit = await runProcess("git", ["-C", root, "rev-parse", "HEAD"], options);
  const status = await runProcess("git", ["-C", root, "status", "--porcelain", "--untracked-files=normal"], options);
  return { url, branch, location: root, storage: "local", commit: commit.exitCode === 0 && /^[a-f0-9]{40,64}$/.test(commit.stdout.trim()) ? commit.stdout.trim() : null,
    dirty: status.exitCode === 0 ? Boolean(status.stdout.trim() || status.outputTruncated) : null };
}

module.exports = { freshContract, planVersion, initialSnapshot, snapshotApplicability, localCheckoutSnapshot };
