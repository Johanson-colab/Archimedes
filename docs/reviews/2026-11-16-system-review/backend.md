# 后端、数据与任务执行审阅

> 阅读说明：前部是基于初轮 SHA 的历史审阅及当时验证，旧阶段的“未修”、1274/1288 和条件缺失不是当前结论。后续实施另列；当前交付状态统一见[总报告](README.md)和[实施矩阵](IMPLEMENTATION.md)。

审阅基线：`main` 的 `1f4b37581c446770d576440f9ebb9bca5c55bfb7`。本报告区分原版缺陷、隔离验证和已应用的本地局部修复；没有调用真实模型、Docker、SSH 或用户研究数据，没有 commit、PR、push 或远端改动。

本轮最值得投入的是统一任务的数据归属、完善复现任务的取消/收尾，以及保证最终计划上的结果确实对应当前步骤定义。native 适配器已经有较好的生命周期和防重放设计，无需重新搭一套 agent 平台。

## 1. 真实架构与数据边界

React 界面通过 preload 暴露的 IPC 调用主进程。主进程持有模型配置、文件和终端权限；API harness 的 `agent.runAgent` 管理 task、turn、工具、审批与事件；Codex、Claude、OpenCode 由独立 native 适配器接入。SQLite 同时承载项目、会话、论文、阅读结果、artifacts 与复现状态。复现 feature 另外维护自己的运行 Map、模型决策循环和 Docker/SSH backend。

| 身份 | 原版作用 | 原版已有正确绑定 | 原版薄弱处 |
| --- | --- | --- | --- |
| 窗口的主数据目录 `dataWorkspace` | `.archimedes/archimedes.db` 所在目录 | main 能按 sender 找到窗口目录 | store 最终仍是全进程单一可变连接 |
| `projectId` | 研究项目与成员、library、会话归属 | 新建 thread 验证项目权限 | 已有 thread 启动时不验证传入 project/execution root 是否一致 |
| `workspaceId` | 项目内 shared/worktree/sandbox | `createResearchThread` 验证 workspace 属于项目 | 显式 `workspacePath` 又能优先覆盖该 workspace.root |
| `threadId` / `turnId` | 对话与一次执行记录 | native continuity 绑定 workspace、model 和成功的前序 turn | API 工具 root 与 thread 的持久化 root 独立传递 |
| 文件路径 | 执行目录内相对路径 | API 审批 proposal 保存 `workspaceRoot` 并检查文件冲突 | 手动文件 IPC、复现结构化写入采用另一套边界检查 |

先前局部修复已让 Writing 的文档、草稿和保存队列绑定 owner 执行 root，并补全编译进度 root/requestId。本轮继续实现下述 store/context 主干；架构表保留原版边界，避免把原始问题与当前修复混淆。已改动文件的原版证据链接固定在审阅 SHA，当前修复链接使用主工作区实际行号。

相关入口：[原版 main.cjs:1888](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/electron/main.cjs#L1888)、[store.cjs:2382](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/electron/store.cjs#L2382)、[agent.cjs:984](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/electron/agent.cjs#L984)。这解释了前端“切换项目但保留旧会话/同名文件草稿”的问题为什么能穿透后端：`agent:run` 信任分别传来的 root、project、workspace、thread；已有 thread 分支直接取历史，不重新建立一致归属。

建议保持现有实体，不新增平台层：主进程一次解析 `{ dataRoot, projectId, projectWorkspaceId, threadId, executionRoot }`，后续运行、文件、审批、artifact 都使用这个已验证 context。已有 thread 的 root 从持久化记录解析；新会话从 project workspace 解析。renderer 只提交选择的实体 ID，切换选中项和文件草稿键也使用完整身份。数据 store 按 canonical dataRoot 实例化并被运行对象捕获，避免每次 IPC 重置全局连接。

不宜仅在每个 `await` 后补 `store.openWorkspace`：另一个异步调用仍能切走它，且反复 open 会再次执行中断恢复。也不必一次把全部 store 模块重写：先改运行和高频 IPC 的 store 注入/按窗口解析，保留现有 SQL 方法和接口形状，分批迁移。

## 本轮数据身份与恢复实现（A01 / A02 / L03）

本地实现保留现有 SQL 函数和接口形状，增加按 canonical dataRoot 缓存的 store facade。AsyncLocalStorage 只负责共享 SQL 函数取已绑定 state；主进程 IPC、agent、终端长进程显式捕获所属 store/lease。请求选择数据目录后，另一窗口切换不会关闭或重定向该连接；close 等待已有 lease 释放，退出时集中请求关闭，不每次 await 后切库。打开同一真实目录的不同拼写使用同一 state，首次打开才做迁移/恢复，再次获取活 scope 不重新收尾运行。[store facade](/Users/fei/Desktop/Archimedes/electron/store.cjs:20)、[IPC 绑定](/Users/fei/Desktop/Archimedes/electron/workspace-context.cjs:31)、[主进程注册](/Users/fei/Desktop/Archimedes/electron/main.cjs:642)、[agent 捕获](/Users/fei/Desktop/Archimedes/electron/agent.cjs:986)。

统一 resolver 从窗口选定数据 store 读取 project/workspace/thread，验证所属关系、编辑权限、归档状态与 execution root。已有会话保留持久化的历史目录，新会话从所选 workspace.root 生成；显式 root 与实体不符会在创建 task/turn 或调用 provider 前拒绝。native 防重放、停止和审批 surface 的运行键增加 dataRoot，避免同一云端 thread ID 被导入两个库后互相控制。get/create 仍返回完整 thread，前端无需第二套 context RPC。[resolver](/Users/fei/Desktop/Archimedes/electron/workspace-context.cjs:12)、[create 入口](/Users/fei/Desktop/Archimedes/electron/thread-commands.cjs:56)、[agent 校验](/Users/fei/Desktop/Archimedes/electron/agent.cjs:992)。

首次打开数据库时，只有关联本地 task 的遗留 running turn 被恢复：仍 running 的 task/turn 标为 interrupted，过期 pending action 被拒绝、旧 command 标为 interrupted；若 finishTask 已落 completed/response 而 turn 尚未更新，则保留该最终状态和输出。事件记录 run_recovered，用户可直接继续/归档；云导入 task_id=NULL 的运行不被标为本地中断。此处不自动重放命令、模型请求或审批，也不声称已找回崩溃前仅留内存的流式字符。[恢复事务](/Users/fei/Desktop/Archimedes/electron/store.cjs:963)。

**验证：**原版 store-lifecycle 的两项真实 agent/SQLite/独立子进程缺陷断言现均通过。新增六项行为覆盖跨 await/别名/close lease、窗口切换中的 IPC 写入、真实终端子进程结束后的原库记录、混搭零副作用、两库同 thread ID 并发 Stop/审批隔离，以及恢复保留云 running/已落最终输出/不重复恢复活 scope。核心与相邻共 **79/79 通过**；真实 fake-native 子进程集成另 **5/5 通过**。[测试](/Users/fei/Desktop/Archimedes/electron/workspace-context.test.cjs)、[核心输出](backend-evidence/store-context-after.log)。扩大检查 275 项为 272 通过、2 项旧前端源码定位失败、1 跳过；两项已交前端随 tuple 实现迁移，不将此称最终全套结果。后续以统一验证为准。

**独立复核后的闭合：**首版独立审阅确认两条遗漏，现已补齐。启动后导入的聊天原本缺本地 workspace 字段，get 返回与 run resolver 可选到不同目录；现在 get 在 viewer/私有性校验后原子补本地目录归属，只有缺失字段被补，历史非空 root 不迁移，项目重绑定也不移动已打开过的导入聊天。viewer 可以查看历史及取得本地 tuple，但 run 仍因非 editor 被拒绝。另同一聊天可同时留有本地遗留运行和云端 running 回合；恢复现在先收尾本地，再从剩余回合汇总聊天状态，云端仍 running 时保持 running，不解除防重入。[本地归属 hydration](/Users/fei/Desktop/Archimedes/electron/store.cjs:2867)、[混合恢复汇总](/Users/fei/Desktop/Archimedes/electron/store.cjs:987)。

原独立两份 probe 不改断言，复跑均退出 0；正式 context 测试新增导入/历史重绑定/viewer 正例，并扩展子进程混合状态检查。本轮核心、native 真实假协议子进程和 build-info 联合 **86/86 通过、零跳过**，常规 lint 与 git diff --check 通过。[导入回归](backend-evidence/context-import-after.log)、[混合恢复](backend-evidence/mixed-recovery-after.log)、[联合输出](backend-evidence/store-context-review-after.log)。这仍是模块/临时 SQLite/子进程层证据，原生多窗口验收另计。K01 的 app:build-info 主进程、preload 和 optional bridge 类型亦已接好；诊断字段与模块验收归质量报告。

**适用边界：**这里只完成普通本地任务的数据主干。前端原子选择/附件/handoff 由并行实现验收；复现准备至退出的控制器、结构化写入边界、模型完整终止及云同步变更语义仍分项进行。文件/产物继续有各自接口，不能把 resolver 的存在宣称为全系统身份问题已全部消失。已打开数据 store 由进程缓存至显式 close/退出，未引入新的存储依赖或通用调度平台。

## 2. 优先修复的问题

### B1 · P1 · 另一窗口切换数据目录会破坏在途任务（原版已复现，本地主干已修并验证）

**场景：**A 窗口请求模型，B 空闲窗口打开另一目录；A 模型返回后保存事件和最终答案。

**原版结果：**使用真实 `agent.runAgent`、真实 SQLite store 与无网络 fake provider，切库后运行拒绝为 `Research turn not found.`。重新打开 A 库，thread 和 turn 都仍是 `running`，最终回答为空。

**根因：**[store.cjs:19](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/electron/store.cjs#L19) 的全局 `database`；[store.cjs:895](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/electron/store.cjs#L895) 的 `openWorkspace` 关闭旧库；模型 await 后 [agent.cjs:1009](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/electron/agent.cjs#L1009) 与 `finish` 直接调用这个 store。部分项目/会话/审批 IPC 甚至没有按 sender 重新选择数据库，例如 [原版 main.cjs:1055](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/electron/main.cjs#L1055)、[原版 main.cjs:2281](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/electron/main.cjs#L2281)。

**已有防护与边界：**同一窗口 `loadWorkspace` 有 busy/sideBusy/command lock；原生菜单可新建另一个独立空闲窗口。验证没有实际打开两扇 Electron 窗口，而是准确执行另一个窗口 `workspace:open` 的 store 操作；入口可达性已静态核对。审批写入 payload 自带 execution root 是正确先例，但审批记录本身仍可能在错误数据库中查找。

**方案/验收：**store 按数据目录实例化，run 捕获实例；窗口间同时运行、审批、切换、关闭都不改变另一运行的持久化归属。随后将同一 context 检查扩展至文件与 artifact IPC。这是涉及多个 IPC/store 调用方的中等到较高复杂度改动，应分批迁移，收益覆盖多窗口、并行任务和项目身份混淆。

证据：[store-lifecycle.cjs](/Users/fei/Desktop/Archimedes/docs/reviews/2026-11-16-system-review/backend-evidence/store-lifecycle.cjs)。

### B2 · P1 · 复现任务的 Stop 没覆盖准备阶段，取消和退出收尾不一致（原版已复现，L01/L02 已本地修复）

**场景一：**下载/clone、SSH probe、Docker 拉镜像与 prepare 时点击 Stop。session 的 controller 在 [原版 main.cjs:1417](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/electron/main.cjs#L1417) 进入 `executeRun` 才创建；[原版 main.cjs:1532](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/electron/main.cjs#L1532) 初始值为 null；Stop 只做可选 `abort` 并返回 true。

**结果：**隔离执行 main 原始完整 reproduction 注册与 `executeRun` 代码块，用 fake prepare 暂停。Stop 返回 true，释放 prepare 后 pilot 仍启动，收到的 signal 未 aborted。该验证替换环境 backend，不包含完整 Electron 或真实容器。

**场景二：**等待模型决策时取消。真实 `runPilot` 的 fake provider 按 abort 拒绝后，结果为 `status: failed`、summary 为 `Stopped by the user.`，主进程随后映射为 blocked。根因是 [原版 pilot.cjs:419](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/electron/reproduction/pilot.cjs#L419) 依据局部 status 判断，没有用已取消的 signal。命令阶段下一轮循环检查 signal 则能正确得到 stopped。

**静态确认的退出缺口：**Docker 用 detached `docker run -d --rm ... sleep infinity`，`dispose` 才执行 `docker rm -f`；[原版 main.cjs:2589](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/electron/main.cjs#L2589) 的 `before-quit` 没有取消/回收 activeReproductionRuns。[docs/reproduce.md:209](/Users/fei/Desktop/Archimedes/docs/reproduce.md:209) 明确承诺退出会删除容器，当前注册代码不兑现。初轮没有启动真实 Docker 验证残留，不把它写成实测容器泄漏；后续本地修复的真实服务验证见实施节。

**方案/验收：**创建 session 时就创建唯一 controller，贯穿 clone/probe/prepare/model/exec；每个阶段完成后检查取消；取消统一映射 cancelled，finally 幂等 dispose。正常退出需等待有界清理，异常退出在下次启动按本应用拥有的容器标识恢复/清理。分别在准备、推理、命令阶段取消，确认后续不再开始模型/执行，并验证正常退出清理。无需重写 native lifecycle；那部分已采用相似机制。

证据：[reproduction-lifecycle.cjs:29](/Users/fei/Desktop/Archimedes/docs/reviews/2026-11-16-system-review/backend-evidence/reproduction-lifecycle.cjs:29)、[同文件:79](/Users/fei/Desktop/Archimedes/docs/reviews/2026-11-16-system-review/backend-evidence/reproduction-lifecycle.cjs:79)。

### B3 · P1 · 结构化复现读写可沿 symlink 访问 checkout 外主机文件（原版已复现，B01 已本地修复）

**场景：**科研仓库常把 `data/` 链到共享数据目录。pilot 通过 `read_file`/`write_file` 编辑 `data/config.txt`，使用者以为它只会修改复现 checkout。

**结果：**创建唯一临时根下的 checkout 与 sibling 数据目录，不启动 Docker。真实 `createDockerBackend().readFile` 读出 sibling 文件；`writeRepoFile` 修改了 sibling 文件且未拒绝。没有触碰真实用户文件。

**根因：**[原版 docker.cjs:199](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/electron/reproduction/docker.cjs#L199) 和 :208 只比较 `path.resolve` 后的字面路径，随后在主机上直接读写，未验证链接最终目标；接口注释承诺“inside the checkout”。这不是合法挂载目录读取能力的误报：只读外部数据若要支持，应单独授权/建模；当前接口连外部写入也会执行，而且绕过 Docker 文件边界。SSH backend 有相似字面路径检查，未做真实 SSH 越界实验。

**已有正确先例：**代码审计 [repository-checkout.cjs:124](/Users/fei/Desktop/Archimedes/electron/repository-checkout.cjs:124) 验证 realpath；API 写入 [workspace-tools.cjs:115](/Users/fei/Desktop/Archimedes/electron/agent/workspace-tools.cjs:115) 逐级拒绝链接并检查预期内容。应复用经过测试的边界语义，避免每条文件链各写一套。

**方案/验收：**区分 checkout 内输出与显式只读数据挂载。结构化写入默认拒绝链接路径，校验现有父目录；允许的数据挂载也不自动授予写权限。覆盖目录链接、文件链接、新嵌套文件，确保外部内容不变。低到中等复杂度，先修 Docker 主机结构化读写，再对齐 SSH/手动编辑器。

证据：[reproduction-lifecycle.cjs:11](/Users/fei/Desktop/Archimedes/docs/reviews/2026-11-16-system-review/backend-evidence/reproduction-lifecycle.cjs:11)。

### B4 · P1 · 改写步骤后旧结果仍给新计划绿勾（已应用本地局部修复并验证）

**原版场景/结果：**`old-check` 输出 `Old configuration passed` → 同 id 记 passed → revise 把命令改为 `new-check` → done。真实 runPilot 返回内部 `verified`，最终 runbook 是 `new-check / passed / Old configuration passed`，实际 commands 只有 `old-check`。主进程将其映射为产品 `checks-passed`。

这里指最终步骤检查点的证据归属错误。文档已明确 `checks-passed` 不等于论文数值得到复现，不能把内部 `verified` 的命名单独当作产品伪造科学验证。

**根因：**原版 `normalizeSteps` 按 id 无条件复制 status/evidence，未比较执行或验收定义；done 只检查现存步骤状态。此外 `advance.command` 原本可以把未执行的任意命令记成“实际跑通命令”，同时引用另一命令的输出。当前修复入口：[pilot.cjs:271](/Users/fei/Desktop/Archimedes/electron/reproduction/pilot.cjs:271)。

**本地修复规则：**

- command/detail/blocked 是执行语义；变化后清空当前判定，passed/failed 必须引用本次修订后实际取得的输出。
- checkpoint/check 是验收语义；变化后清旧判定，但允许显式重新 advance 评估原输出，避免仅改阈值就重算昂贵实验。
- title/source 是展示/出处标签；改写或单纯重排保留未变步骤结果，只改 A 不清 B。
- manual 可引用旧错误解释人工交接；它不声称新命令已成功或失败。blocked 保持明确 note 的既有语义。
- 显式 advance.command 必须对应产生所引用输出的真实命令；比较采用与实际 run 一样的首尾 trim，保留引号内/多行 shell 的有意义空白，不推断 shell 等价。contract 的 step.command、check.command、entrypoint.command 同样只 trim 首尾并保留原长度界限，避免 JSON 持久化后 presentReproduction 再次 normalize 时改写真实命令；prose/env 规范化不变。
- 历史日志保留；取消的是旧输出自动认证新执行定义的资格。连续修订不降低已经设定的证据时间边界。

**验证和现有测试调整：**本地仅修改 pilot、contract 及二者行为测试。原“同 id 保持证据”测试初始 command 为空，却在 revise 时填入 make install；已把初始定义明确为 make install，保留全部原断言，使其真正验证同语义改标题。既有 manual 诊断、重开已完成步骤和 python→python3 实际修复用例均继续通过。新增测试覆盖改命令、改验收、连续修订、仅展示变化、独立步骤、显式替代命令、旧错误诊断、引号内部空白及带换行命令的 JSON 回读保真。新增 pilot 测试指向原版时 29 项中 5 条针对真实缺口的断言失败；命令回读新例在原版也失败。隔离候选和应用后的主工作区相邻 63 项均全部通过，git diff --check 通过。独立 reproduction evidence 的旧证据误归因项现转通过：最终 new-check 保持 pending、evidence 为空，不能 done 成功；其余 3 个取消/边界目标仍因未修缺口失败。产品和质量代理已分别独立验收主要领域规则及最终 command 回读增量。

**尚未解决：**跨步骤依赖、数据/环境版本变更、新一次运行复用旧 verdict 没有版本契约。本次不根据数组顺序猜测依赖并清空全部下游，也不自动判断论文数值，不声称修好了完整实验 lineage。

修复已在统一原版基线结束后应用主工作区，未提交。具体差异保存在 [pilot-candidate.patch](/Users/fei/Desktop/Archimedes/docs/reviews/2026-11-16-system-review/backend-evidence/pilot-candidate.patch)，原版/修复后的紧凑验证结果保存在同目录。已核实主工作区四文件与隔离候选逐字一致，保存的 patch 与实际 git diff 一致，随后清理了本次创建的临时 detached worktree。此后复跑均使用主工作区 `/Users/fei/Desktop/Archimedes`，不再使用已清理的候选路径。

### B5 · P1/P2 · 进程退出后普通研究运行和审批成为幽灵状态（原版已复现，本地恢复已修并验证）

使用独立 Node 子进程在隔离数据库创建真实 running task/turn 和 pending action，然后让该进程退出。另一进程打开原目录，thread/turn 仍 running，action 仍 pending；`interruptAgent` 返回 false，归档报“先停止运行”。

[store.cjs:877](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/electron/store.cjs#L877) 的重开恢复只处理 reproductions；普通会话的 stop 依赖活进程 Map。UI 也没有从历史 running 重建可停止运行。不是整个对话永久不可用：用户可能再发新回合使 thread 回 idle，但旧 running turn 仍会影响 fork/undo/compact，且不应要求额外模型调用才能恢复管理功能。

建议启动时按存活 owner/run 标识原子收尾 task/turn/thread，过期未执行审批，保留已完成输出和部分文件变化；已有 reproduction recovery 可作为数据迁移先例。验收覆盖输出中、等待审批、命令执行中退出并重开，随后直接继续、归档和检查部分结果。

证据：[store-lifecycle.cjs:56](/Users/fei/Desktop/Archimedes/docs/reviews/2026-11-16-system-review/backend-evidence/store-lifecycle.cjs:56)。

### B6 · P2 · 流式模型正常关闭传输不代表模型正常完成（原版已复现，M01 已本地修复）

真实 Anthropic adapter 配合无网络 fake fetch 和 Web ReadableStream：只发送 text block 与部分 delta，随后 clean EOF，缺少 block/message stop；`requireComplete: true` 仍返回 `Partial scientific conclusion`。[anthropic.cjs:78](/Users/fei/Desktop/Archimedes/electron/agent/anthropic.cjs:78) 与 OpenAI [agent.cjs:938](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/electron/agent.cjs#L938) 都没有要求合法终止状态。后者普通路径随后存成 completed。

已有长度截断、错误事件、空 stream fallback 和重试测试有真实价值；硬断网也可能由 fetch 正确报错。本问题针对代理/服务商提前关闭但传输层没有抛错的响应，不泛称所有断网都误报成功。

建议记录协议终止状态；缺终止时保存 partial 并标 incomplete/interrupted，工具参数未完整关闭时不能执行。分别验证正常结束、length 截断、缺 terminal event 和残缺最后一帧。无需加入复杂无限重试。

证据：[model-stream.cjs](/Users/fei/Desktop/Archimedes/docs/reviews/2026-11-16-system-review/backend-evidence/model-stream.cjs)。

**M01 本地修复：**OpenAI-compatible stream 必须有合法 finish_reason；Anthropic 必须有 message_stop、合法 stop_reason 和已关闭的 content blocks。length/max_tokens/context-window 截断、坏帧、未完成 tool arguments 与流中读取异常都产生 MODEL_RESPONSE_INCOMPLETE，携带 partialResponse、reason、provider、finishReason。所有工具调用先整体完成校验，不能执行同批中的“前半个正常工具”再发现另一个残缺。非流式响应与 paper-review/planner 的 JSON adapter 也校验终止原因；即使截断内容恰好能解析 JSON，也不进入 JSON repair 或执行链。空的非标准 stream 仍只做原有一次 non-stream fallback；已收到部分回答和明确 length 不重试。[终止契约](/Users/fei/Desktop/Archimedes/electron/agent/model-completion.cjs:1)。参考 [OpenAI finish_reason](https://developers.openai.com/api/reference/resources/chat/subresources/completions/streaming-events) 和 [Anthropic stream/stop](https://platform.claude.com/docs/en/build-with-claude/streaming)。

runAgent 正常返回 status=incomplete，response 保存部分文字及明确说明，task/turn 同状态、thread 汇总 error，并保存 model_incomplete 原因事件；前端末事件 type=incomplete、error 字段同原因，原聊天可继续。native 正常/失败/中断逻辑保留，用户取消仍为 interrupted，不把取消当协议损坏。thread-sync 首次序列化、Supabase HTTP turns.status、SQL turns.status 及本地导入均可保留该字符串；新真实 agent 测试已通过首次同步和另一真实 SQLite 导入，partial/事件不丢。SharedAgentRun 的独立人工结束状态不是 runAgent 输出，此处未修改其无实际映射的枚举。**C01 仍须解决已发布 running turn 后续同 ID 更新**，不能因首次同步通过便声称云更新已正确。

新六项行为对原 SHA 的真实 provider/orchestrator（内存编译，无 checkout）是 1 通过/5 失败，修后连同 agent/native/context/JSON/transport 相邻为 **185/185 通过，零跳过**。已有正例只补合法 finish_reason/Anthropic terminal；保留所有原断言，将原“非 requireComplete 允许 length”升级为截断拒绝，并保留 token 上限断言。原空流兼容 fixture 中字面反斜杠换行改为真实 SSE 分隔，仍验证一次非标准空流 fallback；不以丢弃断言换通过。[新增行为](/Users/fei/Desktop/Archimedes/electron/model-completion.test.cjs)、[原版反证](backend-evidence/model-original-run.cjs)、[修前摘要](backend-evidence/model-before-summary.log)、[修后输出](backend-evidence/model-after.log)。无真实付费 API。

### B7 · P1 · Writing 将旧目录文稿自动写入新目录（已应用本地修复，组件验证通过）

**原版路径：**B 的 `paper/main.tex` 已通过聊天链接打开 Writing，编辑后立即切换 A 执行目录。原版 [openFile:212](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/PaperWritingView.tsx#L212) 使用新 workspace 保存旧 fileRef/draft；[openRequest effect:292](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/PaperWritingView.tsx#L292) 又因 workspace 依赖的 callback 改变重放旧打开事件，750ms autosave 也独立混用了新 root 与旧文稿。前端原版 Electron/真实磁盘已经观察到 A 被 B 草稿覆盖、B 仍是原文；本轮新增实际组件测试指向该 SHA 的原始 Writing 代码时，同一 owner 场景断言失败，不是测试加载失败。

**已实施的局部行为：**

- [PaperWritingView.tsx:139](/Users/fei/Desktop/Archimedes/src/PaperWritingView.tsx:139) 按执行 root 保留局部 scope，每份打开文档/草稿有自己的 owner 和保存状态。切换后新界面直接读取新 root 的缓存，不借旧编辑器状态临时拼接新路径；没有强制重挂载或清空全部稿件。
- [paper-writing-state.ts:63](/Users/fei/Desktop/Archimedes/src/paper-writing-state.ts:63) 保存捕获 owner root、相对路径和文本快照，按文档串行执行；旧完成只确认当时快照，期间的后续键入仍是未保存稿。失败不会阻断后续重试，原 buffer 保留文本和错误。
- [PaperWritingView.tsx:334](/Users/fei/Desktop/Archimedes/src/PaperWritingView.tsx:334) 离开 root 主动 flush 其脏稿至原目录，不把已有自动保存承诺改成“回来才保存”；同 root 切另一文件也保存离开前最后的编辑。文件缓存保留，回来可继续编辑；保存失败时回原文档仍显示 Unsaved 和具体错误。
- [PaperWritingView.tsx:223](/Users/fei/Desktop/Archimedes/src/PaperWritingView.tsx:223) 读回使用所属 scope 的请求序号与文档版本，旧 read 不能覆盖后续键入或另一个 root；[openRequest:326](/Users/fei/Desktop/Archimedes/src/PaperWritingView.tsx:326) 按 token/path 消费一次，root 变化不在新目录重放旧事件。
- 编译请求和返回归属 owner scope；[preload.cjs:71](/Users/fei/Desktop/Archimedes/electron/preload.cjs:71) 增加可选第三参数 requestId，原有两参数调用兼容；[main.cjs:1030](/Users/fei/Desktop/Archimedes/electron/main.cjs:1030) 将实际调用的 workspace/requestId 回传进度；[Writing 接收:311](/Users/fei/Desktop/Archimedes/src/PaperWritingView.tsx:311) 同时匹配 root、id、path，避免同名文件或旧编译日志误归属。没有采用“路径看起来唯一”的猜测。

**验证分层：**[paper-writing-workspace.test.cjs](/Users/fei/Desktop/Archimedes/electron/paper-writing-workspace.test.cjs) 六项使用真实 React 组件和临时磁盘 bridge，覆盖 A/B 同名 tex、切换前脏稿、离开即保存、旧 request 重放、慢保存期间继续输入、同 root 换文件、延迟 read/compile、进度 owner、失败保存回看和实际 main/preload 两参数兼容。六项全部通过。与 source search、latex workspace、managed engine 合计 33 项：32 通过、0 失败、1 跳过（未安装 latexmk）；质量代理独立复核相同结果，并另外确认失败后队列可重试、错误会清除。未下载或调用模型/TeX 服务。统一 lint/build/theme 均通过；最终全套 1,288 项：1,274 通过、7 失败、7 跳过，失败与原版同一组，没有新增失败。原生联验由前端进行，结果以 [frontend.md](/Users/fei/Desktop/Archimedes/docs/reviews/2026-11-16-system-review/frontend.md) 及其原生证据更新为准，不能用这六项组件检查替代 Electron 验收。

原有 `ui-audit-coedit` 仅迁移写死 draftRef 的实现定位，保留当前 draft、docKey 和已加载文件/项目挂载条件，两项通过；它仍只是源码契约，未声明实际云端协作通过。

**范围与剩余问题：**只修 Writing 传入执行 root 后的文档/异步归属，不新增模板或 resume 入口，不阻止全应用切换，不新增状态库。App 的 project/session/execution root 整体一致性、全局 SQLite store、其他模块以及并发编译底层的构建去重/版本语义仍须分别处理。保存错误的草稿缓存是当前组件生命周期内的恢复，不是新的跨进程草稿数据库。

## 本地实施：复现生命周期、文件边界与日志（L01 / L02 / B01 / PERF02）

[run-manager.cjs:8](/Users/fei/Desktop/Archimedes/electron/reproduction/run-manager.cjs:8) 在准备开始前捕获数据 store/lease 并创建唯一 AbortController，贯穿 clone、probe、prepare、模型与命令；每个准备阶段前后检查，忽略 signal 的准备返回也不能继续调用 pilot。取消统一记录 cancelled，finished 事件和 dispose 幂等。创建 run、parent provisioning 与资源 owner 记录在同一 SQLite 事务；准备前先持久化资源标识。退出先阻止新任务、取消 API/native/terminal 和复现，等待有界收尾后关闭 stores；下一次首次打开按 workspace ownerToken 与 runId 精确恢复资源，同一初始恢复 promise 完成前不能抢跑新 run。服务离线或清理超时会保留资源记录/错误供下一次恢复，不声称远端已消失。

Docker 只 inspect 并删除标签完全匹配本 run/owner 的容器；SSH 每个 run 有独立 marker/PID，验证 owner 和带 run tag 的进程组才取消。不会按容器名前缀或用户 PID 扫杀。秘密值仅临时 env 文件传入，不写资源元数据，退出后清理；真实 SSH 验证还覆盖 stdin 与诊断 stderr 原样保留。checkout/日志保留为历史结果，不等于留下活任务。

[structured-paths.cjs:14](/Users/fei/Desktop/Archimedes/electron/reproduction/structured-paths.cjs:14) 默认拒绝越界或 symlink 写入，Docker 结构化读取只允许实际目标仍在 checkout 内，SSH 结构化读取也拒链接；读取超过 2 MiB 明确报错，不返回假完整 JSON。该边界约束结构化文件接口；经批准的任意 shell 仍按目标主机权限执行，不声称形成新的通用 shell 隔离。

[process-runner.cjs:18](/Users/fei/Desktop/Archimedes/electron/reproduction/process-runner.cjs:18) 将进程内捕获限制为 64,000 字符，保留字节/行数及 truncation；stdout/stderr 同时流式输出，子进程组取消，结束移除监听。完整 exec 日志由 tee 保存到实际目标，并保留 host Docker bind/SSH workspace mirror 的引用；pilot 不再把完整日志覆盖成尾部。8 MiB 确定性输出原版 retained 为 8,388,608 字符，修后 64,000，计数仍为 8,388,608；这是留存量比较，未冒称整机 RSS 或 UI 延迟基准。

**行为证据：**144/144 相邻通过（0 skip），含 12 项新复现生命周期/真实子进程/结构化 FS/完整日志行为、API quit 中断、原 4 项目标及相邻 native/context/checks。原 reproduction-lifecycle 的取消 harness 已迁移为当前完整注册/生产 manager，保留 Stop/信号/无后续推理断言并加强 cleanup/cancelled；它不能再描述为原 executeRun 切片未变。日志见 [lifecycle-after.log](backend-evidence/lifecycle-after.log) 与 [process-output-measure.log](backend-evidence/process-output-measure.log)。

**真实服务：**临时 localhost-only sshd、高端口/临时 keys/独立已提交 Git checkout，无用户 SSH 配置改动；prepare、结构化正常读写、外部 symlink 拒写、运行进程组 Stop、无 orphan marker、fake env 文件清理均通过，结束关闭临时 daemon/删除 fixture。Docker 起初未运行，确认现有 Docker.app 后启动；默认 python:3.11-slim 第一次有界 pull 超时，保留失败日志；复用现有镜像的 launch override 烟测与默认镜像必须分开。之后按授权单次缓存续拉，**默认 python:3.11-slim 实际路径已通过** prepare、1 MiB 完整日志、64k 捕获、Stop 和精确容器删除，CPU1/256MiB/pids64/network-none。两个本任务容器都已删除，未操作其他容器/卷，Docker 服务按协调要求暂留给后续 Postgres/最终验收。不是只凭 fake 判断 Docker 成功。可复跑脚本 [local-services-smoke.cjs](backend-evidence/local-services-smoke.cjs)，紧凑结果分别为 [SSH](backend-evidence/real-localhost-ssh.log)、[首次 pull](backend-evidence/real-docker-first-pull.log)、[override](backend-evidence/real-docker-launch-override.log)、[默认镜像](backend-evidence/real-docker-default.log)。

## 本地实施：窄项目成果包接线（W04 / W05）

新增 project_results 只登记真实 project/workspace、可空的真实 thread、历史 executionRoot、kind 与 manifest 收据；不为独立 figure 创建假聊天。四桥 save/list/get/read-file 由 [project-result-commands.cjs:7](/Users/fei/Desktop/Archimedes/electron/project-result-commands.cjs:7) 注册，当前窗口 facade 决定数据目录，新保存由项目工作区记录派生执行目录，更新沿已登记历史根，renderer 任意 root 不进入路径决策。链接 session 必须同项目/工作区/执行根，删 session 后关联 SET NULL，包仍可打开；真实 source/output 同步登记该 session 的 artifacts。viewer 可读不能保存。

包文件实现由前端作者独立维护：可见 research-results/{kind}/{id}、manifest 原子收据、真实 hash、symlink 拒绝、文件大小上界和无凭据 manifest。list 不读大文件；get 仅 metadata/hash 状态，read-file 只读 manifest 登记的单一文件。文件写入与 SQLite 无跨系统事务，数据库登记失败会明确失败，不能把孤立文件冒充已登记结果。

新四项真实 preload→IPC→SQLite/临时磁盘/agent 行为与包、workspace tools 合计16/16通过，lint 通过。验证覆盖跨 dataRoot 拒读、保存后重开、null→真实 session、删 session、项目改根后历史成果、viewer、hash changed 及凭据字段拒绝。既有 CSV10MiB 能力与文本工具原8MiB上限已对齐为10MiB，分页2000行和64k输出仍保留；**保存9MiB完整 CSV 后，真实 runAgent 调用 read_workspace_file 读取最终行，tool_result 实际包含末行标识**，fake provider 正常终止，无真实模型/费用。正式行为见 [project-result-commands.test.cjs](/Users/fei/Desktop/Archimedes/electron/project-result-commands.test.cjs)。前端恢复/完整旅程由其组件和唯一原生验收独立覆盖，不以此冒充整个 UI 完成。

## 本地实施：最小运行输入与历史收据（V01）

[run-snapshot.cjs:10](/Users/fei/Desktop/Archimedes/electron/reproduction/run-snapshot.cjs:10) 在每次新 run 清除旧步骤的 status/evidence/note/exit_code/duration 和旧 findings，保留执行定义。原版完整 pilot 在传入前轮 passed steps 后接受 done，以零次新执行返回内部 verified；当前生产 manager 传入 freshContract 后同样的 done 不再通过，必须执行或明确人工处理。此功能没有实现新的同 run resume RPC；点击 Run 总是新 run，历史结果在旧 run，不把“保留旧记录”说成断点续跑。[原版/当前反证](backend-evidence/reproduction-rerun-before-after.log)，正式真实 manager/SQLite 行为见 [reproduction-snapshot.test.cjs](/Users/fei/Desktop/Archimedes/electron/reproduction-snapshot.test.cjs)。

[store.cjs:3661](/Users/fei/Desktop/Archimedes/electron/store.cjs:3661) 新 reproduction 登记真实 project/workspace 与当时项目 execution_root，关联 paper 必须属于该项目。list 支持当前项目/工作区过滤，旧无 owner 记录只有 includeUnassigned 才显式列入；第一次 Plan/Run 要收到明确 tuple 才绑定，已有归属不可挪到别项目。新运行的 owner 与实际 repository checkout 分开记录：仓库缓存仍可位于 dataRoot 的 audit checkout，不暗示每个项目已获得独立 Git 副本。

run.snapshot.version=1（[正式类型](/Users/fei/Desktop/Archimedes/src/reproduction-snapshot.ts)）保存开始的 owner、规范化计划及 SHA256、paper reader 已知 hash/时间、声明环境与仅名称/hasValue 的需求。真实准备完成再填 prepared.checkout 的 URL/branch/commit/dirty/location/storage、实际 image/backend；未知用 null，不凭模型填写环境版本。final 保存该轮最终计划版本/runbook/findings、步骤、日志引用、状态和时间。输入不被后续父计划修订覆写，prepared/final 已落后不可被另一值重写，重开保持原样。[Git 采集](/Users/fei/Desktop/Archimedes/electron/reproduction/run-snapshot.cjs:47) 用真实 Git，SSH 同样读取目标 commit/status。

reproduction:get 的 snapshot_state 仅对可比较的当前计划/paper 输入标 recorded/stale/legacy-unrecorded，附原因和未追踪环境/数据/当前 checkout 限界。recorded 表示有该轮收据，**不表示输入依然相同或论文数字已复现**。当前没有自动推断步骤 DAG、全数据集内容 hash 或已安装环境指纹；V02 数值比较必须另用明确文件/映射。

## 本地实施：快照 I/O 预算（PERF01）

[workspace-files.cjs:156](/Users/fei/Desktop/Archimedes/electron/workspace-files.cjs:156) 在读取/哈希前应用8,000,000字节文本预算；超出后保留 size/mtime/ctime 元数据，继续给出文件创建/删除/修改摘要。快照专用忽略 .venv/venv、Python缓存，不改变用户正常浏览文件。Map 额外保留 coverage；agent 把 coverage 写入 action/event 并明确显示 metadata 跟踪、跳过生成目录与文件项数上限。预算位置改变导致同一文件由内容跟踪转为 metadata 时不会凭空报告修改；预算内文本仍有实际行 diff。

受控真实目录为30×900k用户文本 + .venv内120×100k生成Python：原版读取39,000,000字节/150次，修后7,200,000字节/8次，记录30项且22项降为metadata。一次本地暖缓存时间为54.81ms→7.42ms；时间仅是该样本观察，不冒称UI/RSS基准或普遍加速倍数。2项行为覆盖实际read计数、生成环境、预算外变更、预算位置变化和普通行diff；原有文件/command行为保留。[可复跑计量](backend-evidence/workspace-snapshot-measure.cjs)、[输出](backend-evidence/workspace-snapshot-measure.log)。metadata降级不能发现刻意同时恢复size/time/ctime的修改，5000项之外也无完整覆盖，因此限制明确保存，不把有界扫描当完整审计。

## 本地实施：稿件版本到评审/幻灯的交接（W06 后端部分）

[manuscript-handoff.cjs:5](/Users/fei/Desktop/Archimedes/electron/manuscript-handoff.cjs:5) 以当前窗口 dataRoot、真实项目/workspace/可选源 thread 核对历史执行根，fresh读取编译收据并比对sourceVersion/PDF hash/build/main path；源稿任一section/.bib变化会拒绝旧稿交接。新空修订会话可用 basedOnThreadId 从可访问同项目/工作区源 thread 派生持久历史根，另存 based_on_thread_id，不复制旧turn，普通新建仍去当前workspace.root，矛盾root明确拒绝。

[paper-review.cjs:221](/Users/fei/Desktop/Archimedes/electron/paper-review.cjs:221) 用后端生成的真实 review runId pin原编译输入，实际读取PDF来自已核对收据，忽略其他伪造PDF路径。创建持久行失败rollback自己的pin；正常cancel/error历史保留。后台ingestion持有源store lease到finally，切目录/关闭源facade仍不能断开其数据归属。review独立SQLite新增manuscript_json/owner_data_root，summary返回来源；main对新记录的list/get/cancel/delete/export按当前dataRoot和项目角色过滤。同项目ID在不同数据目录的history不混入。旧无owner记录保持legacy且manuscript=null，未凭空补来源。

[paper-to-slides.cjs:17](/Users/fei/Desktop/Archimedes/electron/paper-to-slides.cjs:17) 新第三参数需要真实已创建目标thread，校验源/目标同dataRoot与项目，允许源历史root和目标当前root不同，复制已核对PDF到目标任务；旁存manuscript-origin.json，真实threadId作为pin引用，复制/receipt失败rollback，旧两参数选择普通PDF仍兼容。frontend负责把该来源和已staged附件保留到真实任务及返回入口；此处不声称所有UI交接已完工。

4项完整生产orchestrator依赖注入/真实SQLite与编译收据/临时磁盘测试覆盖pin+后台lease、失败rollback、source/PDF变化拒绝、历史根→新目标根、跨项目拒绝和同projectID跨dataRoot history。PDF解析/模型依赖用无费用fixture，生产createRun函数完整加载；不是科学评审质量实验。[manuscript-handoff.test.cjs](/Users/fei/Desktop/Archimedes/electron/manuscript-handoff.test.cjs)。本轮精确核心32/32（0skip），扩展165项164通过，唯一失败为前端正在更新PaperToSlides组件的旧提取harness，已交作者修复加载并保留原断言；记录 [core-targeted-after.log](backend-evidence/core-targeted-after.log)、[阶段扩展输出](backend-evidence/core-extended-after.log)。强制完整tsc与diff check通过，未运行本轮最终全仓build/package，不抢前端原生窗口。

**Linux补核查：**实际远端入口始终bash -lc或bash -c，不直接把ownedCommand交给默认dash。在现有Linux镜像的非TTY /bin/sh→生产bash包装中实测PID=PGID，cleanup停止后代、无orphan marker，唯一任务容器已删除。Python slim缺ps时原cleanup会跳过核实；现先检查bash/ps，并在不能确认活PID归属时保留资源/报错，不能记录released。没有安装远端组件或启动新守护服务。[脚本](backend-evidence/linux-owned-process-smoke.cjs)、[结果](backend-evidence/linux-owned-process-smoke.log)。

## 最后窄接口与可复用验收资源

V01另补 listReproductionRuns/getReproductionRun 两桥，按父记录项目viewer/当前dataRoot校验，每轮返回自身snapshot和相对于当前输入的snapshot_state；历史面板读取该轮final.runbook/summary，不能用当前父contract冒充旧计划。X01导入新增restoration标记保存原owner/run/checkout身份，prepared.checkout.location不伪装成新目录；snapshot_state=restored-history明确未在恢复目录执行。正式历史IPC回归覆盖可访问旧收据、当前计划变更stale、无权项目和另dataRoot拒读。

基于项目保存成果的独立空聊天新增 basedOnResultId，由[同一context resolver](/Users/fei/Desktop/Archimedes/electron/workspace-context.cjs:12)取已登记历史root，另存based_on_result_id；与basedOnThreadId同传明确拒绝。普通新聊天仍去当前默认根，无关联会话的旧CSV包在项目改默认目录后可以合法继续，不能为迁就默认根制造重复成果。X01须在成果插入后第二遍补这条可空FK，不关闭外键校验。

[stageProjectResultFigure](/Users/fei/Desktop/Archimedes/electron/project-result-commands.cjs:19) 只把同dataRoot/项目已登记且hash当前的output PNG/JPEG/PDF复制到所选真实稿件的figures/results；历史目标根由真实thread或workspace解析，逐级拒symlink。文件名包含resultId与hash，更新源图不覆盖旧稿已经使用的版本，重复相同图可复用；旁存.source.json保留resultId/manifest/hash，真实目标thread登记artifact。**不修改主.tex**，仅返回相对路径给前端草稿插入。源包changed/missing、无权项目、跨项目、外部链接目标都拒绝。6项真实result bridge/store/FS/agent行为包含2项新成果→历史root→稿图路径；与snapshot/history/context共18/18通过；新contract集合（6成果、5运行快照、4稿件交接、2快照预算）17/17通过，零skip。原4个reproduction目标亦保留全部断言，准备取消harness现用完整注册+生产manager+真实隔离SQLite，4/4通过。

**正式managed引擎资源（V03/K04，不是K05裁剪结论）：**从[官方0.17.0发布包](https://github.com/tectonic-typesetting/tectonic/releases/tag/tectonic%400.17.0)取得darwin-arm64归档21,704,674字节，第一次120秒到17,169,125字节保留断点，90秒续传完成；archive SHA256 a3f1cac7…45667与extract binary b52b5a73…f7f9c逐字匹配仓库清单。不是复用系统同版本binary替代。真实官方default bundle按索引range补Helvetica文件，建立仅测试的flat子集（255文件，有独立内容身份，不当完整上游bundle或分发资源）。原 managed-latex-engine.live.test.cjs **1/1通过、0skip**，覆盖cold字体/包请求、HTTP服务关闭后重编译与队列正例。首次本地fixture被继承代理转发得502，保留失败；只对测试进程设NO_PROXY绕过localhost，未改用户代理/产品配置。[成功](backend-evidence/official-managed-tex-live-after.log)、[首次代理失败](backend-evidence/official-managed-tex-proxy-before.log)、[完整SHA/路径/复跑参数](backend-evidence/official-tex-resource-handoff.json)。尚未执行最终app.asar/package，资源仍在任务cache，不把本项当K05完成。

**其他原条件测试：**从[作者官方仓库](https://github.com/MemTensor/MemT-1.0)确认论文，再下载[固定arXiv v2](https://arxiv.org/abs/2610.26825v2)到任务临时目录；原pdf-equations 10/10通过，零skip，包含第6–8页15个显示公式在五档缩放的全部原断言。[输出](backend-evidence/memt-equations-live.log)及[完整fixture hash/出处](backend-evidence/conditional-resource-handoff.json)。已知Kimi Desktop app/pyz/python候选路径均不存在，有界官方查询未确认可单独取得的pyz；未以第三方逆向导出器替代官方checker，不安装大套桌面依赖/不登录账号，因此Kimi live继续明确跳过。原断言未改。

## L02 最后scope复核与幻灯任务预检

**同ID复制数据库：**新增真实两SQLite回归在A的生产manager仍活跃时VACUUM复制DB，B首次打开后用生产recoverWorkspace和只记录的cleanup callback验证。修前B错误认领A资源（[实际断言失败](backend-evidence/copied-resource-before.log)），未真实停止任何A容器/SSH。现adopt资源收据附当时canonical dataRoot，恢复须同时核scope、ownerToken、runId；直接复制/搬走DB不能重写原scope来获取清理权限，未知/不同scope保留pending并把原因写公开run.error。原alias同目录恢复正例仍通过，正常精确资源照常清理。不是新owner平台，也未为自动支持搬库冒险清另一活任务。

main的run/plan事件现在在展开payload后加捕获dataRoot/projectId/workspaceId/reproductionId；生产写入lease不变。完整main注册+生产manager+真实同ID双SQLite验证B当前可收到A晚finished/plan但字段仍属A，B当前持久状态不被A规划改写。规划reader/review也显式传record.project_id，新回归故意给默认项目与选定项目不同论文审阅，保证不会拿默认项目材料。生命周期最新8/8通过，[输出](backend-evidence/reproduction-scope-final.log)。前端另用真实组件验证按完整scope过滤；不能只凭reproductionId接纳同ID另一库事件。

**W10依赖预检：**[paper-to-slides-setup.cjs](/Users/fei/Desktop/Archimedes/electron/paper-to-slides-setup.cjs:8) 读取现有check_env.py，经python -B - stdin运行（Electron fs可读ASAR、Python不直接访问ASAR路径），复用真实有界process runner，整个检查8秒并清子进程组。只读presence/任务token布尔值，无依赖安装/设置修改/模型请求；CLI登录由既有checkAgentBackend另查，token不等于认证有效，字体/网络/真实输出也未验。基础Python+requests/dotenv/PIL、node/npm+pptxgenjs与token缺失给具体下一步；预览/QA/icon的soffice/pdftoppm/markitdown/react类缺项明确optional，不假装已完成QA，也不一概阻止PPTX生成。

4项测试（真实现成脚本、本机presence、缺Python/PATH、隔离inventory可有限启动、任务token缺失、真实挂起npm子进程超时不再写orphan）4/4通过，0skip；正例inventory明确只是存在性fixture，不冒充空模块可实际生成。[正式测试](/Users/fei/Desktop/Archimedes/electron/paper-to-slides-setup.test.cjs)、[输出](backend-evidence/slides-setup-after.log)。此机当前app Python确缺requests/dotenv/PIL、global npm缺pptxgenjs，所以本机真实预检canStart=false；没有为了造通过而安装依赖。POSIX shell/组清理fixture在Windows会明确有平台条件，Windows走既有taskkill runner，未声称已做Windows实际启动。

本批最后聚焦36/36（0skip），最后scope+项目规划8/8重新通过，强制完整tsc与diff check通过；全仓/原生/打包仍交统一owner冻结后执行，不把本批当最终PR gate。TeX资源另已补官方默认bundle cache：正式hash binary+生产默认URL，在--only-cached下article+Helvetica真实通过（1277ms），供临时profile预种，其他稿件包不保证预先具备。[结果](backend-evidence/official-tex-default-cached.log)及[最新runtime/cache handoff](backend-evidence/official-tex-resource-handoff.json)。

## 3. 后续值得做、但不应混进本轮局部补丁的工作

**最小复现运行快照。**原版 reproduction/run 没有 project_id、checkout commit/dirty 和计划版本；本轮 V01 已按实施节补最小收据，完整环境/外部数据版本仍未追踪。先保存运行开始时的少量真实标识、最终步骤与输出引用，成本远低于建设完整 provenance 平台。论文个人 notes/reading_status 按 `(paper_id,user_id)` 共享是当前模型，不应直接当作 bug；若产品需要“这个项目为何选择论文/它在本项目的判断”，应新增独立项目上下文，不破坏个人阅读状态。

**有证据的性能方向。**原版 `snapshotWorkspace` 读取/哈希早于预算、未跳过 `.venv`；PERF01现已前置预算并实测读取量。API command前后仍同步扫描有界 metadata，未新增worker。原版 Docker/SSH process helper 收集完整输出数组；此项 PERF02 已按上节完成有界捕获和完整目标日志。尚未测真实 UI 卡顿或 RSS，不把静态上界写成实测性能问题。优先对长日志使用流式持久化，对快照读取量和截断可见性做实测，再决定 worker/增量扫描，而不是先加任务队列基础设施。

**首次安装的可选能力边界。**唯一 transformers 导入在 [semantic-worker.ts:1](/Users/fei/Desktop/Archimedes/src/figureforge/semantic-worker.ts:1)，使用 onnxruntime-web/WASM 做 FigureForge CLIP 参考图语义搜索；[ImageCreationView.tsx:345](/Users/fei/Desktop/Archimedes/src/ImageCreationView.tsx:345) 先显示关键词结果，按用户操作加载 worker，失败回退关键词。主进程无 onnxruntime-node 导入；该 native 包成为所有源码安装前置是 transformers 的硬依赖造成。可评估 browser-only 依赖/可选组件打包，但不能因本机下载慢就移除该功能。另 README Node20+ 与锁定 Electron/rebuild 所需 >=22.12、jsdom 所需 ^22.13 或 >=24 不一致，首次环境检查应统一。

**云端开放前验证（C01/C02 本地已验收）。**原版两个真实 SQLite 缺陷断言（同 ID 终态未上传、删除 library 重连复活）现均通过。turn active/final revision、数据库终态 trigger 与本地导入单调合并保护 completed/failed/incomplete；library/item 墓碑与持久 journal 保留删除及显式重加，其他库引用的 canonical paper 保留。core 已接五个 store wrapper、原子删除/重加与内部 viewer 导入。独立最终 **31/31 聚焦通过、零跳过**，包含双 SQLite＋真实 HTTP、旧 pull/重连、丢 ACK/晚 ACK、首次上传中删除、viewer 与窗口 dataRoot/lease 归属；邻近另 17 通过、1 真实账户条件跳过。实际 PostgreSQL 17 已执行原 DDL/RLS、全部迁移和 0013 重复部署，终态并发旧写、墓碑、重加与 viewer/outsider 权限通过。普通 Postgres 环境只省略原 schema 未使用的 vector 扩展声明，auth.uid 为本地上下文，**未做真实 Supabase 两账户、托管 Auth/Realtime 联验**。临时数据库容器已精确清理，未部署。[协议、前后日志与真实 SQL 证据](implementation-evidence/cloud-sync-review.md)。v0.1.0 tag `af3e8b4c201b25bb8c4415b23f14f0c752120c0a` 的 `CLOUD_FEATURES_ENABLED=false` 与 main 的有意分叉保留。

## 4. 测试与验证的实际含义

环境为 macOS arm64、Node `v26.13.0`。共享依赖由统一安装者协调；npm ci 已退出 0，原生 node-pty 重建成功，package/lock 未变，Electron 43 已就绪。统一原版全套基线为 1,270 项：1,256 通过、7 失败、7 跳过；上一阶段局部修复后 1,288 项：1,274 通过、同一组 7 失败、7 跳过。lint/build/theme 通过，具体既有失败由质量/前端报告汇总。这里不声称全套或桌面科研全流程通过。

| 验证 | 结果 | 能证明什么 |
| --- | --- | --- |
| 原版 native adapters、transport、pilot、preflight、paths 6 个测试文件 | 84/84 通过 | 防重放、dirty continuity、请求关联、审批取消、进程树清理等已有防护继续成立 |
| 原版 store/session/context/command/model/workspace-tools 聚焦 8 个文件 | 46/47 通过 | 一项 Git worktree 状态在 macOS 临时路径别名下失败，不能宣称全绿 |
| 原版 workspace-session-model，用同目录 realpath 作为 TMPDIR 重跑 | 6/6 通过 | 失败定位为 git-state 按 path.resolve 比较 canonical Git topLevel 的别名处理缺口，未删除断言 |
| store-lifecycle 2 项新行为目标 | 原版 0/2，通过目标断言均失败 | 真实 agent/store 跨库失败、真实进程退出后的幽灵运行 |
| reproduction-lifecycle 4 项新行为目标 | 原版 0/4 | 外部 symlink 写入、准备阶段取消无效、旧 verdict 沿用、模型中取消误归 failed |
| model-stream 1 项新行为目标 | 原版 0/1 | 真实 adapter 接受缺 terminal event 的 partial stream |
| 局部修复的 pilot 及 contract/preflight/planner | 隔离 worktree 与应用后主工作区均 63/63 通过 | 局部修复及相邻契约兼容；不等于完整应用验收 |
| Writing 组件/临时磁盘/原IPC及相邻行为 | 独立复核均 32 通过、0 失败、1 跳过 | 六项新增组件路径通过；不等于真实云协作或完整科研 E2E |
| 最终统一全套与构建检查 | 1,274/1,288 通过，既有 7 失败、7 跳过；lint/build/theme 通过 | 两项局部修复及 Files 修复集成后没有新增全套失败；不掩盖原版失败 |

新增 evidence 脚本是回归目标，因此在仍有缺陷的原版返回非零是预期证据；不要把它们混成“上游测试全部失败”。它们使用无费用 fake provider/backend、独立临时数据库/目录并自行清理。准备阶段取消验证复用的是 main 原始完整局部注册块，不冒充完整 Electron E2E。

现有测试可信度有层次：native/command 测试有真实子进程、取消和协议行为；许多 `ui-audit-*` 是源码字符串契约，能防止移除标记但不能证明跨模块用户流程。下一批新增验证应集中在完整身份切换、恢复和证据失效，避免继续堆“文件里包含某段文本”的测试数量。

## 5. 建议实施顺序

1. 先审阅本地已应用的 pilot/contract 与 Writing owner 修复，保留针对行为验证与限制说明；本次没有 PR 或提交。
2. 同一次任务上下文贯穿窗口/项目/会话/文件/store；先解决跨窗口与同名文件错归属，再开放更多并行运行。
3. 统一 reproduction 从准备到退出的取消和幂等收尾，同时修 checkout 结构化写入边界。
4. 补普通研究运行重开恢复、协议 incomplete 状态；用户可直接继续并检查部分结果。
5. 再做最小运行快照、真实大目录/长日志测量、可选语义搜索安装优化；协作功能开放前单独完成同步语义验收。

每项都应以可重现用户路径作为完成标准；不需要先建设通用调度平台、推断未知 DAG、自动论文数值比较或全仓重构。
