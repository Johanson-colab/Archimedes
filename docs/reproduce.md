# Reproduce

Reproduction is a **global background job**: you dispatch it from a paper and
leave. It is not a chat mode and it is not part of the idea-to-code flow on the
home screen.

## Boundary

| | Home conversation | Reproduce |
| --- | --- | --- |
| Starts from | a user idea | a published paper + its code |
| The agent | designs and writes code | clones, provisions, runs, compares |
| User | stays in the conversation | leaves and comes back |
| Success | the result matches a hypothesis | the reported number reproduces within tolerance |

The two share the execution substrate (shell, later SSH) but never share
objects.

## Why a global object

A reproduction outlives the page it was started from. Its state lives in the
main process and in the workspace database; every surface is an observer.

- Sidebar `Create → Reproduce` lists every job, across papers.
- A paper's tab bar carries `Reproduce` after `Codebase`.
- A finished or failed job is reported without the user having to watch it.

## Contract

The planner (read-only, spends tokens but never touches a machine) turns a
paper into a contract:

```json
{
  "summary": "one sentence",
  "claims": [{
    "id": "table2-vgg16",
    "statement": "VGG16 reaches parity with 2.43x fewer generations",
    "dataset": "KernelBench", "metric": "generations",
    "expected": 2.43, "unit": "x", "tolerance": 0.02,
    "evidence": { "page": 7, "table": "Table 2", "row": "VGG16", "column": "speedup", "quote": "…" }
  }],
  "entrypoint": { "command": "python -m eval", "cwd": ".", "outputs": [] },
  "environment": { "python": "3.10", "cuda": "12.1", "install": ["pip install -r requirements.txt"], "system": [], "source": "repo Dockerfile" },
  "repo": { "url": "", "commit": "" },
  "notes": []
}
```

Rules enforced by `electron/reproduction/contract.cjs`:

- a contract with no claim is a planning failure, not an empty success;
- a claim without a reported number keeps `expected: null` and stays unverifiable;
- tolerance is relative and capped at 50%;
- evidence must point at a PDF page.

The contract is frozen when approved. Any later deviation is recorded as a
deviation, not silently absorbed.

## Status

```
draft → planned → queued → provisioning → running ─┬→ checks-passed
                            ↑                      │
                            └────── diagnosing ────┘   (max 3 attempts → blocked)

checks-passed → verified | diverged        (when the reported numbers are compared)
```

`checks-passed` is deliberately not `verified`: every runbook checkpoint passed,
but no number in the paper has been compared yet. Collapsing the two would let a
plan look finished while the table it promises is still unread.

`approve` is a human action. It is deliberately not exposed as an agent tool.

## Execution

### M1: local Docker

One container per run, created from what the contract declares (`python:3.11-slim`
for `python: 3.11`, `node:20` when the install steps are npm), with the checkout
mounted at `/workspace`. Steps are `docker exec` calls, so they share the
environment they are building.

The runner (`electron/reproduction/runner.cjs`) is deliberately dumb:

1. run the step's command;
2. evaluate the step's `check` as its own predicate;
3. pass → next step, anything else → stop.

A command's exit code never overrides its checkpoint: `pip install -e .` exiting
1 still passes a `file_exists` check if the package landed, and exiting 0 still
fails if the import breaks. `manual` stops the run and asks a person — it never
gets guessed. Commands that time out, or a run that exceeds `budget.wallClockMin`,
stop with `timeout`.

Stopping a run aborts the in-flight `docker exec` and removes the container.
Closing the app removes it too: a local Docker run does not survive the app, and
the UI says so rather than pretending the job is still going.

## Execution (later milestones)

- The agent stays **local**; only execution is remote. This mirrors
  `pi-ssh-remote`'s tool-routing idea: the agent keeps `read`/`bash`/`edit`, and
  the tool layer swaps the operations for remote ones. The reference project
  lives at `~/Documents/AI Research/pi-ssh-remote`.
- Execution backends: Docker (default), SSH (own server or AutoDL), local.
- Jobs are detached on the remote (`nohup` + status file) so closing the app
  does not kill a run; local Docker does stop with the app and says so.

## Milestones

| Milestone | Scope | State |
| --- | --- | --- |
| M0 | object, list, paper entry, contract planning, approval (no execution) | done |
| M1 | local Docker run, queue, log stream, checkpoint verdicts | done |
| M2 | bounded diagnosis loop, budget enforcement | next |
| M3 | SSH backends, environment cache, cost watchdog | planned |
| M4 | batch across papers, aggregate report | planned |

M1 stops short of comparing numbers on purpose: `checks-passed` means the
runbook ran, not that Table 2 matched. Metric parsing and verdicts arrive with
M2/M3 once failures have somewhere useful to go.

