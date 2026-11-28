# 后端行为证据

基线：`1f4b37581c446770d576440f9ebb9bca5c55bfb7`，macOS arm64、Node 26.13.0。脚本引用当前工作区的原始模块；产品代码发生修复后，修复对应的目标断言应转为通过。

在仓库根目录运行：

```sh
node --test docs/reviews/2026-11-16-system-review/backend-evidence/store-lifecycle.cjs
node --test docs/reviews/2026-11-16-system-review/backend-evidence/reproduction-lifecycle.cjs
node --test docs/reviews/2026-11-16-system-review/backend-evidence/model-stream.cjs
```

这三个文件是目标行为回归检查，在未修复基线分别有 2、4、1 项断言失败。不要把预期的回归失败误报为既有上游测试全套失败。

- `store-lifecycle.cjs`：真实 SQLite store 和 agent；无网络 fake fetch；独立子进程模拟运行所有者退出。
- `reproduction-lifecycle.cjs`：真实 Docker backend 的主机结构化文件方法、真实 pilot；准备阶段取消使用 main 中完整原始 reproduction 注册/executeRun 局部块与 fake backend。没有运行 Docker 或 SSH，不是完整 Electron E2E。
- `model-stream.cjs`：真实 Anthropic adapter、Web ReadableStream、无网络 fake fetch。

数据库、配置及文件写入只发生在脚本自建的唯一临时目录，结束后清理；只使用明确 fake key。不启动真实模型、容器、SSH 或 Electron，不访问用户研究数据。

`pilot-candidate.patch` 保存已应用局部修复的四文件差异；`pilot-before-summary.txt`、`contract-before-summary.txt` 保存新增行为测试指向原版模块时的紧凑结果，`pilot-after-summary.txt` 记录主工作区应用后的结果，不包含运行数据或凭据。临时 worktree 已清理，此后均从主工作区复跑。当前 `reproduction-lifecycle.cjs` 四项均已通过；准备取消 harness 已适配当前完整 main 注册与生产 run-manager（fake backend），保留原行为要求并加强取消/幂等清理断言。原版失败事实仍以固定 SHA 和初轮记录为准。

Writing 后续修复的正式组件行为测试在 `electron/paper-writing-workspace.test.cjs`，使用真实组件和隔离临时磁盘，不在此复制另一套测试。`writing-before-summary.txt` 记录同一 owner 场景指向原 SHA 组件时的断言失败；`writing-after-summary.txt` 记录本地相邻检查。Electron/真实磁盘联验以 frontend 报告及其原生证据为准。

本轮 A01/A02/L03 的正式回归见 `electron/workspace-context.test.cjs`。`store-context-after.log` 是当前数据身份/恢复主干与相邻 79 项全通过输出；其中包含原 `store-lifecycle.cjs` 两项从失败到通过的行为。另 fake-native 真实子进程集成 5/5 通过。所有新增路径均使用唯一临时数据库和 fake provider，不调用真实模型。更广的最终统一结果由 implementation/quality 汇总，不把阶段性输出冒充全套。

独立 context 首轮复核发现导入聊天缺本地目录、混合本地/云 running 汇总两个遗漏，修复后保持原独立 probe 断言复跑退出 0，见 `context-import-after.log`、`mixed-recovery-after.log`。正式组件外后端 context 用例增至七项；`store-context-review-after.log` 为核心＋fake-native真实子进程＋build-info合计86/86通过（零跳过），不是新的统一全套。首轮独立修前记录保留在 `../implementation-evidence/context-review/`。

M01 的 `model-original-run.cjs` 在独立进程中内存编译原 SHA 的 agent、Anthropic、JSON model adapter，再跑正式新增行为；不写产品文件/checkout，不把缺方法等加载错误当反证。结果6项1通过/5真实断言失败，见 `model-before-summary.log`；当前185项相邻全通过见 `model-after.log`。原 `model-stream.cjs` clean EOF目标现也通过。新状态可首次序列化/import；已发布turn增量同步仍属于C01。

L01/L02/B01/PERF02：`lifecycle-after.log` 为144/144聚焦通过（0 skip），正式新增见electron/reproduction-lifecycle.test.cjs、reproduction-backends.test.cjs、agent-shutdown.test.cjs。`process-output-measure.cjs` 内存编译原 SHA 完整 private helper，再比较相同8MiB输出的原/当前留存量，见同名log。`local-services-smoke.cjs` 是单独显式运行的有界真实服务烟测；默认不是npm test自动启动服务。临时localhost sshd fixture自行清理；Docker使用已安装daemon，仅操作自己创建的UUID容器，日志区分首次默认pull超时、已有镜像override和最后默认Python实际成功。Docker服务按协调授权暂留最终验收，不在脚本里停止他人任务。

W04/W05真实IPC/store/FS/9MiBCSV agent末行测试在electron/project-result-commands.test.cjs；包模块的文件边界与回读测试由前端维护。新成果目录是可见research-results，无额外隐藏目录读取白名单。

V01正式类型src/reproduction-snapshot.ts，行为electron/reproduction-snapshot.test.cjs；reproduction-rerun-original.cjs加载完整原SHA pilot，证明旧steps零新执行返回verified，再对比生产manager使用freshContract的新输入（实际manager/store另有正式回归）。PERF01 workspace-snapshot-measure.cjs用同一真实临时目录/完整原与现函数计read字节，计量log保留，不将时长当UI/RSS结论。W06消费者manuscript-handoff.test.cjs加载完整orchestrator，用真实store/收据/FS与fake PDF/model依赖，无TeX下载/付费模型。Linux owned过程的真实现有容器补验见linux-owned-process-smoke脚本/log，容器精确清理；缺ps是明确前置错误。core-targeted-after32/32，core-extended-after为阶段164/165（前端Slides提取harness待作者迁移），不是最终统一gate。

最终小批新contract 17/17（new-core-contracts-after.log），成果/历史/context组合18/18（history-figure-stage-after.log），有重叠不相加冒充全套。四原reproduction目标当前仍4/4，取消harness现在直接使用真实隔离SQLite facade。官方managed原live1/1、MemT原pdf-equations10/10零skip；official-tex-resource-handoff.json和conditional-resource-handoff.json保存实际本机任务缓存路径、完整hash与官方出处，供最终gate复用；不包含第三方PDF/二进制本体。Kimi官方pyz未具备，明确保留条件跳过。所有运行资源等统一最终验收后清理，本批未构建/打包dist或app.asar。

最终scope小批backend-final-scope.log为36/36；随后reproduction-scope-final.log为最后8/8（含复制活DB不回收另一scope及真实main晚事件归属、项目审阅上下文）。copied-resource-before.log是修前真实失败，callback仅记账不杀资源；复制receipt原dataRoot修后仍保留，不被改写。W10现成presence脚本4/4见slides-setup-after.log，仅检查存在不验证认证/网络/真实生成，本机缺基础Python/globalnpm依赖如实false，未安装。official-tex-default-cached.log是正式binary+生产默认URL+only-cached的article/Helvetica成功；最新handoff包含可复制到隔离profile的task runtime，不触碰真实profile。
