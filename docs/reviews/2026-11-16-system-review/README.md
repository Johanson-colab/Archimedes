# 科研工作流审阅与最终交付

**本轮实现与本地验收已完成。** 37 项任务、R01–03 和恢复后再收藏的 I01 修复见[实施矩阵](IMPLEMENTATION.md)。已本地提交至 `codex/research-workflow-integrity`；当前公开 head 为 `f6b5ee37721d9e908c401f9acc8a5765654c490f`，共 221 个公开代码、测试、文档与图片文件。本目录为本地审阅证据，不入 PR。

基线为 `main / 1f4b37581c446770d576440f9ebb9bca5c55bfb7`。实现将会话、文件、附件和执行结果绑定原数据目录/项目/工作区，保存完整分析/图稿源文件与配置，并使既有稿件、编译 PDF、评审/修订、项目迁移和数值核查可继续使用。角色记录：[产品](product.md)、[前端](frontend.md)、[后端](backend.md)、[质量](quality.md)。

## 最终验证

| 检查 | 实际结果 |
| --- | --- |
| 标准 `npm test` | 1445 项：1441 通过、0 失败、4 条件跳过；包含两个真实 Electron 布局、官方 managed TeX 冷/离线编译、MemT PDF 与 theme，约 27.6 秒 |
| 最后 V02 样式/文案 | 现有组件/i18n 7/7，通过 `npm run lint`；只改样式/说明及对应测试文案定位 |
| `npm run package:desktop` | 退出 0，含类型检查和 renderer build；未发布 macOS arm64 `.app`，无 Developer ID 因而未签名 |
| 实际包资源 | 原 semantic worker、ORT 模块、28,352,885B WASM 加载/编译通过；HTTP(S) 请求 0，包内无未使用的 ONNX Node native |
| 实际包入口 | 直接运行打包二进制，原生 PTY 命令、语义资源不可用时的正常关键词候选、保存数值报告重开及最终面板样式通过 |

[最终 gate](implementation-evidence/release-final-gate.json)、[全套日志](implementation-evidence/final-standard-tests-after.log)、[最后 UI 检查](implementation-evidence/final-ui-related-results.json)、[实际包](implementation-evidence/final-package-summary.json)、[实际二进制入口](implementation-evidence/final-package-entry-result.json)。全套执行后仅有 V02 样式/文案变动，按其范围回归现有组件/i18n、lint 和真实包；未重复全仓。

## 正常原生旅程

- 完整八行 CSV 分析重开，回到历史执行 root 的关联会话，保留原未发送草稿；PNG 加入既有多文件稿件，真实官方 Tectonic 编译通过。
- 当前稿件 PDF 交评审并引用其版本，反馈进入正确修订任务；slides 收到同一 PDF，并正确呈现缺依赖时的配置动作。
- 同 ID 双 dataRoot 下延迟回复、附件和磁盘输出只归原 A，B 草稿与文件保持独立。
- 17 文件项目导出后，在另一 dataRoot 恢复新项目/目录，继续旧稿、完整分析，再选 CSV、确认映射、保存并重开数值报告。

[26 步实际记录及指纹](frontend-evidence/final-native-workflows.json)。恢复后再次收藏/Bib 导入保留 B 的单条论文、笔记/PDF/页索引/项目理由，A 不变：[独立生产探针](implementation-evidence/restored-paper-discovery-independent-after.log)。

## 运行条件与公开交付

四个条件测试分别需要 latexmk、官方本地 Kimi PPTD 工具、两个托管 Supabase 账户的共享与 Realtime。未执行付费模型/MinerU 的真实 PPTX 生成，未运行 Windows/mac Intel 安装包。源码全套中的受控模型响应不作为科研结论质量评测。

已有真实 localhost SSH、Docker、PostgreSQL 和官方 TeX 记录见[后端](backend.md)。原版 1270 项和初轮 1288 项的七失败数字仅为历史，已不代表当前状态。公开文档与合格图片已提交，原始日志/本机路径/第三方 PDF 与 TeX 留在本地；用户已授权通过 fork 提交正常 PR，不合并或发布 release。已创建正常 [PR #336](https://github.com/Johanson-colab/Archimedes/pull/336)：open、非draft、未merge，head `f6b5ee3`，分支clean；GitHub当前状态/check-run均为空。任务Electron/provider已退出，临时profile及第三方验证资源已清理，Docker处于原先停止状态；本地.app与报告保留。见[PR核实](implementation-evidence/published-pr.json)、[清理记录](implementation-evidence/release-cleanup.json)。
