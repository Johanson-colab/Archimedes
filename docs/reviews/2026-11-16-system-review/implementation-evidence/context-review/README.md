# 独立上下文与恢复复核

日期：2026-11-16。审阅基线为 `1f4b37581c446770d576440f9ebb9bca5c55bfb7` 上的本轮未提交实现。只读产品代码与作者测试，只在本目录保存独立探针及输出；没有安装依赖、启动 Electron、调用真实模型/云账号或更改用户文件。所有数据库/项目由探针创建于唯一临时目录，并在退出时清理。

## 首轮结论

当前 **不能标记 A01/A02/A03/L03 的联合验收完成**。已有关键行为通过，但独立探针确认下列三项仍需作者修复及独立复跑。问题已分别通知前端、后端与主协调者；作者已接收前两项，第三项等待后端处理。本报告是修复前检查点，不能代替后续最终验收。

1. **已有 Session 的草稿/附件身份没有数据目录。** `taskDraftKey()` 对 saved thread 只返回 `threadId`。两个数据目录各自导入同一个云 thread ID 后，A/B 的文本存储键、ComposerSession 附件和待追加文本共用同一键。真实 helper + 两个真实 SQLite 数据库已证明：A 的附件会被 `getComposerSession(sessions, keyB)` 读出。修前见 [context-identity-before.log](context-identity-before.log)。
2. **刚导入的 Session 与后端执行目录不一致。** 启动后 `applyCloudThread()` 创建的 thread 没有本地 `workspace_id/workspace_path`；若项目目录不同于主数据目录，前端 `threadTaskSelection()` 回退到 dataRoot，后端 resolver 选择项目默认 Workspace root。发送携带前端 tuple 时被 `The execution folder does not match...` 拒绝；在发送前 Files 等界面也会选择错误目录。同一探针与日志直接记录这两个 root 和拒绝结果。需要让打开返回/前端选择取得同一 canonical 身份，并保留 viewer 读取与历史 root 语义。
3. **混合本地/云运行的恢复将 Session 汇总状态改为 idle。** 一个 thread 既有遗留本地 running turn（有 task_id），也有同步拉入的仍在云端运行的 turn（task_id NULL）时，恢复正确中断前者、保留后者，但无条件把 thread.status 写为 idle。`agent.runAgent()` 的 thread.status 门随之失效，可能再启动本地运行。`thread-sync.cjs` 的 cloud→local 路径允许更新同 thread 并加入新 turn，因而不是只能手改数据库的状态。修前见 [mixed-recovery-before.log](mixed-recovery-before.log)。

## 已验证的行为

独立运行 **45/45 通过、零跳过**：store facade 跨 await/别名/延迟关闭，真实 IPC 包装切换，真实终端子进程在返回后保有原库，混搭零 provider 副作用，双库同 thread ID 的后端 Stop/approval 隔离，首次恢复本地 task/turn/approval/command 且保留独立云 thread，project/session/workspace/git 相邻行为，以及 fake-native 真实子进程。输出为 [backend-focused.log](backend-focused.log)。

另直接复跑原始两个缺陷断言 **2/2 通过**：在途 API 回答切库仍完整落原库；独立进程退出后的孤儿运行和审批能恢复并直接归档。输出为 [legacy-lifecycle.log](legacy-lifecycle.log)。

代码读取确认：main 的 `workspace:open` 按新请求目录选 store，其余已绑定窗口 IPC 按 sender 选 store；agent 及 terminal 使用显式 facade/lease；执行 root 与 dataRoot 分离；历史 Session 保留已持久化 root；project/workspace/thread 的不一致在新 task/provider 前拒绝；普通 thread 私有性由 getResearchThread 检查，resolver 再检查 editor/archived。此次未发现这几条主干的额外可达反例。没有把 EventEmitter/AsyncLocalStorage 的理论可能性作为新缺陷。

## 可复跑命令

在仓库根目录执行：

```sh
node docs/reviews/2026-11-16-system-review/implementation-evidence/context-review/context-identity-probe.mjs
node docs/reviews/2026-11-16-system-review/implementation-evidence/context-review/mixed-recovery-probe.cjs
node --test --test-concurrency=2 electron/workspace-context.test.cjs electron/thread-commands.test.cjs electron/workspace-session-model.test.cjs electron/project-workspace.test.cjs electron/native-harness-bindings.test.cjs electron/agent-approval-surface.test.cjs electron/agent/command-runner.test.cjs electron/codex-agent-integration.test.cjs electron/external-agent-integration.test.cjs
node --test docs/reviews/2026-11-16-system-review/backend-evidence/store-lifecycle.cjs
```

两个独立探针以目标正确行为为断言，修前预期退出 1；输出仍保留实际观察，不能称为通过。`review-checkpoint.sha256` 是首轮完成时的文件检查点；作者并行修复可能已开始，因此这些哈希不冒充两份早先失败日志的精确源文件版本。

## 尚未覆盖

前端原生窗口、快速切换及真实组件接线仍由唯一 UI 作者验收；本审阅不控制 UI。全仓 lint/test/build/theme 由统一验收阶段执行。复现生命周期、模型协议完整性、后续研究旅程及真实 Docker/SSH/付费模型均不在此次首阶段复核的通过声明中。
