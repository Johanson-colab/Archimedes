# API harness skill support

Research mode prepares the bundled IdeaSpark package in `.archimedes/skills/archimedes-idea-spark` under the selected workspace and allocates a separate `ideaspark_run/research-<id>` directory for each chat. Later turns reuse that directory. Preparing files does not mean that the model has read the skill or completed research.

The API harness can discover direct skill directories in `.archimedes/skills`, `.agents/skills`, `.claude/skills`, and `.opencode/skills` in the active workspace. It loads text resources only on demand. Hidden resources, traversal, linked resources and oversized files are rejected. Global skill directories and arbitrary installed plugins are not automatically discovered.

`run_isolated_phase` starts a fresh model context for a single IdeaSpark LLM stage. It can read workspace material and skill resources, but cannot run commands or launch nested phases. Writes are limited to declared files inside the current run and require the existing user approval. An existing file alone does not count as an approved stage output. Phase events include a worker ID and parent tool call. The model must inspect the navigator and actual artifacts rather than infer completion from these events.

The main agent runs navigator and retrieval commands through `propose_command`, subject to approval. The skill's Python dependencies, external connectors, available model context, and provider output limits still apply. A denied action, exhausted tool budget, interrupted run or missing dependency can stop the workflow; resume in the same chat after checking artifacts. Integration tests simulate the model and do not establish that a complete live IdeaSpark literature run succeeded.
