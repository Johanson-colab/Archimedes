# Research mode: opt-in IdeaSpark skills

Start a new Work chat and select **Research**. Research is a normal conversation
with literature and workspace tools; it does not start IdeaSpark automatically.
Type `/` in the composer and choose **Idea Spark** (or type `/idea spark`) when
you want the full workflow. The selected skill is shown as a removable chip
above the message and runs only when that message is sent. Choose Codex,
Claude Code, or OpenCode to have Archimedes prepare the complete IdeaSpark
package for the selected native harness. Users do not need to install IdeaSpark
globally or attach it to each message.

## Integration

| Harness | Workspace skill directory | Workflow request |
| --- | --- | --- |
| Codex | `.agents/skills/archimedes-idea-spark/` | Native `skill` input plus `developerInstructions` on thread start/resume |
| Claude Code | `.claude/skills/archimedes-idea-spark/` | Native discovery plus `--append-system-prompt` |
| OpenCode | `.opencode/skills/archimedes-idea-spark/` | Native discovery plus an explicit per-turn request in ACP; ACP has no developer-instructions field |

Each package contains the full `SKILL.md`, Python scripts, pattern cards,
references, prompts and MIT license. Only the installed frontmatter name changes
to `archimedes-idea-spark`, avoiding collisions with personal `idea-spark` skills.
The bundled upstream files remain unchanged. No credentials or `.env` files are
bundled or copied, and user configuration files are not rewritten.

The native agent drives upstream `scripts/run.py next`: literature retrieval,
mandatory full-text gate, bottleneck identification, ideation, citation and
coherence checks, collision search, audit/revision and idea-card export. It must
honor all terminal branches, including `do_not_generate` and `phase_3_failed`.
IdeaSpark produces a research idea and test plan; it does not automatically run
the proposed experiment or write a full paper.

Codex also discovers project and user skills on its own. To keep IdeaSpark
opt-in, Archimedes starts Codex with `skills.config` disabling the user's
`idea-spark` skill on every turn, and disabling the bundled
`archimedes-idea-spark` skill as well unless the composer selection explicitly
requests it. A developer instruction on normal turns also tells Codex not to
resume or read either skill, so a previous IdeaSpark native thread does not
carry the workflow into an ordinary Research message.

The disable rule is name-based, not path-based. It applies whether the user's
copy lives in a project `.codex/skills`, the user-level `~/.codex/skills`, or
another Codex discovery root, and it is a harmless no-op when no such skill
exists. Explicit `/idea spark` always installs and uses the bundled
`archimedes-idea-spark` package in the current workspace, so other machines do
not need ResearchStudio, a personal `idea-spark` folder, or any local symlink.

## State, permissions and execution

- A `research_skill` event records the chat, backend, workspace and unique run
  directory under `ideaspark_run/`. Selecting IdeaSpark again in the same chat
  and workspace recovers the same directory, and `next` inspects the saved
  upstream artifacts. A fork or changed workspace/backend gets a new run. This
  is artifact-based recovery, not automatic replay of interrupted commands.
- The skill is opt-in on every turn. Prior `research_skill` events never activate
  IdeaSpark; a normal Research follow-up is an ordinary conversation. Resuming a
  run requires selecting IdeaSpark again in the composer. Standard/Create do not
  expose the command. The new-chat mode is saved with its composer draft.
- Native permissions and one-time approvals remain in effect. Skill preparation
  does not grant write/network access or turn on unattended execution. A denied
  operation or unavailable provider must be surfaced, not silently routed to API.
- Dependency checks and any missing-package installation are performed through
  the native agent under its permissions. The skill recommends a separate Python
  environment with `feedparser`, `openreview-py`, `beautifulsoup4` and `pymupdf`.
  Missing OpenReview credentials disable that connector; Semantic Scholar can
  run anonymously with rate limits. PDF compilation is optional.
- LLM phases must use an isolation mechanism actually available to the selected
  harness. The workflow instructions require reporting unavailable isolation
  rather than retaining all intermediate outputs in the parent chat.
- Managed package hashes are checked on reuse. Linked paths, unmanaged folders,
  modified files and mismatched bundle versions stop setup without overwriting
  user content. For a version mismatch, preserve the old workspace and start in
  a new one; in-place package upgrades are intentionally not automated.
- File preparation emits a status, not a successful skill-read event. Actual
  native file reads receive an IdeaSpark label in the existing activity panel.
  Tool failures retain their failed status. No intermediate reasoning is exposed.

## Upstream and maintenance

Source: [microsoft/ResearchStudio](https://github.com/microsoft/ResearchStudio),
revision `a2b10b0b9fd2ea03bed8201460d1cfb374a4cd0e`,
`ResearchStudio-Idea/skills/idea_spark`. Copyright (c) 2026 Happy, MIT.
`electron/assets/research-skills/idea-spark/upstream.json` pins every source hash;
`LICENSE` accompanies the package. Local paths from the development machine are
not required at runtime.

## Validation

```sh
node --test electron/agent/research-skills.test.cjs electron/agent/codex-native.test.cjs electron/agent/external-backend.test.cjs
npm run lint
npm run build
node scripts/check-theme-tokens.mjs
```

Real-model checks are opt-in, one harness per invocation:

```sh
node scripts/check-native-research-skills.cjs codex
node scripts/check-native-research-skills.cjs claude
node scripts/check-native-research-skills.cjs opencode
```

These checks use a temporary workspace, read the actual skill, execute its
read-only navigator once, preserve native permissions and close the spawned
client. They stop before retrieval, dependency installation or paid multi-phase
research. They do not establish end-to-end IdeaSpark research quality.

On the development machine (2026-11-09): Codex CLI 0.161.0 and Claude Code
2.1.119 read the installed skill and ran the navigator successfully. OpenCode
2.2.5 initialized its ACP session but rejected the prompt with
`provider.free-limit`; real OpenCode skill execution remains unverified until a
usable native provider/model is configured. Protocol tests cover all three.

The full suite reports 1,243 passes, five skips and 11 failures on this macOS
development machine. The failures are pre-existing environment and fixture
checks: three Benchmark Radar tests discover this machine's local checkout
instead of their expected fallback, two Windows shell assertions fail on macOS,
and the remaining Git/worktree, template, shell-profile and translation-order
audits depend on local state. They are unchanged by this work. Lint, build,
focused integration tests and theme checks pass. This change adds the explicit
Research composer command without changing page layout; focused execution tests
provide the evidence instead of before/after layout screenshots.
