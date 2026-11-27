# W02 / W03 / X02：发现记录与文献互通

本批实现已落本地分支，**聚焦行为通过，原生 after、统一 lint/build 和最终全套仍待协调验收**。不把组件重挂载称为实际应用重启，不把无网络 fixture 称为真实论文检索/模型评测。未启动第二个 Electron、重装、提交或发送 PR。

## 实现边界

| 任务 | 当前行为 | 对应模块 |
| --- | --- | --- |
| W02 | Daily quick/deep 及 conference 记录按 `JSON([dataRoot, projectId])` 隔离；保存查询、候选、来源、条件、目标与选文草稿。返回/重开先显示记录，不自动重查；用户显式刷新或改条件才重新查询。可在已有默认库时页内新建第二专题库，并选作保存目标；写本机存储失败明确提示 | [discovery-state.ts](/Users/fei/Desktop/Archimedes/src/discovery-state.ts:35)、[DailyDiscovery](/Users/fei/Desktop/Archimedes/src/LibraryView.tsx:2552)、[ConferenceDiscovery](/Users/fei/Desktop/Archimedes/src/ConferenceDiscovery.tsx:22)。App 的真实 dataRoot 接线由前端作者维护 |
| W03 | 收藏时纸张/库链接/项目理由/发现来源在同一次 IPC、SQLite 事务保存。项目理由与个人 notes/reading_status 分离；Inspector 可明确保存理由并回看 query、criteria、date、providers、degraded/warning、独立机器解释。新发现省略 reason 不清已有人工理由 | [ProjectPaperContext](/Users/fei/Desktop/Archimedes/src/ProjectPaperContext.tsx:6)；core schema/store/main/preload/types 由工程作者维护，详见 `electron/library-records.cjs`、`electron/library-project-records.test.cjs` |
| X02 | 先解析/预览 BibTeX，区分新增、已有差异、本次重复和引用键冲突。默认导入保留原 metadata、PDF、notes、citekey；仅用户逐字段勾选才调用显式 repair。跨标识匹配沿用已存在 paper ID/canonical key；导出能预览/下载，已存 citekey 往返稳定。离开页面后停止尚未发出的后续导入 IPC | [bibliography.ts](/Users/fei/Desktop/Archimedes/src/bibliography.ts:32)、[BibliographyDialog](/Users/fei/Desktop/Archimedes/src/BibliographyDialog.tsx:7)、`LibraryWorkspace.tsx` 与 `library-preview.ts` |

恢复记录保存在当前桌面 profile 的 localStorage；项目 selection/bibliography 保存在所属数据目录 SQLite。这不是跨设备迁移包，X01 仍独立。BibTeX 支持常见 braced/quoted/literal 字段、嵌套花括号、分组作者、Unicode 和 DOI/arXiv 标识；宏表达式、string/preamble 等指令有明确跳过/报错，不静默推算。此批不执行引用文件中的路径、不下载 PDF，也不承诺全部 TeX 宏的显示格式无损。

## 对原审阅触发条件的纠正

原版 `createResearchProject` 就创建默认 `Project library`，删除最后库也受保护。因此“正常新项目没有库而必然无法保存”不成立，已修正总报告/产品报告/实施矩阵。空库只可作为合成条件，不计正常用户复现。

前端用旧 dist、真实 UI 新建项目和无网络 feed，已证明 query/submitted search 状态离页返回后消失。[原始观察](../frontend-evidence/discovery-before-observation.json)明确 fixture 始终返回同一个 candidate，所以**不据此宣称实际候选内容丢失**。实际新流程验收改为默认库→当前页第二专题库→收藏→阅读→返回/重启。

现有同视口/暗色 before：[发现页](../../../assets/research-workflow-integrity/discovery-before.jpg)、[返回后查询丢失](../../../assets/research-workflow-integrity/discovery-return-before.jpg)、[原导入入口](../../../assets/research-workflow-integrity/library-import-before.jpg)。after 由唯一 UI owner 补充，当前不伪标完成。

## 已完成的验证

```sh
node --test electron/discovery-bibliography.test.cjs electron/daily-figures-ui.test.cjs electron/library-project-records.test.cjs electron/library-workspace.test.cjs electron/i18n-translations.test.cjs electron/ui-audit-module-headers.test.cjs
```

**32/32 通过，零失败、零跳过**；包含新增六条实际组件＋真实临时 SQLite/存储旅程、既有缩略图五项与后端实际 IPC/事务四项等相邻检查，不与其他批次重叠计数相加。新增旅程覆盖：

1. 正常项目页内建第二库、原子保存理由与降级来源、重挂载不重查、同 project ID 的另一 dataRoot 不串查询。
2. 同一 paper 在 A/B 的理由独立，个人 notes/reading_status 共享；关闭重开真实 SQLite 后理由仍在。
3. 嵌套字段、分组作者和稳定引用键往返；宏、非法 key、缺闭合不会悄悄变成成功条目。
4. 实际 BibTeX 对话框＋SQLite 重导保留用户改题/PDF URL/notes/citekey，明确勾选 title 才改题，导出保留用户 key。
5. conference 查询/候选/官方来源条件恢复，重挂载不重新调用服务。
6. 延迟导入返回前离开页面，已发操作在原 store 完成，不再启动下一项或给新 root 写 bibliography。

测试实际挂载 Daily/Conference/Bibliography/ProjectContext，使用真实 Tabs、Node SQLite、localStorage 与真实 store；图像、Dialog 容器等非本目标依赖被替代，不是完整桌面 E2E。后端独立检查还验证 viewer 禁写、selection 失败整体回滚、PDF 页保留和 metadata identifier 去重。中途全套暴露旧缩略图测试提取边界问题，原因是给原私有 Daily 函数增加了不必要 export；已恢复原私有边界，旧五项 harness/断言全部保留并通过。

## 原生 after 操作交接（待验）

使用 [discovery-fixture.cjs](../../../../electron/test-support/discovery-fixture.cjs)，临时 wrapper 只把 `library:discover-daily` 替为 `feed(input)`，其他库/理由/导入均走真实 IPC/store；不请求模型，不点击准备远端 PDF。

1. 真实新建项目，确认默认库存在；Daily 输入 `handoff evidence` 并搜索。
2. 页内新建 `Focused evidence`；query/candidate 应保留，Save target 改选该库；填 `A baseline` 并 Save。
3. Library 打开该 paper 的 reader 后返回 Daily，query/candidate/target 保留；相同 profile 重启后仍保留，wrapper 计数证明未自动检索。
4. 选专题库打开 BibTeX interchange，粘 fixture `bibtex`。可改 BibTeX title 为 `Proposed correction` 显示差异；默认不选 repair 导入，检查仍一条且原标题/notes 保留。
5. 预览导出应含 `handoff2026` 或现有用户 key；重复导入不替换它。明确勾选 title repair 再导入，才出现改题。
6. 保存 `discovery-after`、`library-bibtex-after`、`project-reason-after` 图及实际观察 JSON，和 before 同 `1560×980`/暗色。前端统一关闭进程与清理临时数据，后续报告如实标已验范围。
