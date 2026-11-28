# Archimedes PR 复核

核对时间为 2026-11-18 10:52 UTC（北京时间 18:52）。本次覆盖 feiiiiii5 提交的全部开放 PR，以 GitHub 的目标分支、最新提交和审查讨论为准。上游有 11 项，其中 2 项是本次针对 issue 新开的 PR。Fork 有 7 项开放，重复的 #4 已按授权关闭。当前 18/18 项可无冲突合入各自目标分支。GitHub 累计记录了 114 条行内审查讨论，其中 0 条尚未解决。

上游主分支为 `06371399`。此前七项修复已经合入，涵盖工作区识别、Windows 终端路径、翻译排序、桌面运行环境、BibTeX 导入导出、文件草稿归属和未生成完整的模型回答。[已合入的贡献](https://github.com/Johanson-colab/Archimedes/pulls?q=is%3Apr+is%3Amerged+author%3Afeiiiiii5)

## 两个 issue 和对比图

北京时间 11 月 18 日 18:59，已在 GitHub 确认 #359 和 #360 均已从草稿转为正式评审。两个 PR 的提交与本次测试时相同，均无合并冲突和未解决的行内意见。先审 #359，再审依赖它的 #360。核心团队的书面设计批准仍待确认。

| Issue | PR 和实测 | 尚待确认 |
| --- | --- | --- |
| [#357，OpenCode Go](https://github.com/Johanson-colab/Archimedes/issues/357) | [#359，设置与聊天各阶段的对照截图](https://github.com/Johanson-colab/Archimedes/pull/359)。同一台 Electron、同一个本地测试服务重现缺少会话标头的 400 错误，修改后连接、重开配置和流式聊天成功。 | 核心团队设计批准、真实订阅环境的服务端验收。 |
| [#358，多模型配置](https://github.com/Johanson-colab/Archimedes/issues/358) | [#360，多模型设置、参数和输入栏对照截图](https://github.com/Johanson-colab/Archimedes/pull/360)。保存多个配置，分别分配 Agent 和 Proactive，显示正在使用的模型，向本地服务实际发送设置的输出上限。 | 依赖 #359。逐会话切换、其它工作任务的默认配置、显示名编辑、温度与能力设置仍在 issue 讨论范围。上下文配置落实为本地字符预算。 |

#359 的聊天截图中，同一句回复出现两次。在上游 `06371399` 和该 PR 的 Electron 应用上，用同一服务分别复验，两者都能重现。每次只发出一个流式聊天请求，数据库里也只有一条回答。聊天窗口偶尔同时显示流式文字与已保存的文字。该显示问题仍存在。

## 当前开放的贡献

“通过”列记录各分支在 macOS 的全套测试通过数。每次另有 6 项条件跳过。类型检查、主题检查和生产构建也已分别核对。GitHub 当前未报告托管 CI 结果。不同分支包含不同改动，测试数不能横向相加。

逐个请求 PR 正文中的图片链接，16 个 PR 共 101 张不同的 PNG 可正常访问。#353 和 #355 用实际文件、命令结果和应用归档展示变化。

### 上游

| PR | 当前提交 | 解决的问题和验证 | 通过 |
| --- | --- | --- | ---: |
| [#341](https://github.com/Johanson-colab/Archimedes/pull/341) | `1a8eef13` | 在旧资料库编辑笔记时切换目录，旧版可能把笔记写进新库。用两份真实数据库验证，修复后保存归属正确，打开失败仍可继续原草稿。两个窗口重开改过名的资料库，同一会话只发一次模型请求。 | 1,329（代码 `8db112b`） |
| [#342](https://github.com/Johanson-colab/Archimedes/pull/342) | `217ff91b` | 返回论文或会议发现页时保留查询、筛选和目标文献集。过期结果会重新查询。创建文献集后即使刷新列表失败，仍保留刚创建的文献集。 | 1,335 |
| [#347](https://github.com/Johanson-colab/Archimedes/pull/347) | `a8749fe0` | 编译期间将源稿中的 12 改为 18，旧版仍把 12 的 PDF 显示为成功，新版撤下过期预览。用 Tectonic 编译两次也能保留两份 PDF 和日志。如果编译期间新增并移除了临时输入，仍可预览，但不会把它标为已核实。 | 1,338 |
| [#348](https://github.com/Johanson-colab/Archimedes/pull/348) | `898bc91a` | 已有稿件可就地继续写。两个项目共用同一稿件时，旧版会用较早的读取覆盖协作者新加的一行。用桌面应用按两种顺序返回读取结果后，最新的文字和用户后续输入都正确保存到磁盘。 | 1,345（代码 `1f5ef35`） |
| [#351](https://github.com/Johanson-colab/Archimedes/pull/351) | `2e6e5187` | 从首页、命令菜单或图稿工具进入尚未启用的研究应用时会先启用再导航。配置失败后原页面保留，错误在可见区域内并可关闭。 | 1,323（代码 `f6a48c4c`） |
| [#352](https://github.com/Johanson-colab/Archimedes/pull/352) | `f7302929` | 扫描项目变更时先检查文件与字节预算，避免为超限文件读入全部内容。验证了大型目录、无关缓存和同名用户文件的处理。 | 1,323 |
| [#353](https://github.com/Johanson-colab/Archimedes/pull/353) | `47df144a` | 复现任务读取文件失败时保留既有实验输出与结论。只有文件缺失才尝试其它候选文件。SSH 写入沿用原有文件权限约定。 | 1,321 |
| [#355](https://github.com/Johanson-colab/Archimedes/pull/355) | `8c2ab211` | 打包排除约 301 MB 未使用的原生 ONNX 依赖。对 macOS arm64 的实际应用归档复验，离线加载了 28,352,885 字节的 WASM 和运行模块。数值为依赖体积，未测压缩安装包差值。 | 1,318 |
| [#356](https://github.com/Johanson-colab/Archimedes/pull/356) | `6ce44633` | 复制同一份 SQLite 数据，在新进程中重开。旧版把已有答案的会话留在运行中，新版恢复完成状态，Journey 出现已保存的回答。取消退出后仍可继续使用应用。 | 1,322 |
| [#359](https://github.com/Johanson-colab/Archimedes/pull/359) | `1bca6363` | 配置 OpenCode Go 的会话标头并保存、重开后，本地 HTTP 服务从返回 400 变为连接测试通过，聊天正常收到流式回答。使用虚拟凭据，无生产订阅实测。 | 1,323 |
| [#360](https://github.com/Johanson-colab/Archimedes/pull/360) | `c93c6c96` | Electron 中实测新增第三个模型、分别分配 Agent 和 Proactive、删除后重启、按所选模型完成聊天。会话内切换及其它任务的独立选择仍待产品决定。 | 1,329 |

### Fork

| PR | 当前提交 | 解决的问题和验证 | 通过 |
| --- | --- | --- | ---: |
| [#1](https://github.com/feiiiiii5/Archimedes/pull/1) | `9673d759` | 项目或会话切换失败时提示可见，原对话仍可用。首次回答完成后，两条排队的问题依序送出，尚未发送的草稿、文字选区及后来添加的附件仍保留。切到文献库再回来能找回草稿，明确选择“新会话”则会清空对应的输入框。 | 1,343 |
| [#2](https://github.com/feiiiiii5/Archimedes/pull/2) | `4e11c332` | 从项目插入引用时保留 BibTeX 注释、期刊或会议字段和来自外部编辑器的改动，检查稿件所有已声明文献库的引用键。协作编辑期间仍可更新文献库，插入引用需先退出协作编辑，以免共享正文被本地写入覆盖。 | 1,349 |
| [#3](https://github.com/feiiiiii5/Archimedes/pull/3) | `9263578b` | 切换聊天时，文本、附件和便签留在原会话。在便签自动保存前用约 0.1 秒切到另一个项目再返回，实测最新文字仍在，两个项目各自的内容均正确。 | 1,353 |
| [#5](https://github.com/feiiiiii5/Archimedes/pull/5) | `52dacf79` | 按所审稿件和版本继续处理具体反馈。审稿记录、私密修改草稿和用于接续讨论的缓存按可见范围区分。 | 1,397 |
| [#6](https://github.com/feiiiiii5/Archimedes/pull/6) | `129006c6` | 把当前稿件转为幻灯片任务前检查真实工具环境，缺少依赖时给出可读提示，可在修好环境后继续。 | 1,400 |
| [#7](https://github.com/feiiiiii5/Archimedes/pull/7) | `687805b9` | 同一份分析可完整保存并重开。首次保存时继续编辑不会产生重复结果。从数据页保存保留原图表尺寸。 | 1,370 |
| [#8](https://github.com/feiiiiii5/Archimedes/pull/8) | `f78cbe9c` | 可比较并恢复命名版本，包括主稿被删除、改名和文件与目录互换的情况。比较后稿件又发生改变时，用中文提示重新比较，保留期间新增的内容。整份稿件目录移走或项目默认目录更换后，仍可找到已保存的版本。实测还原原目录的文件，同时保留新目录的编辑内容。 | 1,400（代码 `9aedeb7`） |

## 分支与维护者事项

- Fork #4 的改动由上游 #356 承接。关闭后验证分支仍在，提交为 `afbb3c38`，原讨论可继续查阅。[关闭记录](https://github.com/feiiiiii5/Archimedes/pull/4#issuecomment-6973325497)
- 在幻灯片分支的 `9ef2c357` 与组合基础分支 `0390f7c6` 的合并结果上，另跑全套测试通过 1,396 项，6 项条件跳过。表格记录各 PR 最新提交的结果。
- fork #2 与更新后的写作基础分支 `a4c021c9` 的合并结果通过 1,351 项测试，6 项条件跳过。
- Fork #1 以 #341 为基础，#3 以 #1 为基础，#7 以 #3 为基础。#3 合并时保住了排队提问、未发送的草稿、附件和光标选区。#7 合并时分别保留了两项中文提示，以及数据分析和聊天草稿各自的存储键。引文、审稿、幻灯片和版本恢复 PR 使用相应的组合基础分支，仍需经过上游维护者评审。#360 的上游比较包含 #359，PR 正文另列仅含模型注册表改动的差异。
- 按用户决定，仅核查其他作者的 PR。[#308 研究图谱](https://github.com/Johanson-colab/Archimedes/pull/308) 的冲突位于 `electron/git-state.cjs`、`electron/git-state.test.cjs`、`electron/store.cjs`、`src/App.tsx` 和 `src/vite-env.d.ts`。作者分支在上游，当前账号只有读取权限。[#296 Windows 便携构建](https://github.com/Johanson-colab/Archimedes/pull/296) 可合入其 `windows` 目标分支，[#334 发布分支回合](https://github.com/Johanson-colab/Archimedes/pull/334) 可合入 `main`。本次未改动这三项。
- 运行证据主要来自 macOS。Windows 便携包和 Linux 安装包未在原生系统复验。上游合并、设计批准和发布仍由维护者决定。
