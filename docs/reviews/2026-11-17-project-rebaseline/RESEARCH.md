# Archimedes 重新基线调研：模块成熟度与一流开源对标

原始调研日期为 2026-11-17。以下先列最近核对的进度，第 0–10 节保留调研当时的判断、数据和建议。

## 2026-11-18 进度同步

当天晚些时候重新核查了所有贡献 PR。逐项结果、两项 issue 的实现范围和截图见[本次 PR 复核](../2026-11-18-pr-check/README.md)。下表保留本轮修复开始前的状态。

上游 `main` 已到 `06371399`。11 月 17 日合入四项改动，分别是桌面运行时准备（#345）、BibTeX 导入导出（#346）、按执行目录保存文件草稿（#350）、保留未完成的模型响应并阻止执行残缺的工具调用（#354）。此前的 Git 工作区识别（#337）、Windows 终端路径（#338）和翻译排序（#339）也已合入。[上游提交对比](https://github.com/Johanson-colab/Archimedes/compare/99b3d07...06371399b488cc522509d8873f7c7234a59d5bcf)

| 范围 | 本次核对结果 |
| --- | --- |
| 上游贡献 PR | 本轮拆分系列还有 9 个开放 PR。#341 的工作区数据归属修复与 `main` 有冲突，fork #1 和 #3 依赖这条线。#342、#347、#348、#351、#352、#353、#355、#356 仍在审。原总 PR #336 已关闭，#340 的模式设计由 #308 承接，#343、#344、#349 已关闭且未合入。[上游贡献列表](https://github.com/Johanson-colab/Archimedes/pulls?q=is%3Apr+author%3Afeiiiiii5) · [#341](https://github.com/Johanson-colab/Archimedes/pull/341) |
| Fork 上的工作 | #1–#8 均开放，目标分支都在 fork。#4 的中断恢复已有上游 #356 承接。其余涉及任务归属、引文、会话附件、审稿、幻灯片、分析保存和稿件版本。[Fork PR 列表](https://github.com/feiiiiii5/Archimedes/pulls) · [#356](https://github.com/Johanson-colab/Archimedes/pull/356) |
| 研究图谱和发布 | 研究图谱 #308 仍开放且有合并冲突。v0.1.0 安装包已公开发布，将发布分支合回 `main` 的 #334 仍开放。[#308](https://github.com/Johanson-colab/Archimedes/pull/308) · [v0.1.0 发布页](https://github.com/Johanson-colab/Archimedes/releases/tag/v0.1.0) · [#334](https://github.com/Johanson-colab/Archimedes/pull/334) |
| 开源贡献基础 | 上游 `main` 已提供完整测试入口，根目录仍无 `LICENSE`，也没有 `.github/workflows/`。本工作区另有开发验收文档和工具链固定版本，接手时按实际分支选用。[此次核对的上游源码](https://github.com/Johanson-colab/Archimedes/tree/06371399b488cc522509d8873f7c7234a59d5bcf) |
| 本地实现 | 主工作区在 `codex/research-continuity` 的 `f6b5ee3`，保留着稿件引用、版本历史、项目研究索引与项目迁移等未提交改动。另两个工作区已有 OpenCode Go 请求头原型 `966c0f5`、基于它的多模型配置原型 `c71a322`。对应的两个设计议题均开放，本次未发现关联 PR 或核心团队书面批准。[本地拆分和依赖记录](../2026-11-16-research-continuity/PAUSE-2026-11-16.md) · [#357](https://github.com/Johanson-colab/Archimedes/issues/357) · [#358](https://github.com/Johanson-colab/Archimedes/issues/358) |

承接已有工作时，先处理所选任务的直接依赖。若继续工作区归属线，先核对 #341 与当前 `main` 的冲突。若选择首次启动体验，#321 目前仅有标题，需先明确新用户的首次任务和验收方式，并取得 UI 工作流的书面批准。[#321 首次启动讨论](https://github.com/Johanson-colab/Archimedes/issues/321)

本次同步核对了 GitHub 和本地工作区。11 月 17 日的测试矩阵可用于选择验收场景。历史整套测试早于此工作区的后续改动，本次也未重跑整套测试。[全应用测试矩阵](../2026-11-17-full-app-test-scenarios/FULL_APP_TEST_MATRIX.md)

---

## 0. 先给结论

1. **当前 main 仍是早期项目，不是“差几个 PR 就完成”的状态。**  
   上游 `main = 99b3d07`（2026-11-16，两个 benchmark-radar 修复在 #337/#338/#339 之后）。仓库公开 main 没有 `LICENSE`、没有 `.github/workflows`、没有 `docs/development-validation.md`；README 仍把“让 coding agent 帮你安装”作为推荐路径。默认启用应用只有 Library / Daily / Writing / Data analysis 四个，Reproduce、Figure generation、Paper chart references、Paper to Slides 仍是 Beta/默认关闭。

2. **已经提出但尚未合并的 PR 覆盖了很大一部分“缺口”。**  
   上游 #341–#356 这一段共 16 个 PR，其中 #343/#344/#349 已关闭/暂缓，其余 13 个仍 open；fork #1–#8（8 个）也仍 open；#308 是 research-graph 主线；#334 是 release 分支。另有一批已经实现但未拆分的本地材料：O07/O09/O10/O15/O16/O20/O21/N01/N04。接下来的主要工作是**让这些已有工作被正确验证、拆分、合并/落地**，而不是重新实现同等功能。

3. **真正没有现有 PR 覆盖、且对“上手成本”最关键的是首次启动/新手指南。**  
   对应 open issue **#321**（标题即“在初次打开 Archimedes 时提供新手指南”，当前无正文）。之前的签名调研也发现：首次启动在没有历史 workspace 时会把 home 当数据目录。这是当前最干净、最独立、最适合先做的一个模块。

4. **“对标一流开源项目”应优先补齐四件事**：数据可迁移与本地优先、证据/来源可追溯、扩展机制与开放格式、发布工程（文档/CI/可发现性）。签名/公证按用户决定先不做，但不影响做 CI、LICENSE、安装文档、包体瘦身、发布说明。

5. **一个模块一个模块推进时，必须先处理依赖链。**  
   数据归属/会话上下文是地基（#341、#350、#356、fork #1/#3），写作链（#347/#348、fork #5/#6/#8）、复现链（#353/#356、本地 O07/O09/O10/O21）、分析/图稿链（fork #7、本地 O15/O16）都建立在它之上。不要并行堆新 UI，否则会继续产生互相冲突的 PR。

---

## 1. 调研范围与方法

- 用 `git show origin/main:...` / `git ls-tree` 只读检查上游 main，不切换、不重置、不覆盖主工作区。
- 读取现有公开 PR、fork PR、open issues、历史 closeout / pause / split 记录。
- 对当前源码做模块清单与成熟度扫描（`src/sidebar-registry.tsx`、`src/settings/registry.tsx`、`shared/research-apps.json`、`package.json`、各 `docs/*.md`）。
- 外部对标参考 Zotero、Zettlr、Quarto、RO-Crate、AnythingLLM、Open WebUI、LobeHub、Joplin/Logseq 等项目的官方资料。
- **没有**运行新的全套测试/打包（当前目的不是验收 PR），**没有**改代码，**没有**创建 PR/issue。

主工作区 `/Users/fei/Desktop/Archimedes` 的未提交工作（分支 `codex/research-continuity`，HEAD `f6b5ee3`，约 50 个 uncommitted 项）是历史保留资产，另有备份在 `docs/reviews/2026-11-16-research-continuity/pause/`。本次只读，不动它。

---

## 2. 当前真实基线

### 2.1 上游 main

| 项 | 事实 |
| --- | --- |
| 默认分支 | `main` |
| 当前 main | `99b3d07 fix(benchmark-radar): use the original canonical catalog and migrate stale caches`（2026-11-16T15:22:35Z） |
| 之前合并 | #337 canonical Git workspace、#338 Windows shell path、#339 i18n 排序（合并在 `57ca05a`）；之后 main 又有 2 个 benchmark-radar 提交 |
| Stars / Open issues | 24 / 37（调研时） |
| 根 LICENSE | main 没有；release 分支 #334 中的 #332/#333 才加入 LICENSE/changelog/下载说明 |
| CI | main 没有 `.github/workflows` |
| 安装文档 | README 推荐“copy to coding agent，让它 clone + npm install + npm run dev”，并说 renderer-only preview 不够 |
| Node 要求 | main 的 package.json 没有 `engines`；README 写 Node 20+。后续 #343（closed/deferred）、#345（open）才处理工具链/desktop 准备 |
| 默认启用应用 | library、daily、writing、data-analysis |
| Beta/默认关闭 | reproduce、image-creation、data-charts、paper-to-slides、news、benchmark-radar、extensions、paper-review |
| 已有公开文档 | README/README.zh-CN、workspace-session-model、project-libraries、managed-latex-engine、reproduce、data-analysis、paper-deep-reading 等；但缺少开发/验证/发布规范类文档 |

这意味着：main 的产品叙事是“有想法的科研工作台原型”，还不是“稳定可分发的一流开源桌面软件”。

### 2.2 上游开放 PR（不要重复做）

| PR | 模块 | 说明 | 状态提醒 |
| --- | --- | --- | --- |
| #341 | 数据归属 foundation | 异步 IPC/agent/terminal 的 workspace owner 保持 | open fork source；许多后续 PR 依赖它 |
| #342 | discovery | 按项目恢复发现查询与收藏上下文 | open；之前已补真实截图 |
| #345 | 工具链/desktop | 显式准备 Electron runtime、完整 test 入口 | open；main 仍缺此能力 |
| #346 | library/BibTeX | BibTeX 前后转换、PDF 身份区分 | open；此前记录仍有 parser/roundtrip 细节待查 |
| #347 | writing | 编译产物与源码版本绑定 | open |
| #348 | writing | 继续已有稿件、正确项目选择 | open |
| #350 | files | 按 execution root 保存草稿/结果 | open |
| #351 | navigation | research-app 入口可达、错误可见 | open；已有截图 |
| #352 | perf/files | snapshot 读取预算 | open；before-only 限制曾有发现 |
| #353 | reproduce | Docker/SSH 结构化路径边界 | open |
| #354 | agent | 未完成的模型流/工具批次不能被当作完成 | open；最高优先级 correctness |
| #355 | packaging | 浏览器 WASM 语义包，排除未使用 native ONNX | open；有真实 asar 审计 |
| #356 | workspace | 中断恢复与退出清理 | open；fork #4 被它取代 |
| #308 | research graph | versioned lineage + recorded experiments，42 files / +6839 | open, mergeable，主线大 PR；#340 已被维护者指向它 |
| #334 | release | release/0.1.0，含 LICENSE/changelog/下载说明 | open，非本轮功能交付 |

#340 已被维护者 JiayuuWang 关闭，理由是该功能正在 #308 中开发；不要重开。  
#343、#344、#349 已关闭/暂缓，分支保留但排除在交付外。  
#336 是已关闭的拆分索引，不要重开；维护者明确要求拆成多个独立 PR。

### 2.3 fork 开放 PR（不要直接照搬成上游 PR）

| Fork PR | 模块 | 说明 |
| --- | --- | --- |
| #1 | task selection foundation | 项目/会话/执行目录统一选择，基于 #341 |
| #2 | manuscript citations | 引用插入与 bibliography 更新 |
| #3 | composer handoffs | 会话草稿、附件、笔记归属 |
| #4 | workspace recovery | 已被上游 #356 取代，保留讨论 |
| #5 | manuscript review/revisions | 当前稿件 PDF 审稿与反馈交接 |
| #6 | manuscript → slides | 任务交接与配置准备 |
| #7 | data analysis save/reopen | 完整分析保存/重开，含真实截图 |
| #8 | named manuscript versions | 命名版本保存/比较/恢复，含真实截图 |

GitHub 不能跨仓库 retarget fork PR；依赖合并后应在上游新建分支/PR，并链接原 fork 讨论。不要强推或删除 fork 分支。

### 2.4 未发布的本地实现（不要重新实现）

已冻结在 `codex/research-continuity` / `f6b5ee3`，并有主工作区未提交修补：

- **O07** 复现全过程停止与资源清理：`electron/reproduction/run-manager.cjs` 等；测试 `reproduction-lifecycle` / `reproduction-backends`。
- **O09** 输入变化使检查失效 + 保存输入/运行历史：`run-snapshot.cjs`、`contract.cjs`、`pilot.cjs` 等。
- **O10** 完整日志落盘 + 有界内存尾部：`target-log.cjs` 等。
- **O15** 可编辑图表包保存/重开：`ImageCreationView.tsx`、`figure-image.ts`。
- **O16** 已保存图表插入稿件 + 来源 receipt：`project-result-commands.cjs` 等。
- **O20** 项目导出/恢复与 ID 重映射：`project-transfer*.cjs/ts`；未提交的 milestones/notes/rollback 也要纳入。
- **O21** CSV/JSON 数值比较与十进制容差：`metric-comparison*`、`MetricComparisonPanel.tsx`。
- **N01** handoff 服务提取；**N04** 项目研究索引与用户结论/问题（含历史 run 导航修复）。

这些不是“待开发功能”，而是“待拆分/验证/发布的功能”。之前整体套件曾达到 `1466 tests / 1460 pass / 0 fail / 6 skip`，但那是在这些未提交材料之前/混合状态下，不能当作每个独立分支的最终证明。

---

## 3. 模块成熟度矩阵

状态列含义：`main` 已有 / `PR` 已有开放 PR / `local` 有未发布本地实现 / `gap` 真缺口。

| 模块 | main 现状 | 已有覆盖 | 对标一流项目的差距 | 下一步性质 |
| --- | --- | --- | --- | --- |
| 首次启动 / onboarding | 无向导；README 让 coding agent 安装；无 workspace 时 home 被当数据目录 | issue #321（空正文），无 PR | 差：一流工具第一次打开就能“选目录—配模型—看到示例/下一步” | **新模块，可独立开工** |
| 项目 / workspace / session 数据模型 | 有模型与 UI；心智负担高 | #341/#350/#356、fork #1/#3 | 中： ownership/lifecycle 正确后才谈协作与多设备 | 先让 PR 落地，勿重复 |
| Chat / agent / 模型后端 | API + Codex/Claude/OpenCode；beta 能力多 | #354（stream finality）、#345（runtime prep） | 中：工具执行审批、错误呈现、恢复、上下文预算仍需打磨 | 依赖 PR 合并后再收口 |
| Library / PDF / citations | 基础 library、PDF 阅读、标注、BibTeX 交换 | #346、fork #2；#344 closed | 中：BibTeX roundtrip 细节、Zotero 兼容、来源链路 | 在 #346 上补，不另起 |
| Discovery（daily/news/benchmark/extensions） | daily 默认开，其余多默认关；benchmark 公共索引刚修 | #342；#308 关联 research graph | 中：查询状态、来源可追溯、去重与导出 | 等 #342/#308 稳定 |
| Reproduce | Beta/默认关；M1/M2 有基础 | #353、#356；本地 O07/O09/O10/O21 | 大：停止/清理、日志、输入快照、数值比较、远程真实证据 | 拆分已有本地实现 |
| Writing / LaTeX | 默认开；多文件稿件、模板、Tectonic | #347/#348、fork #5/#6/#8、N03（fork #8） | 中：版本、引用、审稿、slides 的闭环要打通 | 复用现有 PR/分支 |
| Data analysis / figures | 分析默认开，图稿 Beta | fork #7、本地 O15/O16、#355 | 中：保存/重开、来源 receipt、包体资源 | 复用现有实现 |
| Workbench / Files / Terminal | tab、分屏、终端、草稿 | #350、#352；Windows 有 #296（非本目标系统） | 中：快照预算、保存归属、错误可见性 | 等 PR 落地 |
| Collaboration / cloud | 有 auth、Supabase、CRDT notes 等实现 | #341 等 ownership 修复；O24/O25 本地；issue #261 | 大：Yjs 中继方向未定；云同步最终态/删除日志未发布 | 先定 issue #261/#273，再动模块 |
| Research graph / provenance | main 尚无 | #308 open；issue #307 | 大但已有主线：版本化对象、run 记录、lineage UI | 不要把 #308 拆散重做 |
| Extensions / plugin API | registry + runtime plugin entries + marketplace | fork PRs/本地材料部分依赖；issue #196/#256 | 中：插件清单、权限、沙箱、文档不足 | 后置 |
| Release engineering | 未签名 DMG、无 CI、无 LICENSE（main） | #334 release branch、#345、#355；签名按用户决定暂缓 | 大：公开仓库需要 LICENSE、CI、quickstart、可复现发布 | 可从 release branch 借，不重复建 |

---

## 4. 什么算“对标一流开源项目”

我们不需要复制大厂功能，而要对齐以下可验证品质。每个维度给一个对标对象和 Archimedes 现状。

| 维度 | 对标对象 | 一流项目做法 | Archimedes 现状 |
| --- | --- | --- | --- |
| 本地优先与数据可迁移 | Zotero、Joplin、Zettlr、Logseq | Zotero 用本地 `zotero.sqlite` + WebDAV/同步；Joplin 开放格式 + E2EE；Zettlr 保存普通 Markdown；Logseq 经典版读写 Markdown/Org 文件 | 有本地 workspace/DB，但“数据目录=home”的首次体验不透明；项目导出/恢复在 O20 未发布 |
| 证据与来源可追溯 | RO-Crate、Quarto、Zotero | RO-Crate 用 `CreateAction`/`agent`/`instrument`/`object`/`result` 记录机器可读来源；Quarto 让文档可执行可复现；Zotero 把 source/PDF/note/bibliography 放一起 | 已有 citation/provenance 方向，但分散在多个 PR；项目研究索引（N04）未发布 |
| 扩展机制 | AnythingLLM、Open WebUI、LobeHub | AnythingLLM 桌面版 + workspaces + MCP + agent flows + source citations；Open WebUI 有 Tools/Pipelines/MCP/RBAC；LobeHub 有 Agent Builder/Skill Store/定时任务 | registry 和 marketplace 有骨架，但插件契约/权限/文档不足；issue #196/#256 |
| 首次体验 | AnythingLLM、Zettlr | 文档强调“minutes to start”；Zettlr 自带 tutorial、Homebrew/安装包 | README 推荐 agent 安装；issue #321 无正文；这是最明显短板 |
| 发布工程 | Zettlr、AnythingLLM、Zotero | 多平台安装包、Homebrew/包管理器、自动更新、CHANGELOG、LICENSE、CI | main 无 LICENSE/CI；release 分支 #334 有 LICENSE/changelog；签名暂缓 |
| 文档体系 | Zettlr、Quarto、Open WebUI | quickstart、first-time guide、architecture、API、FAQ | 功能文档不少，但缺“从零到第一次成功”的连贯路径和架构总览 |
| 质量门禁 | 成熟 OSS 通用 | CI 跑 lint/test/build/theme；真实平台证据；issue/PR 模板 | 本地历史 gate 很强，但 main 无 CI；很多验证只存在本地日志 |

授权/许可提醒：Open WebUI 有自定 license 与 branding 条款，LobeHub 有 Community License，AnythingLLM 仓库 MIT 但桌面应用有单独条款。Zettlr GPL、Zotero 开源、Quarto 开源、RO-Crate 规范开放。Archimedes 上游 main 当前没有 LICENSE，release 分支 #334 引入 MIT；不要另开重复 LICENSE PR。

---

## 5. 模块修复建议（按一个模块一个模块推进）

### 阶段 0：先“对齐已有工作”，不要新开功能 PR

- 核对 #341–#356、#308、#334、fork #1–#8 的真实状态（mergeable、冲突、是否已被其他 PR 覆盖）。
- 确认 #340 关闭（由 #308 覆盖）、#343/#344/#349 暂缓；不要复活。
- 把 `codex/research-continuity` / `f6b5ee3` 的未发布实现按 PR_SPLIT 的 hunk 归属拆成独立分支，而不是整文件复制；每支跑自己的 focused + lint/build/theme，并注明依赖。
- 这一步不产生新 PR，但决定后面每个模块能不能避免重复。

### 模块 1（建议最先做）：首次启动 / 新手指南

- 现有：issue #321（空标题），无 PR；之前调研 `docs/reviews/2026-11-17-macos-distribution-onboarding/RESEARCH.md` 已记录 home-as-workspace 问题和新用户向导草案。
- 目标：全新用户打开后，明确选择/创建数据目录（默认 `~/Documents/Archimedes`），可跳过模型配置，首页显示下一步和一个可删除的示例项目。
- 对标：AnythingLLM 的“workspace + 分钟级上手”、Zettlr 的 tutorial、Zotero 的清晰 library 概念。
- 验收：无 `last-workspace.json` 时不出现 home 文件树；跳过模型仍能看 PDF/本地文件；已有用户体验不变；中英文一致；向导可再次打开。
- 边界：这是 UI 模块，按 AGENTS.md 需要先有 issue/批准；当前只做调研，不开 PR。

### 模块 2：数据归属 / workspace / session 地基

- 已有：#341、#350、#356、fork #1/#3，以及部分本地 N01 handoff 提取。
- 不要做：重新设计 TaskSelection/owner；在 UI 层绕过 owner 修 bug。
- 缺口：这些 PR 尚未合并；需要按依赖顺序验证/合并，再做“同 ID 不同 dataRoot”“历史 execution root”“延迟回复归属”等真实证据。
- 对标：本地优先工具的核心是“数据是谁的、换了目录还能不能找到”。

### 模块 3：Library / PDF / BibTeX

- 已有：#346（BibTeX + PDF 身份）、fork #2（稿件引用）、#344 closed（项目选文理由暂缓）。
- 已知待查：#346 历史记录里仍有 citation-key 冲突、`inproceedings.booktitle`、TeX accent roundtrip、导出预览失效、翻译告警等 finding；这些属于同一模块，应回原 PR 修，不另开。
- 对标：Zotero 的 source/PDF/note/bibliography 一体；Zettlr 的引用管理器集成和 9000+ 样式。短期不追求 9000 样式，但要把“导入—去重—引用—回写”做成可信闭环。

### 模块 4：Writing / LaTeX 闭环

- 已有：#347（源码版本绑定编译产物）、#348（继续已有稿件）、fork #5（review/revisions）、fork #6（slides）、fork #8/N03（named versions）、fork #2（citations）。
- 不要做：新写版本管理、引用插入或审稿 UI；它们都已在分支中。
- 缺口：依赖链长，必须等 ownership 与 bibliography 合约稳定；编译 receipt 要用真实 Tectonic 日志，不用模拟。
- 对标：Quarto 的可复现发布、Zettlr 的模板/导出、TeXstudio 的成熟编辑器细节；Archimedes 的差异化是“证据链 + agent 协作”，不要和 TeXstudio 拼编辑器功能。

### 模块 5：Reproduce / 实验证据

- 已有：#353（结构化路径）、#356（恢复/清理）、本地 O07（停止/清理）、O09（输入快照/历史）、O10（日志）、O21（数值比较）。
- 不要做：重新实现 run-manager、log tail、metric comparison UI。
- 缺口：缺少真实 SSH/Docker/进程清理证据、长输出/尾部测量、同视口 before 截图；需要按 O07→O09/O10→O21 的依赖顺序拆分发布。
- 对标：RO-Crate 的 run provenance（谁、用什么工具、输入是什么、结果是什么）、Quarto 的可执行文档。#308 的 graph foundation 要和这条链对齐，不能各说各话。

### 模块 6：Data analysis / 图稿

- 已有：fork #7（完整分析保存/重开）、本地 O15（图稿包保存/重开）、O16（插入稿件）、#355（WASM 包体）。
- 不要做：再写一套 project-results schema 或 figure staging。
- 缺口：FigureForge 仍是 beta；需要“保存—重开—输入变化使旧输出失效”的可视证据，以及多文件稿件插入的真实源 receipt。

### 模块 7：Collaboration / Research graph

- 已有：#308 open（versioned lineage + experiments，大 PR）、issue #261（Yjs 实时中继方向）、issue #273（数据模型讨论）、O24/O25 本地（云同步最终态/删除日志）。
- 不要做：在 #308 之外另起 graph foundation；不要先实现云端同步再定 L1-L3 边界。
- 缺口：需要先在 issue 层确定 Project/Workspace/Session 与 graph、协作的最终关系，再决定 O24/O25 何时发布。

### 模块 8：扩展 / Research Apps

- 已有：sidebar registry、runtime plugin entries、marketplace；issue #196/#256；多个 app beta。
- 缺口：插件清单/权限/沙箱/文档。Archimedes 的 agent 会执行 shell 和写文件，插件安全模型必须比普通笔记软件更严格。
- 后置：先完成数据 ownership 和基础模块，否则插件会放大不确定性。

### 模块 9：发布工程（不做签名）

- 已有：release branch #334 含 LICENSE/changelog；#345 工具链；#355 打包审计。
- 用户决定：签名/公证/自动更新暂缓；不要申请 Apple 账号、不要引入 `electron-updater`。
- 仍可做且不冲突：把 #334 的 LICENSE/发布说明并入 main 的路径理清；建立 CI 跑 lint/test/build/theme；补 CONTRIBUTING/架构文档；包体瘦身；清晰标注未签名安装的 Gatekeeper 步骤（macOS 15+ 用 System Settings → Privacy & Security，不再写右键 → Open）。
- 对标：Zettlr 的多渠道发布、AnythingLLM 的桌面/服务器双形态、Zotero 的透明同步/storage 说明。

---

## 6. 推荐执行顺序（一次只推进一个）

1. **对齐与去重（现在）**：确认 PR/分支状态，记录哪些模块已有实现；不写代码。
2. **首次启动 / issue #321**：唯一没有现有 PR 覆盖、用户价值最高的新模块。
3. **数据归属地基**：#341 → fork #1/#3 → #350/#356 的依赖顺序；每个独立验证。
4. **Library/BibTeX**：回 #346/fork #2 修既有 finding。
5. **Writing 链**：#347/#348 → fork #5/#6/#8，按源码版本 receipt 串起来。
6. **Reproduce 链**：本地 O07/O09/O10/O21 拆分 + 真实证据；与 #308 对齐 provenance。
7. **Analysis/Figure**：fork #7 + O15/O16。
8. **Collaboration/Graph**：先闭 issue #261/#273 的决策，再动 O24/O25/#308 集成。
9. **Release polish**：CI、LICENSE 路径、文档、包体；签名暂缓。

每完成一个模块，先确认其 PR/分支被合并或明确落地，再启动下一个；否则会重演“多个 PR 相互依赖、最终组合未验证”的局面。

---

## 7. 明确不做的事

- 不开 PR、不改产品代码（本次调研阶段）。
- 不重做 #341–#356、#308、#334、fork #1–#8、本地 O07/O09/O10/O15/O16/O20/O21/N01/N04 已覆盖的功能。
- 不 reset/clean/stash/覆盖主工作区的未提交工作；不切换主工作区分支。
- 不 push upstream main，不 force-push，不合并 PR，不发布 release。
- 不做签名/公证/自动更新（用户已决定暂缓）。
- 不把 `docs/reviews/` 内部材料放进公开 PR。
- 不把模拟模型输出、截图或历史整体套件结果冒充某个独立分支的真实证据。
- 不忽视 AGENTS.md：UI 模块、数据模型、依赖、构建/发布变更需要先有 issue 和批准。

---

## 8. 需要用户决定的问题

1. 是否同意把 **首次启动 / issue #321** 作为第一个模块？这是当前唯一没有 PR 冲突的高价值新模块。
2. 对已有 open PR：我们是否先等维护者合并，还是先在你授权下做“拆分/验证/更新原 PR”的工作？后者仍可能产生 push，但不开新 PR。
3. 本地未发布功能（O07/O09/O10/O15/O16/O20/O21/N01/N04）：是否按 PR_SPLIT 顺序逐个拆分发布？需要明确每个模块的验收证据标准。
4. issue #321 只有标题，可否由我先补一份“首次启动向导”的产品/验收草案（仍只写内部文档，不开 issue/PR）？
5. 发布工程在签名暂缓后，是否把“CI + LICENSE + 安装文档 + 包体瘦身”作为第 9 模块？

---

## 9. 证据与来源

### 9.1 本地/GitHub 事实

```text
origin/main = 99b3d07  fix(benchmark-radar): use the original canonical catalog and migrate stale caches
main ancestors include 57ca05a (#337/#338/#339 merges)
main: no LICENSE, no .github/workflows, no docs/development-validation.md
main README: recommends copy-to-agent install; renderer-only preview not sufficient
main package.json: no engines; scripts lack prepare:desktop / test:core / test:desktop
main shared/research-apps.json: defaultEnabled = library,daily,writing,data-analysis
beta apps = reproduce,image-creation,data-charts,paper-to-slides
```

- 上游 open PR：#296、#308、#334、#341、#342、#345、#346、#347、#348、#350、#351、#352、#353、#354、#355、#356。
- 同系列已关闭/暂缓：#340（维护者指向 #308）、#343、#344、#349；#336 为已关闭的拆分索引。
- fork open PR：#1–#8（#4 已被 #356 取代）。
- open issues：#321 新手指南、#307 research graph、#273 数据模型、#261 Yjs 协作、#218 Reproduce 路线、#209 composer、#196 Extensions、#158 协作/团队、#143 开源定价等。
- 内部记录：`docs/reviews/2026-11-16-research-continuity/{CLOSEOUT,PAUSE,PR_SPLIT,PRODUCT_CLOSEOUT,independent-review}.md`、`docs/reviews/2026-11-16-system-review/README.md`。

### 9.2 外部对标资料

- Zotero：https://www.zotero.org/ （本地 `zotero.sqlite`、WebDAV、开源、引用管理）
- Zettlr：https://www.zettlr.com/ 与 https://github.com/Zettlr/Zettlr （纯 Markdown、Zotero 集成、Pandoc 导出、无遥测、Homebrew/安装包、自带 tutorial）
- Quarto：https://quarto.org/ （可执行/可复现文档，多格式发布）
- RO-Crate provenance：https://www.researchobject.org/ro-crate/specification/1.1/provenance.html （CreateAction/agent/instrument/object/result）
- AnythingLLM：https://github.com/Mintplex-Labs/anything-llm （桌面本地优先、workspaces、agent flows、MCP、source citations；注意桌面应用单独条款）
- Open WebUI docs：https://docs.openwebui.com/alternatives/anythingllm/ （Tools/Pipelines/MCP/RBAC、hybrid RAG）
- LobeHub：https://github.com/lobehub/lobehub （Agent Builder、Skill Store、MCP Marketplace、定时任务、白盒记忆；注意 Community License）
- Joplin / Logseq 本地文件与加密同步对比：https://www.barside.space/content/best-local-first-apps
- Local-first for researchers / claim trail 对比：https://www.atlasworkspace.ai/blog/pkm-apps-for-researchers
- TeXstudio 成熟 LaTeX IDE 功能对照：https://www.texstudio.org/

---

## 10. 一句话版本

**Archimedes 当前不是“缺几个功能”，而是“已有大量未合并/未拆分的正确工作 + 缺首次体验与发布地基”。先对齐去重，再从 issue #321 的首次启动模块开始，一个模块一个模块收口；对标 Zotero/Zettlr/RO-Crate/AnythingLLM 的可迁移数据、来源可追溯、扩展性与发布规范，而不是盲目堆新功能。**
