# Experiment lifecycle audit — 2026-11-21

Base: `origin/main` at `f3de22fa91855a228ea56cb87ceed916ceef594c`.
The audit used disposable local projects, SQLite databases and Git worktrees on
Linux with Node 24.22.3. No real research database was opened or edited.

## Managed numerical retry fixture

`electron/agent/experiment-retry-audit.test.cjs` exercises the real mailbox CLI,
tool registry, approval gate, local runner, store, evidence hashing and graph
service. It seeds a Question and Idea explicitly; no language model is called.
Approvals allow only the fixture's worktree creation and exact Node command.

The small calculation uses fixed synthetic points `y = 3x + 2` for
`x = [-2, -1, 0, 1, 2]`. A sample-mean baseline has MSE 18. The initial
implementation omits the intercept, obtains MSE 4, and deliberately exits 2
because it fails the predefined exact-fit acceptance check. The test repairs
the intercept, commits that code in the same experiment worktree and reruns
the same command, obtaining MSE 0 and exit 0. These values describe this
fixture only, not a general scientific finding.

| Check | Observation |
| --- | --- |
| Object links | One Question → one Idea → one Experiment → one Result; two distinct Runs belong to that Experiment. |
| Activities | Baseline and repair reports are `agent_reported`, without extra nodes or synthetic Runs. |
| Failure | First Run retains failed status, exit 2, log, original commit, code archive, reported metrics and artifact fingerprint. |
| Retry | Second Run retains succeeded status, exit 0, repaired commit, its own archive, metrics and fingerprint. |
| Artifact overwrite | The shared metrics path changes on retry; the first report retains the previous hash. Artifact copies are not preserved. |
| Result gate | Failed Run cannot create a run-backed Result; successful Run produces one Result; a duplicate submission is rejected. |
| Provenance | Both Runs pin the Idea and isolated workspace; both archive SHA-256 values match their files. |
| Reopen | Closing and reopening the database preserves terminal statuses, reports, object counts and graph links. This is not an app-crash recovery test. |

The test does not establish model-driven extraction accuracy, backend tool
selection, semantic deduplication, or packaged renderer behavior. It does not
exercise a large dataset, dependency installation or long training job.

## Cancellation defect and fix

Before this change, `cancelExperimentRun` sent SIGTERM only to the shell.
Three real-process regressions all failed because the descendant worker was
still executing after six seconds. See the committed
[before output](./assets/research-graph-lifecycle/cancellation-before.txt).

The runner now creates a POSIX process group, sends Stop to the group and
escalates to SIGKILL after two seconds. It retains escalation even when the
shell closes its log pipes first. Repeated Stop is harmless. Shutdown sends
SIGKILL immediately and flushes pending cleanup because an exiting app cannot
rely on delayed timers. Windows uses `taskkill /T /F` with shell termination as
a fallback; the Windows branch needs validation on Windows.

Five POSIX real-process cases cover ordinary descendants, SIGTERM-resistant
workers retaining log pipes, resistant workers closing their pipes, immediate
shutdown, and shutdown while cleanup remains pending after the shell closes.
See the [after output](./assets/research-graph-lifecycle/cancellation-after.txt).
Workers that intentionally detach into another process group remain outside
this mechanism. A hard app crash is not a supervised recovery path.

## Validation and remaining limits

The [validation summary](./assets/research-graph-lifecycle/validation.txt)
records actual test results, including failures reproduced on unmodified main.
There are no UI changes; process tests and mailbox integration output are the
before/after evidence instead of screenshots.

The earlier [real-native smoke test](./assets/research-graph-live-e2e/results.txt)
remains a separate macOS result. This environment has no Claude Code or
OpenCode installation. Its available Codex executable was not used to perform
a new authenticated model/backend run. No new three-backend end-to-end pass is
claimed. The macOS-only OpenResearch path from the handover is unavailable here
and was not compared.

Follow-up checks remain necessary:

- Run this numerical failure/repair scenario through each real native backend
  and the packaged UI, including denial, long execution, cancellation and app restart.
- Test automatic extraction against existing Idea/Experiment/Result objects.
  This audit avoids conflating explicitly seeded nodes with model extraction.
- Verify extraction status against the intended conversation turn. The current
  panel derives a session-level boolean from a Map of extraction events keyed
  by `turn_id`; it does not compare the displayed checked state to the current
  turn. An earlier check can therefore remain visible while later work has not
  been checked. No UI behavior was changed in this patch.
- Audit active-Run recovery and workspace switching. A database reopen after
  terminal completion does not verify reattachment to an active process.
- Build a verifiable Run manifest for data and environment inputs before
  promising recovery or replay. Current archives and artifact hashes provide
  partial provenance, not a complete reproduction bundle.
