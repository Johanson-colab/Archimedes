# 科研工作台产品与研究流程审阅

> 阅读说明：前部是基于初轮 SHA 的历史审阅及当时验证，旧阶段的“未修”、1274/1288 和条件缺失不是当前结论。后续实施另列；当前交付状态统一见[总报告](README.md)和[实施矩阵](IMPLEMENTATION.md)。

Archimedes 已经具备可用的文献阅读、局部证据整理、本地 Agent 执行和 LaTeX 编辑能力。当前最影响真实研究使用的，不是工具数量，而是研究任务在这些工具之间能否保持同一归属、同一输入版本和可继续的上下文。应先让研究者可靠地完成一份文献短名单、一次可核查实验或一篇持续迭代的稿件，再扩展自动科研的覆盖范围。

本轮重点有五项：统一当前任务的归属；保证判定对应当前计划；保留文献筛选过程；连接分析成果与稿件；简化入口并优先支持继续已有工作。前两项关系到文件和研究结论的可信度，优先于增加新能力。

## 范围与证据

原版基线为 `main` 提交 `1f4b37581c446770d576440f9ebb9bca5c55bfb7`，本地目录为 `/Users/fei/Desktop/Archimedes`。原版缺陷引用按该基线理解；本轮修复状态另行标明。本报告是产品与工作流审阅，涉及前后端契约时与本目录的工程报告交叉核对。

角色、频率和使用成本是根据现有入口与实现推导的产品假设，不是用户访谈或使用数据。未使用真实凭据、付费模型、远端算力或私有研究资料；没有评价生成内容的科研正确性，也没有完成一篇真实论文的端到端复现。纯注入模型/执行器的运行检查用于验证状态转换，不代表真实模型或 Docker/SSH 运行通过。

已运行以下五组现有检查，合计 **40 通过、0 失败**：

- `electron/deep-paper-search.test.cjs`：跨来源去重、模型不可用时的透明降级。
- `electron/scoped-annotations.test.cjs`：项目内高亮、阅读报告、论文讨论，以及个人阅读状态。
- `electron/reproduction-contract.test.cjs`：claim、原文证据、容差及 runbook 契约。
- `electron/data-analysis.test.cjs`：真实示例数据统计、抽样、实际 React 组件与有界聊天草稿。
- `electron/library-workspace.test.cjs`：实际 React 组件的文档切换、阅读任务保护、笔记失败保存与元数据队列。

这些结果说明单模块已有值得保留的行为；它们没有覆盖 App 层跨模块选择、目录与附件的统一归属，不能据此认定整个工作流已经接通。

前端审阅在隔离浏览器的同一 App、`previewBridge` 环境中，已用真实交互复现：首页默认设置下点击 Reproduce a paper 返回相同首页，点击 Generate figures 后可访问界面状态不变；事先存在的未发送草稿，在 Data analysis 输入问题并 Continue in chat 后被新摘要替换，未出现选择或确认。没有提交消息或调用模型。这些证据只覆盖 renderer 交互，不能用来证明 Electron 的原生目录和文件 I/O。 [观察记录与截图](frontend-evidence/browser-observations.json)。随后原生 Electron 的真实 main/preload 与隔离磁盘核验确认：A 未保存 README 草稿出现在 B 的同名文件，Save 后 B 磁盘变为 A 草稿、A 磁盘不变。[原生文件记录](frontend-evidence/files-cross-project-observation.json)。这两条原版路径已有局部修复：Files 已通过最终原生同名文件和延迟保存复验；Writing 也已通过最终原生复验：切 A 不改 A、B 离开即保存，回 B 恢复正确稿件和 Saved 状态。它们没有解决 App 的全部实体身份问题。[最终原生验收与磁盘记录](frontend-evidence/post-fix-native-validation.json)。

本轮逐步骤证据失效与 shell 命令保真修复已应用主工作区，涉及 pilot/contract 及其行为测试。主要领域规则经产品独立运行 pilot 检查和原版/修复版对比探针验收：执行条件变化后，旧输出不能登记新 passed/failed，manual 仍可作为人工诊断；仅改验收条件可显式重评，展示/重排和无关步骤不清。最终命令增量只 trim 首尾，保留内部空格与换行；contract 的三处命令字段在 JSON 回读后也保持。主工作区受影响及相邻 63 项通过、diff 检查通过。此处是局部修复，不代表输入文件、环境或跨步骤依赖的版本绑定已解决。当前实现见 [pilot.cjs:263](/Users/fei/Desktop/Archimedes/electron/reproduction/pilot.cjs:263)、[pilot.cjs:544](/Users/fei/Desktop/Archimedes/electron/reproduction/pilot.cjs:544) 和 [contract.cjs:24](/Users/fei/Desktop/Archimedes/electron/reproduction/contract.cjs:24)。

| 覆盖范围 | 读到的实现层 | 本轮执行证据 | 未覆盖的关键环节 |
| --- | --- | --- | --- |
| 文献发现与文献库 | renderer、检索服务、保存/分域数据模型 | 搜索降级/去重；Library 实际组件、笔记恢复和项目分域 | 实时学术来源质量、真实模型重排与完整阅读旅程 |
| PDF 阅读与代码证据 | 阅读器、paper-chat 参数、IPC、项目化 annotations | Library 组件和 scoped annotations 检查 | 长论文生成质量、真实 Codex 深读、真实仓库审阅 |
| 复现 | renderer、main、contract/planner、pilot、run store | 契约检查；注入决策/执行器重现旧证据错配 | Docker/SSH、机器环境变化、真实实验数值 |
| 数据探索与聊天交接 | parser、plot、实际 React 组件、App composer | 真实内置数据计算/组件；浏览器草稿替换交互 | 用户原始文件的原生访问、完整数据 AI 分析 |
| 写作与交付 | 源码编辑、文件/编译 IPC、评审输入/hash、slides handoff | 原版错写/入口已原生核验；Files 与 Writing 修后原生均通过 | 继续稿件正门、真实编译、真实模拟评审及生成演示 |
| 协作与扩展 | 入口、配置与相关分域边界 | 本产品报告未专项运行 | 多人同步、账号/权限和任意 MCP 组合能力 |

## 本轮局部修复与剩余产品边界

三组局部修改均已应用主工作区，未提交：

- **复现证据与命令保真。** 前述逐步骤规则与 shell 内部空白/JSON 回读修复已完成；不扩为跨步骤、数据或环境版本平台。
- **Files 文档作用域。** 草稿、saving、冲突与错误按执行 root 分域；保存捕获 owner，迟到读取/刷新/返回使用目录代际与草稿版本保护。实际 reload 回调的同 root 和 A→B→A 两种时序均保留新输入。Files 原生 A dirty→B 同名→独立保存→回 A 恢复已通过；真实延迟 A Save 返回也未覆盖 B 的继续输入或磁盘。范围是文件编辑身份，不是 App 所有项目/thread 选择状态。当前接线见 [App.tsx:2367](/Users/fei/Desktop/Archimedes/src/App.tsx:2367)、[App.tsx:3125](/Users/fei/Desktop/Archimedes/src/App.tsx:3125)。
- **Writing 文档与异步归属。** 按 root 缓存文档，离开 root/文件时将最新稿保存至原 owner；保存中继续输入、失败重试与旧 openRequest 不重放均有实际组件/临时磁盘证据。编译 progress 绑定 workspace/requestId/path，旧两参数调用兼容。当前见 [PaperWritingView.tsx:139](/Users/fei/Desktop/Archimedes/src/PaperWritingView.tsx:139)、[paper-writing-state.ts:63](/Users/fei/Desktop/Archimedes/src/paper-writing-state.ts:63)、[PaperWritingView.tsx:311](/Users/fei/Desktop/Archimedes/src/PaperWritingView.tsx:311)。最终原生 Writing 同路径复验通过：B 稿离开即保存 B，A 保持原文且没有重放旧 B 打开事件，回 B 保留稿件并显示 Saved，Auto compile 始终关闭。继续稿件正门入口并未在本轮新增。

最终统一全套为 **1288 项，1274 通过、7 失败、7 跳过**，相较原版仍是同名七项失败；质量已逐名核对为 Git alias 身份三项、翻译排序一项、宿主 Windows-shell 模拟三项。lint/build/theme 各退出 0。三项旧 harness 的接线/实现定位适配保留原行为要求，独立复核通过，没有通过删除断言取得结果。分层测试与原生证据见 [质量](quality.md) 和 [前端](frontend.md)，不把重叠聚焦项相加。最终原生 Files/Writing 三组场景也均通过；[验收 JSON](frontend-evidence/post-fix-native-validation.json)记录受测代码哈希、实际磁盘内容与 SHA256。Electron/预览已关闭，临时 profile、项目和包装器已清理。

上述修复不包括 Library 只换 project 而保留旧 thread、App 执行 context 混搭、全局 SQLite store、取消/恢复、symlink 边界、数据分析替换草稿与首页路由，也没有新增跨进程草稿存储、真实 TeX/模型或科学实验验收。它们仍是后续任务。

## 目标研究者与应当交付的结果

最契合现有实现的首要用户，是会阅读英文 PDF、使用代码仓库与本地文件、愿意配置模型或 native agent 的个人 CS/ML 研究者或研究生。AI 论文主题、会议目录、代码审阅、复现环境和 LaTeX 工具共同支持这个判断。面向任意学科、完全无需配置的通用科研助手，以及多人共同拥有长期研究资产的团队平台，目前都不是同等成熟的使用场景。

| 研究任务 | 使用节奏与成本假设 | 真正需要留下的结果 | 失败后果 |
| --- | --- | --- | --- |
| 找相关工作并筛选 | 频繁、短时；普通检索成本较低，深搜可包含模型调用 | 研究问题、筛选标准、候选与入选理由，随后能继续阅读 | 重复检索、丢失排除理由，综述难以回溯 |
| 阅读并核对论文与代码 | 频繁；全文深读可能是较长任务 | 具体 claim、原文页码、代码位置和 commit、已确认与待核实项 | 看过资料却无法重建判断依据，重复消耗调用成本 |
| 复现或分析实验 | 间歇但时间与机器资源成本较高 | 固定输入/计划、实际命令、原始输出、有效判定、限制 | 错把旧条件的证据归给新实验，后续论证失真 |
| 写稿、修稿与准备展示 | 写作阶段高频；本地修改直接影响资产 | 可继续的稿件、图表与来源、当前 PDF 版本、修订事项 | 写错目录、丢草稿、评审针对旧稿、展示素材与当前稿脱节 |
| 回访或交接 | 低频但必须可靠 | 最终成果、决策理由、尚未解决的问题，以及打开它们的路径 | 只剩聊天和分散文件，新接手者需重新调查 |

产品完成度应以这些结果能否可靠留下为准。页面能打开、模型能作答和命令退出成功，各自只证明工作流中的一部分。

## 实际数据与上下文如何分域

目前存在几种合理但不同的作用域，界面和跨模块动作尚未完全统一它们。

| 对象 | 当前归属方式 | 产品含义 |
| --- | --- | --- |
| 主数据目录 | `workspace` 下的 `.archimedes/archimedes.db` | 设计意图是随窗口选择主数据目录；实际主进程 store 只有一个全局连接，尚不能视为已按窗口隔离。它也不等于每个任务的执行目录 |
| 项目与执行 workspace | `activeProjectId`、`activeWorkspaceId` 分别选择 | 项目组织主题，workspace 组织实际文件或隔离副本 |
| 普通会话 | `activeThreadId`；会话保存 `workspace_path` | 文件、终端和写作的实际目录优先使用会话目录 |
| 论文元数据与个人阅读状态 | canonical paper 去重；notes、星标、阅读状态按 paper＋user | 个人通读笔记跨项目共享有合理性，不应把它误当项目专属的选文理由 |
| 高亮、深读报告、论文讨论 | 已有 project＋paper 分域 | 这是可复用的正确先例，不必把所有讨论塞回一个全局聊天 |
| 复现 | 主数据目录中的全局对象，关联 paper，未关联 project | 后台执行独立于聊天是合理的，但研究用途与运行版本的归属不足 |
| CSV 分析与 FigureForge | 当前组件内存；未接收 projectId | 侧栏切换可暂存页面，不能解释为已保存到当前项目 |
| LaTeX 稿件 | 当前执行目录中的文件；编辑器另有 activeProject/mainPath | 文件真实落盘，但“稿件项目”与顶栏研究项目是不同对象 |

依据：[App.tsx:1508](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/App.tsx#L1508)、[App.tsx:1566](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/App.tsx#L1566)、[store.cjs:19](/Users/fei/Desktop/Archimedes/electron/store.cjs:19)、[store.cjs:895](/Users/fei/Desktop/Archimedes/electron/store.cjs:895)、[store.cjs:417](/Users/fei/Desktop/Archimedes/electron/store.cjs:417)、[store.cjs:1646](/Users/fei/Desktop/Archimedes/electron/store.cjs:1646)、[store.cjs:3267](/Users/fei/Desktop/Archimedes/electron/store.cjs:3267)、[PaperWritingView.tsx:131](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/PaperWritingView.tsx#L131)。

## 四条代表性科研旅程

### 任务一 从新方向得到可回访的文献短名单

**目标。** 在一个新项目中检索某方向，选三篇相关工作，记下为什么选择它们，阅读一篇后回到同一组候选。

当前 Daily 的查询、解释计划、相关性理由和候选结果都在组件 state；保存动作只传入 `result.paper`，没有把搜索问题、相关性解释或选择理由一起传入 library。Daily 又不是 keepMounted 模块，离开后会卸载。深搜本身可在没有模型时降级检索，这个能力已通过现有测试，不能将其描述为“没有 key 就无法使用”。

正常新建项目会由原版 createResearchProject 调用 ensureProjectLibraries 创建默认库，最后一个库也受删除保护。此前把“空库返回时 Save 禁用”的条件状态外推为正常新项目阻断，判断过强，现已通过 HEAD 源码与原生观察纠正；人工空库 fixture 不计作正常用户复现。实际痛点是离开发现页后筛选上下文丢失，以及研究者新建定向专题库需离页。页内创建目标应在已有默认库时也可用。普通搜索草稿丢失可从组件生命周期判定；付费深搜或外部来源真实调用未在本轮执行。

**评价。** 检索和收藏功能存在；“筛选过程成为项目资产”尚未形成。最低成本的修补是保留按项目隔离的发现状态、就地创建保存目标，并允许把选定候选与研究者编辑过的筛选理由保存为一份可回访记录。无需先建设语义记忆平台。

依据：[LibraryView.tsx:2548](/Users/fei/Desktop/Archimedes/src/LibraryView.tsx:2548)、[LibraryView.tsx:2662](/Users/fei/Desktop/Archimedes/src/LibraryView.tsx:2662)、[LibraryView.tsx:2683](/Users/fei/Desktop/Archimedes/src/LibraryView.tsx:2683)、[LibraryView.tsx:2832](/Users/fei/Desktop/Archimedes/src/LibraryView.tsx:2832)、[sidebar-registry.tsx:59](/Users/fei/Desktop/Archimedes/src/sidebar-registry.tsx:59)、[App.tsx:3585](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/App.tsx#L3585)。

### 任务二 从一个论文主张得到可核查的复现记录

**目标。** 阅读一个结果，核对原文和代码，选择要验证的 claim，运行后留下足以判断该 claim 的记录。

论文内的原文选择、代码片段、页码与 checkout commit 能进入同一 paper chat；写入和命令能力明确禁止，符合“先核对证据”的任务。项目化的高亮和论文讨论已有行为测试。runbook 对 claim 原文证据和容差的要求也是真实实现。

但从阅读器点击 Reproduce，只传 paperId、repoUrl、title。当前高亮、审阅结论、研究目的、checkout commit 没有随该动作传递；复现记录也没有 projectId。即使后续成功运行，用户还要手动把阅读判断和执行结果拼起来。

更基础的原版问题已用可控执行器独立重现：先执行 `old-check` 并通过，再以同一 step id 把命令和 checkpoint 改成 `new-check`，最后 `done`；实际执行列表只有旧命令，最终 runbook 却给新命令沿用旧证据和 passed。这不是“尚未比较论文数字”这么简单，而是当前所见计划与绿勾证据错配。原版 `normalizeSteps` 按 id 直接继承判定，`done` 仅检查状态，导致该结果。

**评价。** 执行器已有有价值的证据约束，但应先修复计划修订后的证据失效，再做数值比较。执行成功、检查点有证据、论文数值达标必须继续作为三个不同层次。

依据：[LibraryView.tsx:474](/Users/fei/Desktop/Archimedes/src/LibraryView.tsx:474)、[LibraryView.tsx:844](/Users/fei/Desktop/Archimedes/src/LibraryView.tsx:844)、[main.cjs:1266](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/electron/main.cjs#L1266)、[pilot.cjs:263](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/electron/reproduction/pilot.cjs#L263)、[pilot.cjs:679](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/electron/reproduction/pilot.cjs#L679)、[ReproduceView.tsx:679](/Users/fei/Desktop/Archimedes/src/ReproduceView.tsx:679)。可重复运行的原版探针见本目录 `backend-evidence/reproduction-lifecycle.cjs`。

### 任务三 从本地实验表得到图与可解释的文字

**目标。** 打开实验 CSV，检查缺失值和字段，绘图，向助手询问结果含义，再把图和方法说明放进当前稿件。

当前数据探索不是演示假图。真实示例的完整数据统计、缺失值处理、时间排序、展示抽样和实际 React 交互已有通过的检查。界面明确区分完整本地统计和给 AI 的五行样例，值得保留。

不过 CSV 仅通过 `File.text()` 读到 `{headers, rows}` 和文件名；发送到聊天的是摘要字符串，既不保存原文件路径，也不登记附件。Agent 不会自动获得这个 CSV。如果文件原本就在工作目录，可由用户另行附加或指明路径，但该 handoff 本身没有保证。它目前支持描述统计、图表解释和下一步分析建议，不足以支持全数据重新检验、建模或任意 Python/R 分析。

交接还有两层归属问题：分析视图没有 projectId；“Continue in research chat”把摘要以 replace 方式写入碰巧当前打开的会话草稿。SVG 则由浏览器下载，未与数据输入、配置和当前稿件形成同一成果记录。

**评价。** 应先把它做成可保存、可解释、可转交的小型数据探索台。新建一个关联分析 session 只能解决任务归属；要支持全数据后续分析，还必须明确选择保存/链接并附加原文件。无需把首版升级成完整 notebook 或通用数据平台。

依据：[DataAnalysisView.tsx:43](/Users/fei/Desktop/Archimedes/src/DataAnalysisView.tsx:43)、[DataAnalysisView.tsx:76](/Users/fei/Desktop/Archimedes/src/DataAnalysisView.tsx:76)、[DataAnalysisView.tsx:100](/Users/fei/Desktop/Archimedes/src/DataAnalysisView.tsx:100)、[App.tsx:3381](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/App.tsx#L3381)、[App.tsx:4145](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/App.tsx#L4145)。

### 任务四 继续既有稿件并完成评审与展示

**目标。** 第二天继续一篇 LaTeX 稿件，编译当前 PDF，做模拟评审，修订两个问题，再用该版本准备演示。

写作的多文件编辑、自动保存、编译状态、日志和诊断都存在。PDF 评审也会按内容 hash 缓存文档，并保存 projectId 与 run；slides 会启动独立 Work 任务，而不是覆盖当前讨论。这些基础机制应继续复用。

但写作入口偏向反复创建：renderer 显式令 `projects=[]`，已有项目列表永远不出现；activeProject/mainPath 只在组件内存。重启后从 Paper writing 进入会打开模板/导入选择器。后端 `listLatexProjects` 已经存在。原生对照进一步确认：普通 Files 文件树点击 `.tex` 仅打开通用预览；已有聊天里的工作区 `.tex` 链接则能正确激活 Writing。Import 是复制目录，不能把它等同“继续编辑原稿”。因此这是高频入口的缺失与发现成本，不是完全无法打开已有稿件。

稿件编译后，Paper review 和 slides 仍分别要求重新选择 PDF；当前写作面板没有把 compileResult 作为后续动作的来源。评审中的页码、quote 和弱点是已有结构化内容，但没有直接进入对应稿件的修订任务。结果可导出，不等于已经形成“这一版稿件→这些反馈→这些修改”的闭环。

原生操作还确认了更高优先级的写入问题：从 B 聊天链接打开 `paper/main.tex`、关闭 Auto compile、输入未保存 B 稿后立即切到 A，未点 Save，A 的同名文件就变为 B 稿，B 磁盘保持原文。原因是 workspace 变化重触发 openRequest/activateProject，openFile 又先用新目录保存旧 fileRef/draft；不能笼统说 Writing 完全没有重载。[原生步骤与磁盘记录](frontend-evidence/writing-observations.json)。该局部作用域修复已应用，并通过实际组件/临时磁盘检查和最终原生同路径复验：切 A 不改 A，B 稿自动保存至 B。

**评价。** 优先恢复“继续当前/最近稿件”，把模板放到 New 动作。然后从当前编译产物启动评审/演示，并带回源文件与版本链接。已有 PDF hash 与独立 run 可以承担这个连接，不需新建一套文档平台。

依据：[PaperWritingView.tsx:135](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/PaperWritingView.tsx#L135)、[PaperWritingView.tsx:169](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/PaperWritingView.tsx#L169)、[PaperWritingView.tsx:519](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/PaperWritingView.tsx#L519)、[main.cjs:973](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/electron/main.cjs#L973)、[main.cjs:1001](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/electron/main.cjs#L1001)、[paper-review.cjs:149](/Users/fei/Desktop/Archimedes/electron/paper-review.cjs:149)、[PaperReviewView.tsx:248](/Users/fei/Desktop/Archimedes/src/PaperReviewView.tsx:248)、[App.tsx:3382](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/App.tsx#L3382)。

## 关键痛点与产品方向

### P0 当前项目 会话 目录和待发送上下文必须属于同一任务

**场景与后果。** 研究者在 A 会话停留后，从空文献库提示打开 B 项目；顶栏看似已经属于 B，却可能继续使用 A 的会话和执行目录。再从分析或写作进入聊天，资料与修改可能落到意料之外的任务。该问题横跨文件、附件、草稿和任务归属，不适合通过逐处添加确认框处理。

**当前证据。** 静态路径显示，`onOpenProject` 只改变 activeProjectId；activeThread 独立选择，executionWorkspace 优先旧 thread 的路径。contextItems 又是 App 全局 state，openResearchThread 不清理或恢复附件；与已经按 draftKey 保存的文本草稿不同。后端对 project/thread/workspace 混搭也没有统一阻止，详见工程报告。Files 跨项目同名草稿实际覆盖 B、Writing 切项目无需 Save 自动覆盖另一目录，均已由前端原生 Electron 与磁盘内容复现；两项局部修复已应用并通过最终原生同路径复验。Library 只改项目及跨会话附件仍是静态路径，不能一并升级为实测。分析交接直接替换草稿已在隔离浏览器实测。

**建议行为。** 将选择项目/workspace/session 收敛为一个任务选择动作：打开 B 项目，要么恢复 B 已有 session，要么明确进入 B 的新 session。文件草稿按执行根目录＋相对路径分域；文本、附件和未发送交接内容以目标 session 分域。顶栏、实际执行根目录和下一个动作的目标来自同一选择。后台运行的任务保持自己的身份，不能因用户换页面而改归属。

**最小方案与取舍。** 复用现有 composer draftKey、paper-chat 和 workspace 选择机制，统一 App 层入口和后端边界；不必先重做全局状态架构，也不必禁止用户在运行时查看别的项目。跨目录的未保存内容应保留在原任务，而不是默默带到新任务。

**验收。** 用两个目录、两个已有 session、同名文件、未发送文本与附件，依次切换项目、Library、Files、分析和写作：顶栏与实际 I/O 根目录一致；A 的草稿/附件不会写入 B；回到 A 可继续；重复点击相同对象不产生额外任务。切换失败时保留完整旧选择。

依据：[App.tsx:1467](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/App.tsx#L1467)、[App.tsx:1508](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/App.tsx#L1508)、[App.tsx:1569](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/App.tsx#L1569)、[App.tsx:2516](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/App.tsx#L2516)、[App.tsx:3283](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/App.tsx#L3283)、[App.tsx:3372](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/App.tsx#L3372)。

### P1 每个判定必须对应当前所见的计划与输入

**场景与后果。** 调环境、改实验命令、调整验收标准是正常复现行为。计划修订后仍自动沿用绿勾，会让研究者把旧条件的成功当成新条件的证据；增加数字比较不能修复这一基础错误。

**建议行为。** 分开“旧判定失效”与“必须重新执行”：

- command、detail、blocked 等执行条件变化，当前步骤清旧判定，并拒绝用修订前输出重新证明新执行。
- 只有 checkpoint/check 变化，清旧判定，但允许对同输入的已有原始输出显式重新评价。例如 score=0.95、阈值从 0.8 调为 0.9，无需重跑实验，但必须产生针对新标准的新判定。
- title 等展示改动、步骤重排以及其他未改步骤保留有效结果；历史日志和旧证据不删除。

证据适用范围限制的是当前执行的 passed/failed。manual 表示需要人判断，可回看旧错误作为诊断线索，不能因此让它变成新命令已经通过或已经失败的凭据；blocked 继续说明需要人提供什么。诊断连续性与当前实验判定应保持区别。

**最小方案与取舍。** 本轮已按步骤比较明确的执行/验收字段，并记录证据适用范围；不按数组顺序猜测依赖关系，不引入依赖图或自动科学判断平台。连续修订不能“洗掉”已经失效的证据。未建模的文件、环境和跨步骤依赖版本仍是明确限制。

FigureForge 已有正确先例：计划或参考图集合改变，派生 designContract 自动失效。反过来，Research path 的 accepted/stale 主要是内存状态，重开会话按 mode 推导前序 accepted；它适合作为讨论步骤导航，不宜表现为经过证据验证的科研进度。先把它改成诚实的工作模式导航，或继续保持可选，避免在事实层建立前就强化进度评分。

**验收。** 原版 old-check→同 id new-check 探针不再绿色完成；只改验收条件须重新 advance，但可复用适用的原始输出；只改标题和重排不重跑；只改 A 不清 B；所有历史仍可核对。数值比较在这个规则成立后再做。

依据：[pilot.cjs:263](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/electron/reproduction/pilot.cjs#L263)、[pilot.cjs:513](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/electron/reproduction/pilot.cjs#L513)、[ImageCreationView.tsx:245](/Users/fei/Desktop/Archimedes/src/ImageCreationView.tsx:245)、[App.tsx:1608](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/App.tsx#L1608)、[App.tsx:3238](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/App.tsx#L3238)。

### P1 让文献筛选留下研究问题与判断理由

**场景与后果。** 一周后研究者要解释为什么把三篇文章放在一起，或者为什么没有选某篇。当前 library 保存的是文献，相关性理由停留在发现页；个人 paper notes 又是跨项目的，不适合被自动塞入某次搜索的项目理由。

**建议行为。** 发现页可在当前研究项目内继续，创建保存目标不要求离开；选择一组候选后可保存查询、时间范围、来源/降级状态、入选论文和研究者编辑过的理由。机器相关性是候选建议，不能替代人的选择。阅读后能回到这份候选，而不是重新发起相同检索。

**最小方案与取舍。** 先保留项目隔离的页面状态，再将选定快照保存为可打开的项目文件/成果记录。无需保存所有浏览行为，也无需先做向量库、引用图谱或复杂系统综述平台。个人通读 notes 继续共享；项目特定的筛选理由另有归属。

**验收。** 正常新建项目已有默认库；在发现页创建第二个专题库，不丢检索结果地选为目标并收藏；去读一篇再返回，query 与候选仍在；保存快照重启后可读；两个项目对同一论文的用途不互相覆盖；模型不可用时的降级状态随快照保留。

### P1 把已有成果接到稿件 并优先让人继续工作

**场景与后果。** 研究者已经有 CSV、图、稿件或评审，系统却多次回到上传/选择/新建界面。重复输入不只是操作成本，也使后续任务失去源版本与研究目的。

**建议行为。** 写作入口先继续当前或最近稿件；CSV/图稿保存到明确项目后，成果能带数据指纹、绘图配置与来源进入 Files/Artifacts，并可插入当前稿件；从当前编译 PDF 启动评审与 slides；评审的选定问题可成为该稿件关联 session 的修订草稿，保留页码/quote、被评审 PDF 版本和返回链接。

**最小方案与取舍。** 先使用已有 listLatexProjects、PDF hash、Artifacts、paper-chat 和独立执行 run，做几个窄的直接交接。不需要新建一个统一知识图谱；也不应把所有来源文本无差别复制到全局聊天。CSV 摘要模式继续可用，只有用户明确附加原数据后，才支持基于完整文件继续分析。

**验收。** 重启可直接继续既有 `.tex`，不复制为第二份；当前 PDF 可带版本进入评审/slides；修订任务打开正确稿件；分析成果能重新打开并解释输入与参数；没有原始 CSV 时，聊天仍明确只收到摘要。

### P2 减少工具陈列 让入口与实际能力一致

**当前证据。** 首页始终显示 Reproduce/Generate figures，但对应模块默认隐藏；点击只 setMainSection，hidden-module effect 又把页面退回 chat，且没有说明。这两条已在隔离 previewBridge 浏览器中复现。命令面板的 Extensions 快捷入口也可指向隐藏模块，此项目前为静态路径发现。Data charts 实际是外部论文图表参考库，而不是本地数据绘图；Image creation 同时承担参考图库和 FigureForge。它们与 Data analysis 的名称接近，输入/结果却不同。

**建议行为。** 首页只暴露当前能进入的任务；对未启用能力，要么显式打开该能力并给出 beta/依赖说明，要么使用清楚的“启用后使用”入口，不能静默回退。把“数据探索”“论文图表参考”“科学示意图生成”按用户结果命名；参考图库可先降为生成/写作流程中的二级资源，无需继续增加同级侧栏工具。写作的模板退为 New；研究步骤导航继续可选。

**取舍。** 本轮不主张立即合并图库的数据适配器或大改所有页面。先修直接入口、名称和默认展示，用四条代表旅程检验是否降低绕路，再决定是否合并。已有 v0.1.0 安装包，应优先让 README 链接到下载入口，而非再造安装器；main 与 release 的功能范围差异是维护者有意安排，应分别说明；当前源码检查不能代替发布二进制验收，详见 [质量报告](quality.md)。

**验收。** 全新偏好下，首页每个动作有可见结果；禁用一个 app 后，首页/命令面板/来源页不留下无反馈入口；用户从名称能区分“自己的数据”与“别人论文中的参考图”；继续稿件不要求先进入模板库。

依据：[research-apps.json:15](/Users/fei/Desktop/Archimedes/shared/research-apps.json:15)、[ResearchWelcome.tsx:6](/Users/fei/Desktop/Archimedes/src/ResearchWelcome.tsx:6)、[App.tsx:2018](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/App.tsx#L2018)、[App.tsx:3191](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/App.tsx#L3191)、[App.tsx:3354](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/App.tsx#L3354)、[DataChartsView.tsx:6](/Users/fei/Desktop/Archimedes/src/DataChartsView.tsx:6)、[DataChartGallery.tsx:8](/Users/fei/Desktop/Archimedes/src/DataChartGallery.tsx:8)。

## 跨模块动作的默认行为

不应把“全部进当前聊天”或“每次都新建聊天”作为统一规则。应以动作是否延续同一个研究对象来决定。

| 动作 | 建议默认行为 | 可复用的现有机制与边界 |
| --- | --- | --- |
| 对同一论文选择原文或代码提问 | 继续该项目＋论文已绑定的讨论 | 现有 paper-chat 已正确分域，保留原文页码/代码 commit；无需每段话新建会话 |
| 将 notes 或新闻作为当前问题的补充证据 | 追加当前草稿，动作上显示目标 session | Notes 已区分 Add to chat 与 Use as prompt；默认追加不应悄悄替换用户文本 |
| 首次分析一份尚未关联任务的 CSV | 在当前明确项目内创建关联分析 session；后续回到同一 session | 关联 session 解决归属，不自动获得完整 CSV；摘要模式与附加原文件分别明确 |
| 在写作中 Ask AI | 进入该稿件关联的修订 session；已有映射则复用 | 先带当前源文件，再附所选反馈；不能由偶然停留的旧聊天决定目标 |
| 生成 slides | 新建独立执行任务，并保存源 PDF 版本及返回链接 | 当前 forceNew 是正确默认，不应覆盖既有研究讨论 |
| 运行复现或模拟评审 | 新 run，保留 source/project/版本；可回到原文与修订任务 | 后台运行独立于聊天合理；页面切换不能改变正在运行对象的归属 |

选择目标应在动作的名称或上下文中清楚可见。常规引用不必增加弹窗；只有目标不明确且会写入错误资产时才需要用户选择。

## 推荐推进顺序与暂缓范围

第一阶段沿本轮局部修复继续建立可靠性底线：把任务选择与文件/草稿/附件完整分域，补 App/store 的上下文边界与取消/重开，去除首页静默无效入口。复现步骤修订的局部证据错配已修，不等于完整实验版本已建立。用跨项目和计划修订的行为验收，不用新增大量源码正则测试替代真实交互。

第二阶段围绕高频产物打通两个小闭环：文献候选能回访并带理由；已有稿件能继续并从当前 PDF 进入评审/展示。分析成果的项目化保存随后接入同一 Files/Artifacts 机制。保留现有清楚的科学证据边界和失败恢复，不为“看起来完整”改变成功含义。

第三阶段再做固定结果格式下的数值比较、可恢复项目包、文献管理器互通等扩展。这些有价值，但不能先于任务归属和证据适用范围。

暂不优先投入通用自动科研编排、任意论文的全自动结果解析、跨团队实时协作全套、长期语义记忆平台、新的新闻/图库模块、完整 notebook 环境或更复杂的科研进度评分。对现阶段个人研究者，更少的重复选择、可靠的继续工作和可核查成果，比新增一排能力更接近产品承诺。


## 后续实施：文献发现与互通

W02/W03/X02 已接上项目隔离的发现恢复、页内专题库、独立选文理由，以及 BibTeX 预览/导入/显式元数据修复/稳定引用键导出。实际组件＋真实 SQLite 等相邻32项通过；完整桌面返回/重启和截图由前端统一验收，现阶段仍待结果，不能称已完成全部科研闭环。原“正常新建项目没有库”的判断已纠正，实际正常路径包含默认库；详见[本批实现与待验步骤](implementation-evidence/literature-workflow.md)。
