# Research mode: native IdeaSpark skills

Start a new Work chat, select **Research**, choose **Codex**, **Claude Code**, or
**OpenCode**, and send a research question. Archimedes prepares the complete
IdeaSpark package and asks the selected native agent to follow its workflow.
Users do not need to install IdeaSpark globally or attach it to each message.

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

## State, permissions and execution

- A `research_skill` event records the chat, backend, workspace and unique run
  directory under `ideaspark_run/`. Follow-ups and restarted processes recover
  the same directory, and `next` inspects the saved upstream artifacts. A fork or
  changed workspace/backend gets a new run. This is artifact-based recovery, not
  automatic replay of interrupted commands.
- Standard/Create do not activate the built-in skill. The new-chat mode is saved
  with its composer draft. Choosing Research while using the self-developed API
  harness still follows the existing API behavior; its IdeaSpark integration is
  deferred. Arbitrary Archimedes plugin/skill attachments remain unsupported by
  native backends; this integration supplies a known, built-in package directly.
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

The full suite reported 1,039 passes, four skips and six failures: three
Benchmark Radar tests discover this machine's local checkout instead of their
expected fallback; three Windows shell assertions fail on macOS. The failing
modules/tests are unchanged by this work. Lint, build, focused integration tests
and theme checks pass. This change adds workflow routing and native activity
labels without changing page layout; execution logs/tests provide the evidence
instead of before/after layout screenshots.
