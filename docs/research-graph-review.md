# Research Graph：当前完成度与改进方向

本次检查基于 `feat/research-graph-foundation` 的 `5a8f83f`，参考本机 `OpenResearch` 源码。结论：已经有**带版本的研究对象记录和本地实验执行入口**，但还没有形成节点驱动、可回放的科研工作流。界面改为分支轨道可以让已有关系更容易读，不能代替执行和上下文层的建设。

## 对照最初的八项要求

| 目标 | 当前证据 | 尚缺的能力 |
| --- | --- | --- |
| 科研流程可执行 | API 后端有创建 idea/experiment、申请批准后运行、等待、读日志、从运行生成结果等工具；原生后端有 experiment directive 桥接 | 没有统一的节点任务调度；文献、分析、写作尚未成为贯通的执行阶段；原生 Agent 绕过 directive 自行运行的命令不会自动变成正式实验记录 |
| 科研过程可追溯 | 五种节点、十三种关系、来源 turn、追加式 revision、固定两端版本的边、运行日志与 commit SHA | 缺少数据集/环境/产物清单、文件哈希、运行对应的明确 node revision、证据到论文段落的完整链路 |
| 像 Git 一样记录实验 | 每次本地运行有 command、cwd、日志、状态、退出码、当前 HEAD；成功后冻结计划和命令 | 当前 HEAD 不是执行代码快照；未提交改动、数据、依赖、种子未锁定，没有恢复快照或一键重跑，不能称为可回放 |
| 分支、合并、删除、评审、协作 | 数据层支持 merges、归档、恢复；项目已有通用协作基础 | 图里的分支不是代码分支；没有实验 worktree、真实 Git merge、merge proposal、评审与图同步；自动提取器明确禁止生成 merges |
| Idea 作为节点 | 已实现 question → idea → experiment；一个 idea 可有多个实验，实验可 extends/replicates；已有 supersede 历史 | 新一轮生成两个以上 idea 会自动撤回旧的直接子 idea，这更像“替换一轮方案”，不等于研究者明确淘汰了全部旧路线 |
| 防止长上下文淹没 | 节点 content 有独立 revision；thread/artifact 表留有 node/revision 关联列 | 没有 Node Chat、Context Pack 或按节点切换上下文；主聊天仍是执行和讨论入口。图当前按会话严格隔离，跨会话继续同一研究对象还不完整 |
| 可视化分叉与迭代 | 原先已有树形布局和节点选择 | 原视图过滤掉 merges、反馈、cites，写作节点没有可见入口；版本 API 存在但没有版本浏览。本次补上展示与浏览，实际 Git 分支仍待实现 |
| Standard / Research 两种模式 | Standard 不强制建图，Research 成功轮次后异步提取；Experiment setup 允许正式实验工具 | Research 还没有节点专属执行上下文和可靠的阶段交接；写作等模式没有自动纳入同一图 |

## OpenResearch 值得参考的实现

1. **实验对象和代码分支绑定。** `src/local/experiments.rs` 中 `create_experiment_locked` 从父实验分支或项目 baseline 创建真实 `orx/<slug>` 分支，同时保存 `parent_experiment_id` 和继承的运行命令。Archimedes 目前主要在 JSON/SQLite 中记录关系。
2. **代码状态成为执行输入。** `src/compute.rs`、`src/jobs/` 和 `src/config.rs` 围绕代码快照、commit、运行后端和运行状态组织执行。Archimedes 当前的 `readCommit(cwd)` 只读 HEAD，不会把工作目录冻结为这次实验的可恢复输入。
3. **实验与尝试分开。** `ui/src/components/experimentLineageModel.ts` 把一个实验的多次 runs 组织在一起，展示最新状态、父实验与不同尝试。Archimedes 的 experiment/run 分层方向正确，应继续沿用。
4. **图形与可读记录结合。** `ExperimentLineage.tsx` 使用窄分支轨道、圆角连线、状态形状和共同的文字列，并高亮选中节点的祖先。它不是把每条记录压进一张窄卡片。当前改造借鉴这一结构，保留 Archimedes 的五种研究对象和多父节点关系。
5. **Agent 认识业务协议。** `src/local/agent_skills.rs` 在会话工作目录中安装与后端匹配的原生 skills，让 Agent 使用实验、代码和运行管理协议。Archimedes 后续应把正式实验操作暴露为统一工具/CLI/MCP 接口，减少仅从最终回答的 fenced JSON 中识别操作的依赖。

OpenResearch 的实验谱系也不是完整的科研知识图谱：不能根据有 parent/branch 就推断它已经解决了独立 idea 版本、科研结论评审或长期科研记忆。可以参考它的执行和证据组织方式，继续设计 Archimedes 的研究对象层。

## 还需要优先处理的数据正确性问题

- **已修复：自动建图的事务回滚。** 检查时发现 `applyPatch` 会先修改已有节点，后续失败时仅归档新节点。现已使用可嵌套的 SQLite savepoint 把整个 patch 纳入一个同步事务；既有内容与 revision、新节点与边、撤回状态、项目时间戳及本次产生的审计记录一起回滚。失败节点不会再作为归档记录残留在 History。故障回归测试和前后结果见 [atomicity-tests.txt](./assets/research-graph/atomicity-tests.txt)。
- revision 固定的是 `content`；title、summary 和 status 不构成完整历史快照。查看旧内容时仍可能看到当前标题，不能把它描述为整个研究对象的完整 Git commit。
- 退出码 0 表示命令成功，不代表假设得到证实。`createResultFromRun` 记录来源和 interpretation，但仍需要结构化测量、指标校验和评审。
- 对话提取出的 result 与真实 run 的 result 必须保留区别。本次详情明确显示“对话中报告的结果”或“来自实际运行的证据”。

除已标明修复的事务问题外，其余存储与执行问题仍待后续开发。

## 本次完成的界面改造

- 从缩进小卡片树改为 Git 风格的竖向分支轨道，节点共用文字列；运行失败、成功、运行中、草稿和撤回状态有文字和形状标记。
- 以拓扑顺序展示结构关系，合并节点在所有父节点之后出现；引用关系在视觉上从结果流向写作，同时保留原始 `writing → result` 数据语义。反馈关系不影响结构顺序。
- 选中节点会高亮它的结构祖先；详情展示实际关联节点和关联时固定的 revision，支持继续定位相关节点。
- 提供 Ideas、Experiments、All activity 三种查看范围。All activity 显示已有 writing、cites、反馈关系；History 可以显示撤回及归档节点。
- 详情优先展示可读研究字段、来源轮次、当前版本、运行证据；原始 JSON 放入默认折叠的 Raw data。
- 接入已有 `getResearchNodeHistory`，可按需读取并查看历史内容；不增加“恢复版本”或“合并代码”等尚未实现的按钮。
- 使用共享 Dialog 管理展开视图的焦点与 Escape 行为；增加行内键盘导航，并防止会话切换后的过期请求覆盖新图。

界面对比及亮色、暗色、窄窗口截图见 [Research Graph 文档](./research-graph.md#ui-slice)。截图使用隔离的示例数据，不读取用户项目，也不发起模型或实验执行请求。

### 验证记录

- Research Graph、实验运行、directive 桥接、布局、组件行为及 schema 专项测试：65/65 通过。
- `npm run lint`、`npm run build`、`npm run check:theme` 通过；构建仍有现有的大 chunk 提示。
- `npm test`：1324 项，1311 通过、8 失败、5 跳过。失败为 Windows shell 3 项、Benchmark 本地目录自动发现 3 项、LaTeX 缺少 `phvr7t` 字体 1 项，以及 `library.ts` 翻译排序 1 项。
- 用修改前的 `5a8f83f` 单独运行相关测试，复现上述 8 项失败；Benchmark 用原项目工作目录保留相同的邻近数据目录条件。未修改这些测试或它们对应的业务代码。
- 使用实际 Electron 渲染器检查 Paper/暗色、展开/窄窗口布局；560px 和 800px 窗口无文档级横向溢出。组件测试覆盖归档/撤回记录、写作引用、反馈关系、历史版本切换、键盘定位及过期请求隔离。

## 建议的后续开发顺序

### 1. Node Context：先解决上下文边界

每个 idea/experiment/result/writing 可创建绑定指定 revision 的工作会话。Context Pack 由研究问题、当前 revision、选定父节点、必要文献、代码与证据组成；历史聊天通过引用按需读取。必须把“绑定旧版本继续”“在新版本继续”“从该节点分叉”区分开。

同时明确作用域：项目或研究问题持有长期研究图，会话记录研究操作的来源。当前强制 session 隔离需要设计迁移与授权，不能直接删掉 thread 过滤导致不同研究混在一起。

### 2. Experiment Snapshot：把一次运行变成可验证输入

实验绑定独立代码分支/工作目录；运行前记录不可变 run manifest：node revision、代码 commit/dirty patch、数据版本或哈希、依赖/镜像、命令、种子、后端与资源。运行后关联指标、日志和产物。先支持本地可恢复，再扩展 SSH/容器。

### 3. Review / Merge：有证据地接受一条路线

评审记录绑定待比较的节点版本和实际运行证据；合并提案明确父版本、接受的变化、冲突与理由。研究关系合并和代码 Git merge 是两个需要协调的动作，不能因为画出了两条汇合线就认定已经合并。

### 4. Research Memory：沉淀经过验证的经验

从已评审结果中提取可复用的研究记录：有效做法、失败条件、适用范围、反例与证据引用。新节点按研究问题与条件检索这些记录；自动生成的总结保持待确认状态。最后接入项目成员权限、评论、评审和共享图同步。
