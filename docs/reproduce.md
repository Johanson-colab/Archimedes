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

## Runbook, not a program

The planner (read-only: it spends tokens but never touches a machine) turns a
paper into a runbook: the numbers worth confirming, and the steps a person would
follow to confirm them.

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
  "steps": [{ "id": "install", "title": "Set up the environment", "command": "python3 -m pip install -e .", "checkpoint": "python3 -c \"import boto3\" exits 0", "check": { "kind": "command", "command": "python3 -c \"import boto3\"" } }],
  "entrypoint": { "command": "python3 -m eval", "cwd": ".", "outputs": [] },
  "environment": { "python": "3.10", "cuda": "12.1", "install": [], "system": [], "source": "repo README" },
  "repo": { "url": "", "commit": "" },
  "notes": [],
  "findings": [{ "at": "…", "text": "this machine has python3 but no python" }]
}
```

Rules enforced by `electron/reproduction/contract.cjs`:

- a runbook with no claim is a planning failure, not an empty success;
- a claim without a reported number keeps `expected: null` and stays unverifiable;
- tolerance is relative and capped at 50%;
- evidence must point at a PDF page.

The steps are **advice**. Nothing executes `check` as a predicate any more: the
executor is an agent that reads them, tries them, and changes them when the
machine disagrees. `findings` is what earlier runs learned about this machine, so
the next attempt does not rediscover that `python` is called `python3`.

## Status

```
draft → planned → provisioning → running ─┬→ checks-passed
                                          ├→ blocked
                                          └→ cancelled
```

`checks-passed` is deliberately not `verified`: every runbook step passed with
evidence, but no number in the paper has been compared yet.

There is no approval gate. Pressing `Run` is the approval; the planner is cheap
and the runbook can be re-planned at any time.

## Execution: the pilot

`electron/reproduction/pilot.cjs` replaces the old step interpreter. There is one
loop:

1. build a state prompt: the runbook, earlier findings, the last seven commands
   with their output, and any environment hints the last output earned;
2. ask the model for exactly one action;
3. carry it out;
4. repeat until the runbook is finished, a person is needed, or the budget ends.

The actions:

| Action | What it does |
| --- | --- |
| `run` | execute one shell command in the environment, stream its output |
| `advance` | record a step's verdict, with a quote from real output; pass the command that actually worked and the runbook keeps it |
| `revise` | rewrite the runbook when this machine disagrees with it |
| `finding` | remember something about this machine for the next run |
| `ask` | stop and ask a person for something only a person can provide |
| `done` | finish the runbook |

Findings are shown under the run, so a person can see what the machine taught the
agent without opening the database.

### Why a verdict cannot be invented

`advance` carries `evidence`, and the runtime checks it before writing anything:

- the quote must appear **verbatim** in output produced during this run;
- `passed` must cite output from a command that exited 0;
- `done` is refused while any step is still `pending` or `failed`.

So the agent decides *what* is true, but the runtime decides whether it actually
saw it. A confident sentence without a receipt is a rejected action, and the
rejection is fed back as the next turn's hint.

This is the same invariant the old runner had, moved from the plan to the
observation: no green tick without a checkable receipt. The difference is that
the agent can collect new evidence instead of stopping at the first predicate
the planner guessed wrong.

### Hints, not repairs

`electron/reproduction/hints.cjs` reads the last output and attaches short
notes: `python` is called `python3` here, pip ignores a plain-http index unless
it is trusted, a local proxy cannot reach the intranet. They are attached to the
observation and shown in the prompt. Nothing acts on them.

That is deliberate. A rule table can only repair the failures someone anticipated;
an agent that is told what the error usually means can handle the next one.

### Output the prompt cannot hold

The prompt shows the last seven commands, each with the tail of its output, so a
`pip install` that prints ten thousand lines does not push the runbook out of the
window. When a command produces more than that tail, the pilot writes the last
512 KB to `/tmp/archimedes/<run>/<n>.log` on the target and puts the path in the
observation.

The agent greps or tails that file instead of re-running a twenty-minute install,
and the journal shows the same path so a person can look too. The file goes
through the backend's `writeFile` (stdin over `docker exec` or `ssh`), never by
splicing the output into a shell command; only `/tmp/archimedes/…` is writable.

### Environment work is the job

Most reproductions do not fail because the code is wrong. They fail because
`python` is called `python3`, a pin no longer resolves, a wheel does not exist
for this Python or this CUDA, or the index is an intranet mirror behind a proxy.
The README is usually a hypothesis written on the author's machine; the
repository's own metadata (pyproject, lockfiles, CI, Dockerfile) is the evidence.

The agent is told to:

- diagnose with commands before changing anything;
- treat every command as a fresh shell (`cd`, `export` and `activate` do not
  persist), so it uses `.venv/bin/python` or repeats the activation;
- keep the environment and the package cache inside the checkout, so a stopped
  run resumes instead of downloading torch again;
- record a relaxed pin or a CPU-for-GPU swap as a note and a finding.

That is also why there is no write/edit tool. The common failure is not a line of
code that needs changing, and an edit made through the shell stays visible in the
journal instead of looking like a normal operation.

### Budget and stopping

- `budget.wallClockMin` (default 45) caps the run.
- 60 turns caps a meandering agent.
- Ten commands without an accepted verdict, a revision or a finding stop the
  run. Diagnosis is progress only when it leaves something durable behind;
  otherwise it is a loop with extra steps.
- Destructive commands (`rm -rf /`, `mkfs`, `dd of=/dev/…`, `shutdown`) are
  refused before they reach the machine. Deleting `build/` is fine.

### Local Docker

One container per run, created from what the runbook declares (`python:3.11-slim`
for `python: 3.11`, `node:20` when the install steps are npm), with the checkout
mounted at `/workspace`. Every `run` is a `docker exec`, so commands share the
environment they are building.

Stopping a run aborts the in-flight exec and removes the container. Closing the
app removes it too: a local Docker run does not survive the app, and the UI says
so rather than pretending the job is still going.

### SSH

`electron/reproduction/remote.cjs` runs the same loop on a saved server: probe
(OS, python, docker, GPU, disk), a per-reproduction directory under
`~/.archimedes/repro/`, and a marker file so a second run reuses the checkout.
Commands use a login shell (`bash -lc`) so the profile's proxy and PATH apply.

When the server cannot reach GitHub, the local checkout is copied with
`tar`-over-ssh instead of cloning. A run that stops leaves the directory in
place: the next run starts from what was already built.

## Milestones

| Milestone | Scope | State |
| --- | --- | --- |
| M0 | object, list, paper entry, planning | done |
| M1 | Docker execution with live output | done |
| M2 | agent-driven execution: revise, retry, ask | done |
| M3 | SSH backend, environment reuse, findings | done |
| M4 | compare the produced numbers with the reported ones | planned |

M4 is the remaining gap on purpose: `checks-passed` means the runbook ran, not
that Table 2 matched. Metric parsing and numeric comparison come next.
