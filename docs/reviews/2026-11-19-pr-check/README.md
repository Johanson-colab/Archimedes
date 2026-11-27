# Archimedes PR 复核 · 2026-11-19

核查于 2026-11-19 18:15 PST。GitHub 显示本人上游 22 个和 fork 7 个开放 PR 均可无冲突合入各自目标分支，29 个均已正式送审。仍开放的三条讨论分别是 #359 和 #360 的书面批准，以及 #369 的旧客户端同步。上游基准为 `ae8c18d`。以下编号默认指向 Johanson-colab/Archimedes。可视变化的对照图放在各 PR 正文和对应分支的 `docs/assets/`，测试使用临时本地数据。

## 两个模型配置 issue

| Issue 和 PR | 用户现在能完成的操作 | 验证和剩余事项 |
| --- | --- | --- |
| [#357](https://github.com/Johanson-colab/Archimedes/issues/357) → [#359](https://github.com/Johanson-colab/Archimedes/pull/359) | 在提供商列表选 OpenCode Go。已有自定义连接可继续使用保存的凭据、模型能力和会话标头。 | 本地服务接收真实桌面请求并检查了标头。另用模拟流式报错确认自定义凭据不会进入失败消息。真实付费订阅未验。 |
| [#358](https://github.com/Johanson-colab/Archimedes/issues/358) → [#360](https://github.com/Johanson-colab/Archimedes/pull/360) | 高级多模型配置默认关闭，可指定不同任务使用的模型，并在输入区看到当前模型。 | 用本地服务核对了实际发送的工具定义、工具结果和输出上限。PR 包含独立于 #359 的比较链接。两项设计均待核心团队复审。 |

## 工作区、导航和启动恢复

- [#341](https://github.com/Johanson-colab/Archimedes/pull/341) 保护用户在替换数据库前打开的窗口。每个窗口都要重新打开数据目录才能写入。复制出来的聊天也不能同时操作同一个原生会话。
- [#351](https://github.com/Johanson-colab/Archimedes/pull/351) 修复应用入口和旧名称的命令面板匹配。[#352](https://github.com/Johanson-colab/Archimedes/pull/352) 在读文件之前执行快照预算。[#356](https://github.com/Johanson-colab/Archimedes/pull/356) 恢复中断任务并在退出时停止仍活跃的工作。三项均已跟进最新主分支。
- [Fork #1](https://github.com/feiiiiii5/Archimedes/pull/1) 和 [Fork #3](https://github.com/feiiiiii5/Archimedes/pull/3) 已按依赖顺序更新并验证会话恢复、草稿和任务归属。重复的 [Fork #4](https://github.com/feiiiiii5/Archimedes/pull/4) 已关闭，保留分支和讨论。维护者的 [#308](https://github.com/Johanson-colab/Archimedes/pull/308) 已由上游合并。

- [#375](https://github.com/Johanson-colab/Archimedes/pull/375) 修复保存回答后迟到的流式文字导致同一条回答重复显示的问题。真实桌面窗口发送两次，正文相同的两轮回答仍独立保留。

## 文献库和 BibTeX

原来的 [#346](https://github.com/Johanson-colab/Archimedes/pull/346) 已合并。每个独立问题有自己的 PR，后续审查修在同一个 PR 上。

| PR | 可观察的结果 |
| --- | --- |
| [#366](https://github.com/Johanson-colab/Archimedes/pull/366) | 云端条目初次匹配未关联云端的本机论文时保留阅读状态、标签和笔记。两个已有独立云端 ID 的同 DOI 条目分别同步，避免笔记和批注串写。 |
| [#367](https://github.com/Johanson-colab/Archimedes/pull/367) | 导入、保留或显式替换引文键时，桌面与浏览器预览采用相同的冲突规则。操作失败时保留原关联。 |
| [#368](https://github.com/Johanson-colab/Archimedes/pull/368) | 再次导入后清除旧导出预览，避免下载过时的文件。 |
| [#369](https://github.com/Johanson-colab/Archimedes/pull/369) | 同名但作者或年份不同的论文能分别保存和重新识别。新版客户端上传前会核对可见项目内的旧引用标识。旧客户端或两个设备同时首次上传仍可能产生云端重复记录，该项讨论保留。 |
| [#370](https://github.com/Johanson-colab/Archimedes/pull/370) | TeX 重音、文本中的波浪号和尖号可正确导入导出。保留网址中的字面字符，旧标题可显式修复。 |
| [#371](https://github.com/Johanson-colab/Archimedes/pull/371) | 引号里的括号不会吞掉 BibTeX 指令之后的文献。 |
| [#372](https://github.com/Johanson-colab/Archimedes/pull/372) | 一批导入中，有不同 DOI 的论文不会被未采用的同名条目遮住。共享 DOI 的行可提供后续匹配的 arXiv 标识。若保留行的 DOI 与 arXiv 信息相互矛盾，预览会指出冲突，独立条目仍可导入。 |
| [#373](https://github.com/Johanson-colab/Archimedes/pull/373) | 中文导入预览用中文说明解析问题，并保留条目和出错字段的上下文。 |
| [#374](https://github.com/Johanson-colab/Archimedes/pull/374) | 导入前提示卷期、页码或机构作者分组在重新导出时可能丢失。此项提供可见提示，尚未扩展存储格式。 |

[#365](https://github.com/Johanson-colab/Archimedes/pull/365) 单独修复上游设置页面的删除图标。未依赖该 PR 的分支会报告同一个图标检查失败。

## 合并验证

在本地分支 `codex/library-review-integration-20261119`（`6661b7c9`）合并 #365 至 #374，整合了 BibTeX 解析、预览和云同步过程中改到的相同代码，以及各自新增的回归用例。桌面准备、类型检查、构建和主题检查均通过。完整测试 1,451 项通过、0 项失败、6 项按环境跳过。这个分支只保存在本机，没有额外开 PR。各 PR 在上游仍分别评审。

## 工作目录

用户删除了 `Archimedes-pr-splits`。Git 仍记录这 45 个目录的分支或提交，逐个检查时暂存区均为空。未暂存的修改和从未跟踪的文件无法由此核实。保留了主工作区原有编辑。
