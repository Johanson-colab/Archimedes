# Create scientific capability library

Tracking: [Research Apps #256](https://github.com/Johanson-colab/Archimedes/issues/256).
Written implementation approval: the project owner's instruction in the current development conversation on 2026-11-25: “8-12个太少了，多多选一些然后开始进行开发吧”, following the agreed five-category, sidebar-App design. The subsequent “继续吧” approved the host runtime, embedded preview and sidebar installation increment documented below.

## Scope

This branch supplies a private, versioned capability library for the existing Create conversation mode, plus host-managed static/Python HTTP App runtime, isolated embedded preview and workspace-scoped sidebar installation. See [Local Research App lifecycle](research-app-runtime.md). A full live code editor/build sandbox, runtime Agent binding and automatic credential binding remain unfinished. No new Node dependencies are introduced.

A skill is a professional instruction book, potentially with reusable scripts, references, templates and documented APIs. A generated Research App is a deliverable page/platform. It can implement its workflow using direct APIs, local scripts, an Agent, or a combination. The Agent building the App and an Agent called by the App are separate choices. Zero, one and multiple skills are supported.

## Storage and provenance

- `shared/creator-capability-selection.json`: maintained selection, five-category classification, input/output descriptions, bilingual task signals and suggested integration style. Integration is a planning hint, not a guarantee that an App or dependency is available.
- `electron/assets/research-capabilities/catalog.json`: bundled index, upstream commit, skill versions, requirements, license declarations and resource SHA-256 hashes.
- `electron/assets/research-capabilities/packages/<id>/`: complete selected upstream skill directories. Scripts and reference files retain relative paths. Executable file modes are preserved.
- `electron/assets/research-capabilities/LICENSE.md`: upstream MIT notice. Skill-specific notices remain in their original resources. Dependencies, datasets and services retain their own terms; the upstream MIT notice does not relicense them.

Source: `K-Dense-AI/scientific-agent-skills`, commit `c21d13b3cc2894680229ba9959a53281acb9200e`. There are 56 selected skills, 788 skill resources, approximately 7.7 MB before packaging, including 183 Python files. No upstream scientific environment, test fixture or Git checkout is installed on the user's machine.

The bundle is outside ordinary Skill discovery roots. It is not copied into `.agents/skills`, `.codex/skills`, `.claude/skills`, or `.opencode/skills`, and no scientific-library entries are added to App Market. Discipline-related words exist only as internal retrieval signals. The five existing App Market categories are unchanged.

## Retrieval and mode integration

Create identifies the intended inputs, actions and outputs before choosing capabilities. It searches small metadata pages and reads only selected resources, with pagination. Retrieval is deterministic bilingual lexical ranking over curated signals and upstream descriptions, not an embedding model or an automatic execution router. The coding Agent makes the final capability choice and can query again; ambiguous requests should be clarified rather than blindly accepting the first result.

The API harness advertises three tools only in Create mode:

1. `search_research_capabilities`: candidates and requirements, no skill body or automatic selection.
2. `read_research_capability`: bounded, integrity-checked reads of SKILL.md, scripts and references; includes resource names and `next_offset`.
3. `plan_research_app_dependencies`: a pinned dependency plan, including an empty selection; does not write or run anything.

The tool handler independently rejects calls from other modes. Codex, Claude Code and OpenCode receive the same capability CLI instructions on every Create turn, including resumed sessions. Their native shell/approval behavior is retained. Library contents do not get automatically added to their contexts or global configurations. Ordinary local native Agents can still read files allowed by their filesystem permissions; this separation is activation/discovery scoping, not a new filesystem sandbox.

Native operations use the Electron executable with `ELECTRON_RUN_AS_NODE=1`, allowing the bundled CommonJS reader to work from packaged ASAR resources. For source development, the equivalent is:

```bash
node electron/agent/creator-capabilities-cli.cjs search '{"query":"追踪某个领域的新论文"}'
node electron/agent/creator-capabilities-cli.cjs read '{"id":"paper-lookup","path":"SKILL.md","limit":4000}'
node electron/agent/creator-capabilities-cli.cjs plan '{"ids":["paper-lookup"]}'
```

## Delivering App dependencies

When a generated App needs skill resources at runtime, the coding Agent can use its normal approved command tool to export selected packages. An example, after replacing the workspace path:

```bash
node electron/agent/creator-capabilities-cli.cjs export '{"workspace":"/absolute/workspace","appId":"literature-tracker","ids":["paper-lookup"]}'
```

The result is:

```text
research-apps/literature-tracker/
└── .capabilities/
    ├── LICENSE.md
    ├── lock.json
    └── paper-lookup/
        ├── SKILL.md
        ├── scripts/
        └── references/
```

The export is staged, verifies resource hashes, refuses path traversal/symlink destinations, and refuses replacing an existing `.capabilities` directory. It preserves user code in the App directory. `lock.json` paths are relative to the App root. Exporting an empty selection is valid. Updating or removing dependencies remains a separate, explicit version-management step.

The App can use scripts and API documentation directly. An App that calls Codex/Claude/OpenCode must explicitly provide its selected skill paths through the future App runner/backend adapter; this resource export does not implement that binding or automatically make the Agent discover the skills. Deliver the `.capabilities` folder with the App so another machine does not need preinstalled global skills. No credentials are copied. Package/environment installation is separate and must follow the declared Python/system/service requirements in per-App environments.

## Validation boundaries

Every included package currently says `runtime: not-verified`; resource integrity is a separate status. This does not claim 56 scientific workflows are validated on this machine. Environment variable hints are extracted names, may be optional, and never request or contain values. Read the skill's compatibility notes before selecting dependencies; authentication for paid services remains required where documented.

A local smoke test exported three packages to a temporary App and executed their dependency-free helpers under Python 3.13.5: a four-row CSV profile (mean 2, one missing value), reconstruction of a synthetic OpenAlex abstract, and manuscript linting that correctly rejected an unresolved TODO. These are narrow helper checks, not full scientific/Agent runtime verification. The macOS system Python here is 3.9 and could display CLI help but failed the EDA computation; it does not meet the declared Python 3.11+ requirement. Do not treat `--help` success as runtime compatibility.

## Re-importing

Use a clean upstream checkout and review the selection/source/licenses before replacing a bundle:

```bash
node scripts/import-creator-capabilities.cjs /absolute/path/to/scientific-agent-skills
```

The importer is offline and intentionally refuses an existing destination. It never installs dependencies, modifies the upstream checkout, or scans the user's home. Review/preserve the existing version before creating its replacement. Generated catalog metadata and resource hashes should be committed together with the curated selection.

## Selected capabilities

### Discovery & tracking (5)

- `paper-lookup` — Paper lookup
- `research-lookup` — Research evidence lookup
- `exa-search` — Web research search
- `parallel-web` — Web extraction and monitoring
- `bgpt-paper-search` — Full-text experimental search

### Resources & evidence (8)

- `database-lookup` — Scientific database lookup
- `citation-management` — Citation management
- `pyzotero` — Zotero library integration
- `markitdown` — Document conversion
- `liteparse` — Local document parsing
- `datalad` — Dataset versioning
- `lamindb` — Scientific data catalog
- `protocolsio-integration` — Research protocol library

### Experiments & evaluation (11)

- `experimental-design` — Experimental design
- `statistical-power` — Sample size and power
- `hypothesis-generation` — Hypothesis development
- `scientific-brainstorming` — Research ideation
- `scientific-critical-thinking` — Evidence assessment
- `scholar-evaluation` — Research quality evaluation
- `get-available-resources` — Compute resource planning
- `scikit-learn` — Machine learning evaluation
- `pytorch-lightning` — Model training workflows
- `transformers` — Transformer model workflows
- `stable-baselines3` — Reinforcement learning evaluation

### Analysis & visualization (23)

- `exploratory-data-analysis` — Exploratory data analysis
- `statistical-analysis` — Statistical analysis
- `statsmodels` — Statistical modeling
- `pymc` — Bayesian modeling
- `matplotlib` — Scientific plotting
- `seaborn` — Statistical visualization
- `scientific-visualization` — Publication figure workflows
- `sympy` — Symbolic mathematics
- `networkx` — Network and graph analysis
- `polars` — Tabular data processing
- `dask` — Large dataset processing
- `umap-learn` — Dimensionality reduction
- `shap` — Model explanation
- `geopandas` — Geospatial analysis
- `astropy` — Astronomical data analysis
- `biopython` — Biological sequence analysis
- `scanpy` — Single-cell analysis
- `anndata` — Annotated biological matrices
- `pydeseq2` — Differential expression analysis
- `rdkit` — Molecular data analysis
- `pymatgen` — Materials data analysis
- `timesfm-forecasting` — Time-series forecasting
- `uncertainty-and-units` — Measurement uncertainty and units

### Writing & delivery (9)

- `literature-review` — Literature review
- `scientific-writing` — Scientific manuscript writing
- `peer-review` — Manuscript review
- `scientific-slides` — Scientific presentations
- `scientific-schematics` — Scientific diagrams
- `markdown-mermaid-writing` — Markdown and Mermaid documents
- `latex-posters` — Research posters
- `venue-templates` — Publication templates
- `research-grants` — Research grant preparation
