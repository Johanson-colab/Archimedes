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
draft → planned → queued → provisioning → running → verified | diverged
                                   ↑            │
                                   └ diagnosing ┘   (max 3 attempts → blocked)
```

`approve` is a human action. It is deliberately not exposed as an agent tool.

## Execution (later milestones)

- The agent stays **local**; only execution is remote. This mirrors
  `pi-ssh-remote`'s tool-routing idea: the agent keeps `read`/`bash`/`edit`, and
  the tool layer swaps the operations for remote ones. The reference project
  lives at `~/Documents/AI Research/pi-ssh-remote`.
- Execution backends: Docker (default), SSH (own server or AutoDL), local.
- Jobs are detached on the remote (`nohup` + status file) so closing the app
  does not kill a run; local Docker does stop with the app and says so.

## Milestones

| Milestone | Scope |
| --- | --- |
| M0 | object, list, paper entry, contract planning, approval (no execution) |
| M1 | local Docker run, queue, log stream, metric parse, verdict |
| M2 | bounded diagnosis loop, budget enforcement |
| M3 | SSH backends, environment cache, cost watchdog |
| M4 | batch across papers, aggregate report |
