# 前端与交互审阅

初轮各节记录历史审阅和局部阶段；当前状态以总 README / IMPLEMENTATION 为准，后续实施节单独列出。

审阅日期：2026-11-16。源代码基线：`main`，`1f4b37581c446770d576440f9ebb9bca5c55bfb7`。本文区分原版问题、本轮限定修复和未修事项。本轮授权后已修改 Files 的局部状态与回调，并完成原生验收；Writing 的独立修复也已联验。后端及 Writing 修改详见 backend.md。

## 判断

优先解决研究任务的归属和编辑内容的保留。当前已经在真实浏览器中确认：从数据分析继续聊天会直接替换已有未发送草稿；首页两个可见的大入口会落回原页。隔离 Electron 的实际磁盘核验进一步确认：Files 和 Paper Writing 的编辑状态与实际工作目录没有共同的身份边界，切换项目后均发生了跨目录覆盖；其中 Writing 在没有显式点击保存的情况下写入了另一项目。

本轮已经完成 Files 与 Writing 这两个具体覆盖路径的局部修复及真实文件复验；F3/F4、已有稿件正门、全局 store 与 App 实体混搭仍未修。

不建议先围绕“大组件拆分”展开改造。即使把 App 拆成更多文件，只要相对路径、项目、Session 和执行目录仍各自变化，下面的问题仍然存在。

## 验证范围与环境

- macOS arm64，Node `26.13.0`，npm `11.20.0`，16 GiB 内存。
- 锁文件版本：React `19.2.8`、TypeScript `7.0.2`、Vite `8.2.2`、Electron `43.4.1`。
- `npm ci --no-audit --no-fund` 退出 `0`，安装 640 个包，约 24 分钟；根 `postinstall` 的 `electron-rebuild -f -w node-pty` 成功。`package.json` 和 `package-lock.json` 没有修改。
- npm 11 提示五个依赖的安装脚本没有被 `allowScripts` 覆盖。本轮没有擅自修改全局许可或批准全部脚本。npm ci / 依赖安装完成后，Electron 的 `require()` 仍触发二进制下载；因此安装命令成功不能替代桌面窗口验收。
- 已完成：`node node_modules/typescript/bin/tsc -b --pretty false` 退出 `0`；`node node_modules/vite/bin/vite.js build` 退出 `0`；`node scripts/check-theme-tokens.mjs` 退出 `0`。
- Files、Workbench、项目工作目录和 Research Apps 的 34 项现有聚焦测试全部通过。全套测试使用与 `npm test` 相同的四组文件模式、并发数 `4`：262 个测试文件、1270 项测试，1256 通过、7 失败、7 跳过，退出 `1`。耗时约 18 分钟，主要包含 Electron 的首次二进制下载；不能据此推断正常测试运行需要 18 分钟。失败为 Git 状态/Workspace 3 项、翻译键排序 1 项、Windows shell 3 项，根因由质量审阅单独核实，未预先归为已知或忽略。
- 已做浏览器验收：Chrome 打开构建后的 `http://127.0.0.1:4273/`，使用原有 `previewBridge`。通过 CUA 操作可见控件、读取可访问性树并截图，没有修改页面内部状态、提交模型请求或登录账号。这证明相同 renderer 的交互行为，不证明 Electron IPC 或真实文件写入。
- 原生验收隔离：临时 userData 和两个项目均位于 `/tmp/archimedes-ui-review.lPAjgP`。两个项目有不同内容的同名 `README.md` 和 `paper/main.tex`，通过现有 store API 建立本地身份、项目和 Session。没有使用用户的实际研究文件或配置。

浏览器步骤与结果：[browser-observations.json](frontend-evidence/browser-observations.json)。

以下 F1–F4 的因果链接固定在原版提交，避免本地修复后的行号变化混淆原版证据。修复代码的当前本地位置列在“本轮限定修复与最终验收”。

## F1：Files 草稿仅按相对路径区分，切换项目可能串用编辑内容

**状态：原版真实 Electron 与磁盘均已复现；本轮 Files 局部修复已通过同场景及延迟保存原生验收。原版严重性：P1。**

触发场景：A 项目打开 `README.md` 并留下未保存编辑，切到目录不同的 B 项目或 Session，再打开 B 的 `README.md`。用户应看到 B 文件；返回 A 时，A 的未保存稿也应仍然存在。

因果链：

- 实际执行目录优先来自当前 Session，然后依次回退到 Workspace、Project、主工作区：[`src/App.tsx:1569`](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/App.tsx#L1569)。
- 目录变化时，仅清除打开文件和选中项，没有分域或清理草稿：[`src/App.tsx:2247`](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/App.tsx#L2247)。
- 草稿以 `file.path` 为键；同路径已有 dirty 草稿时，`ensureFileDraft` 直接保留旧稿：[`src/App.tsx:2374`](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/App.tsx#L2374)。`FileDraft` 自身也没有所属根目录：[`src/file-editor.ts:3`](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/file-editor.ts#L3)。
- 保存却使用当前 `executionWorkspace`：[`src/App.tsx:3080`](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/App.tsx#L3080)。渲染编辑器直接读取 `drafts[file.path]`：[`src/App.tsx:5506`](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/App.tsx#L5506)。

实测：A 的 `README.md` 留下 `UNSAVED_A_CROSS_PROJECT_MARKER` 未保存稿；切 B 后，界面标题、Session 和执行目录都已是 B，但其 README 编辑器显示 A 稿。此时磁盘 B 仍为原文；点击 Save 后，B 文件实际被替换为 A 稿，磁盘 A 仍为原文。详见 [原版前后内容与 SHA256](frontend-evidence/files-cross-project-observation.json) 和 [B 页面展示 A 稿的截图](frontend-evidence/files-project-b-shows-a-draft.png)。因此这确实是“A 草稿 + B 保存目标”，而不是仅仅丢失一个标签页。切换主数据工作区的 discard 确认不能覆盖这个场景，因为项目/Session 切换不经过同一个 `loadWorkspace` 流程。

建议目标：给文件编辑会话明确的根目录身份，至少按“规范化执行根目录 + 相对路径”区分草稿、打开文件、保存状态和错误。保存请求捕获草稿所属目录；请求完成后只更新该目录的编辑状态。切换目录不应清空全部草稿来掩盖问题。

有价值的验收：两个不同根目录均有 `README.md`；A 编辑未保存后切 B，B 仍显示原文；保存 B 只改 B；回 A 能恢复原草稿。再让 A 保存请求延迟到切 B 后才完成，确认不会改写 B 的编辑状态。这是行为与磁盘内容检查，不是对实现结构的字符串断言。

## F2：Paper Writing 持续挂载，却没有随执行目录切换保存编辑身份

**状态：原版跨目录自动写入已真实复现，本轮对应 Writing 修复已通过原生联验；已有稿件正门缺口仍未修。原版覆盖严重性：P1。**

Writing 由 registry 设置 `keepMounted`：[`src/sidebar-registry.tsx:65`](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/sidebar-registry.tsx#L65)。父组件更新其 `workspace` 属性，页面内的 `file`、`draft`、`mainPath`、当前论文项目等状态没有直接按根目录分域：[`src/App.tsx:3389`](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/App.tsx#L3389)。

自动保存依赖 `workspace`，写入时组合当前目录与已有 `file.path/draft`：[src/PaperWritingView.tsx:312](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/PaperWritingView.tsx#L312)。另有一条更直接的切换路径：`openRequest` effect 依赖 `activateProject`；后者随 `workspace` 改变而改变，effect 会重跑并重新打开同一相对路径：[src/PaperWritingView.tsx:292](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/PaperWritingView.tsx#L292)。然而 `openFile` 在打开新文件前，会使用新目录先保存旧 `fileRef/draft`：[src/PaperWritingView.tsx:206](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/PaperWritingView.tsx#L206)。所以“完全没有工作目录重载”不是准确描述，真正的问题是重载与保存没有绑定同一个文档身份。

实测：通过已有聊天文件链接打开 B 的 `paper/main.tex`，关闭 Auto compile，修改源码为 `PENDING_B_LATEX_CROSS_ROOT_MARKER` 后立即点击 A 的 Workspace；没有点击保存或编译。磁盘 A 的 `paper/main.tex` 被改为 B 稿，B 的文件仍是原文。返回 Writing 后，A 标题下的编辑器也显示 B 标记。见 [入口、步骤及磁盘内容记录](frontend-evidence/writing-observations.json)。这说明只修 Files 不能宣称消除了整个工作台的跨目录写入风险；本轮因此对 Writing 的对应路径也独立修复并联验。

已有稿件入口也作了实际对照：B 目录已有 `paper/main.tex`，直接打开 Writing 仍只显示模板、新建和导入；关闭模板选择后是 No project selected，没有直接继续稿件列表。普通 Files 文件树点击 `.tex` 仅打开通用代码预览。**但已有聊天里的工作区 `.tex` 链接可以通过现有路由正确激活 Writing。** 因而问题是高频继续编辑入口缺失与发现成本，不是“产品完全打不开已有稿件”。[入口截图](frontend-evidence/writing-existing-folder-entry.png)。

建议目标与验收：按执行目录保留各自论文编辑状态；目录改变后不把旧文档视为新目录下的文档。以 A/B 同名 LaTeX 项目验证自动保存只触达所属文件；重新打开应用后，当前目录的已有稿件能被发现并继续编辑，无需重新导入或误建同名项目。

## F3：数据分析的“继续聊天”直接覆盖已有未发送草稿

**状态：真实浏览器已复现；没有发送给模型。**

步骤：聊天中填写 `UNSENT_RESEARCH_PLAN_A` 标记的研究问题并确认可见；进入 Data analysis，使用自带 Penguins 示例，在分析问题中填写 `ANALYSIS_HANDOFF_B`；点击 Continue in chat。

结果：返回聊天后，输入框仅保留新分析问题、统计摘要和样本。原研究问题的标记消失，没有确认框，也没有供选择的追加/新建目标。见 [界面截图](frontend-evidence/analysis-handoff-preview.jpg)。

实现对应明确：Data analysis 的回调固定使用 `replace`：[`src/App.tsx:3381`](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/App.tsx#L3381)；聊天收到 request 后执行替换：[`src/App.tsx:4144`](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/App.tsx#L4144)，随后写入该聊天的持久草稿。问题不是按钮没反应，而是跨模块导入把用户先前的编辑内容消掉了。

需要保留已有的透明边界：分析页明确说明“统计信息与 5 行样本，完整数据文件未附加”，生成的提示也重复说明样本不能代表已查看全量数据。这一点值得保留；本次缺陷是草稿保留与目标任务归属，不应改写为产品隐瞒数据访问范围。

建议目标：按照操作意图，把分析问题送入关联的分析任务，或明确追加到用户当前任务，并保留原草稿内容；目标 Session、项目和数据集关联应清楚可见。不要把每次弹出三选一确认框当作主要解决方案。另应按 Session 保存待发送附件，避免全局 `contextItems` 从另一个聊天带入。

有价值的验收：已有文本和附件时导入分析问题，旧内容可恢复、附件归属正确；选择新任务时，不修改原任务草稿。还需对既有 Session 做一次原生对照，本次浏览器实例是新建的预览聊天。

## F4：首页可见的工作流入口与模块启用规则不一致

**状态：真实浏览器、默认设置已复现。**

首页始终展示 Reproduce a paper 和 Generate figures。点击前者后返回同一个 Choose your path；点击后者后可访问性树不变，没有解释或引导。见 [稳定态截图](frontend-evidence/welcome-dead-entry-preview.jpg)。

这不是后端模型未配置造成的：默认配置把两个模块设为禁用；欢迎页仍直接设置对应主页面，随后 hidden-module effect 把页面切回 chat，view host 也不挂载目标模块：[`shared/research-apps.json`](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/shared/research-apps.json)、[`src/App.tsx:2016`](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/App.tsx#L2016)、[`src/App.tsx:3191`](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/App.tsx#L3191)、[`src/App.tsx:3585`](https://github.com/Johanson-colab/Archimedes/blob/1f4b37581c446770d576440f9ebb9bca5c55bfb7/src/App.tsx#L3585)。

建议目标：所有入口经过同一项导航规则。目标未启用时，要么通过明确的启用引导继续，要么清楚标明当前不可用；不能展示可点击入口后静默回原页。不要另外复制一套首页专用模块列表。

有价值的验收：默认新配置逐个点击首页入口，均进入对应能力或得到解释；用户禁用某模块后，首页、命令面板和正文入口仍遵守相同规则。无需调用模型来检查这条导航行为。

## 已有基础与不建议的投入

现有文件编辑 helper 已能保留 dirty buffer、识别外部变动冲突、保持保存后继续输入；34 项聚焦检查也通过。共享 Dialog 有焦点限制、Escape 关闭和返回焦点逻辑，StateView 区分 loading/error 的可访问性语义。这些都不是需要从零补建的系统；仍需在真实跨任务操作中检查它们的作用范围，不能把通用组件存在当作所有页面已经验收。

建议先完成 F1/F2 的身份边界、F3 的内容保留、F4 的导航一致性，再决定组件拆分。不要先引入全局状态库、通用任务框架，或为了增加测试数而镜像当前实现。

## 安装与包体观察

本机首装确实花了约 24 分钟；其中 `onnxruntime-node@1.30.0` 单包官方元数据解压体积为 `301,068,136` 字节，包内包含多个平台的二进制。它来自 Transformers 硬依赖，而实际图像语义检索位于浏览器 worker、使用 WASM。前端构建本身约 2 秒成功，生成 `dist` 约 64 MiB，包含两个约 27/28 MiB 的 WASM 文件。应把这记录为开发安装与发布包体的具体成本，评估平台资源裁剪和实际使用路径，再决定是否改变依赖。它不等同于最终 DMG 用户也要执行本轮 npm 首装。

## 本轮限定修复与最终验收

Files 保留现有工作台和文件 helper，按执行根目录保存 drafts、saving、conflicts、errors；切换只更换可见 scope，不丢 A 的未保存稿。保存开始时捕获所属 root，完成时只更新原 scope；可见 pane 的写回另受 root 与目录代际限制。Reload 还比较发起读取时的 draft 对象，避免同 root 后续输入或 A→B→A 的旧读取覆盖新稿。beforeUnload 对全部 scope 聚合未保存稿。

当前实现：[scope 状态](/Users/fei/Desktop/Archimedes/src/App.tsx:1490)、[目录代际](/Users/fei/Desktop/Archimedes/src/App.tsx:1567)、[保存所属目录](/Users/fei/Desktop/Archimedes/src/App.tsx:3125)、[Reload 编辑版本](/Users/fei/Desktop/Archimedes/src/App.tsx:3153)、[保存完成保持后续输入](/Users/fei/Desktop/Archimedes/src/file-editor.ts:41)。没有引入全局状态库，没有重写项目/store 架构。

原生复验均使用实际 Electron main/preload/renderer 与真实临时文件：

- **同名文件分离**：A 留下未保存稿后切 B，B 编辑器显示原文；B 保存自己的修改，A 磁盘仍为原文；返回 A 并重新打开文件，原未保存稿仍在，之后可单独保存。见 [修后 B 编辑器](frontend-evidence/files-project-b-after-fix.png)。
- **延迟保存**：临时包装器只暂停带指定标记的一次 A write-file IPC，释放后仍调用原处理器落盘。等待期间切 B 并继续输入；A 返回后，B 新稿仍在、显示 Unsaved 且 Save 可用，B 磁盘未被修改。随后保存 B，各自文件保持各自内容。没有用 mock 写盘结果代替实际文件。
- **Writing 联验**：B 论文编辑后立即切 A，A 磁盘保持原文，B 在切回前已自动保存标记；A 不重放旧 B 打开请求；返回 B Writing 看到自己的标记与 Saved。Auto compile 全程关闭，没有真实 TeX 编译或模型调用。

完整步骤、阶段磁盘内容、SHA256、被验收代码哈希及环境边界：[post-fix-native-validation.json](frontend-evidence/post-fix-native-validation.json)。

新增 Files scope 行为测试及原文件编辑/Workbench/目录链接聚焦共 **28/28 通过**。质量审阅另提取实际 App Reload 回调验证旧读取竞争，保留了 [修前失败](quality-evidence/files-reload-race-first.log)、[修后结果](quality-evidence/files-reload-race-fixed.log) 与 [可重跑探针](quality-evidence/files-reload-race.mjs)。这些局部探针不被冒充为完整 Electron 测试；上面的原生验收补足实际接线与磁盘行为。

统一最终检查：`npm run lint`、`npm run build`、theme 检查分别退出 `0`；[命令与退出码](quality-evidence/verified-checks.json)。全套 **264 文件 / 1288 测试，1274 通过、7 失败、7 跳过，约 20.4 秒**。剩余七项与原版完全同名，没有新增失败：[完整日志](quality-evidence/final-tests-applied.log)、[逐项归因](quality-evidence/failure-causes.json)。它们分别为 Git 在 `/var` 与 `/private/var` 别名比较的 3 项、翻译键排序 1 项、Windows shell 测试在 macOS 上路径拼接与 mock 不一致的 3 项；没有删除或放宽这些断言。

## 交付与边界

本轮前端代码仅修 Files 的具体文件编辑归属与相关异步返回；Writing 由另一代理独立修复后统一验收。分析 handoff、首页入口、Writing 继续既有稿件的正门，以及更广的项目/Session/store 生命周期仍按产品和后端报告列为未修，不把这次通过扩大为整个科研闭环已可靠。

未创建 PR、push 或远端 fork。已经关闭本轮 Electron 窗口和浏览器预览标签，停止本轮预览服务，清理仅本轮创建的临时 userData、测试文件、包装器与临时日志。正常的本地依赖和忽略的构建产物保留。未使用真实账号、凭据、用户研究文件或付费模型。


## 后续实施：任务归属主干（2026-11-16）

本节记录审阅之后的本地修改，覆盖前文原版问题的一部分；尚未做本阶段原生验收，不代表整套工作台已修完。

- 项目、workspace、thread、执行目录合为一个TaskSelection。Library项目选择与会话打开均先取得完整返回再提交；失败保留当前任务，过期打开结果不生效。历史会话保留历史执行目录；云导入缺少本地字段时，前端从所属项目默认workspace解析，无法解析则报错，不落到主数据目录。[身份解析](/Users/fei/Desktop/Archimedes/src/task-selection.ts:13)、[打开会话](/Users/fei/Desktop/Archimedes/src/App.tsx:2655)。
- 已有及新建会话的输入身份均含canonical dataRoot。同一个云thread导入两个数据目录后，文本、附件、handoff、错误、排队输入不再共键。原无scope文本首次打开时迁入该scope并移除旧键；历史格式没有记录owner，无法事后判定它原来属于哪一个数据目录。笔记前端缓存同样分域，后端仍以threadId存储，兼容既有笔记。[输入身份](/Users/fei/Desktop/Archimedes/src/task-selection.ts:30)、[笔记接线](/Users/fei/Desktop/Archimedes/src/App.tsx:1606)。
- run携带clientRunId并捕获owner，晚到事件/失败只反馈原任务；新run审批仍可回答，返回完整thread后才改变选择。new-draft中的后续输入、未发送附件与排队消息迁入返回session；发送失败恢复原句及期间的新输入。[发送](/Users/fei/Desktop/Archimedes/src/App.tsx:2951)、[迁移](/Users/fei/Desktop/Archimedes/src/App.tsx:1998)。
- Analysis按project/workspace执行根保存当前会话内状态，输入另有稳定ID；Continue创建/复用其关联session并追加问题，保留原聊天草稿。换项目或换数据不复用错误任务；创建失败与迟到返回不劫持当前任务。仍明确仅传统计与五行样本，原CSV附件和持久成果留下一阶段。[交接](/Users/fei/Desktop/Archimedes/src/App.tsx:2022)、[组件状态](/Users/fei/Desktop/Archimedes/src/DataAnalysisView.tsx:24)。
- Home与palette采用统一Research App打开入口，先启用再导航，失败显示可重试反馈，不再被隐藏模块effect静默弹回聊天。[入口](/Users/fei/Desktop/Archimedes/src/App.tsx:2142)。

验证：10份聚焦测试文件58项全过，涵盖实际App回调、真实DataAnalysis组件、原Files/输入性能/导航契约/翻译检查；[日志](frontend-evidence/phase1-targeted-tests.log)。独立审阅发现的同云thread双目录、NULL导入context两个问题，使用原真实SQLite探针修后均通过，[结果](frontend-evidence/phase1-context-identity-after.log)。当前类型检查因并行工具链接口尚未接完而暂未重新出最终结论；最终build/全套/原生多窗口仍需在版本冻结后统一执行。


## 实施阶段：继续稿件、导航与文献闭环

本批原生验收已通过：[完整观察记录](frontend-evidence/workflow-native-validation.json)。Writing 从真实已有稿件列表打开 `paper/main.tex`，编辑 section、保存并重启后恢复同一 section 与主文档；全程关闭自动编译，未调用 TeX。Work modes 只设置下一条消息的模式，不再显示 accepted/完成计数。图稿入口默认进入 FigureForge 规划界面，侧栏英文标签能在原宽度显示。General 的实际 Build diagnostics 返回本地版本、commit、channel、branch 和 dirty 状态。

文献按正常默认文献库开始，在 Daily 中新建第二专题库后搜索词、候选与目标库保留；填写项目选择理由、Save、打开 reader、返回 Daily，再同 profile 重启，搜索词、目标库、理由与已保存状态均保留。BibTeX 未选择 repair 的重复导入保留原标题、个人内容和 citekey，导出可见原值。只有 discovery feed 使用无网络 fixture，其余 IPC/SQLite 均为实际实现；没有真实账户或模型调用。

[界面对照目录](../../assets/research-workflow-integrity/) 中 before 来自先前保留的原 renderer，after 来自本批 build。全部 JPG 已重新核为 2200×1898 像素、同 charcoal/English/100% 字号，窗口逻辑尺寸 1100×949。临时隔离 profile 保留给下一阶段，所有本轮 Electron 进程已结束。

窄审计还确认三项正常数据边界：非 arXiv 的 HAL eprint 被错误当成 arXiv；导出后的 literal braces/backslash 无法准确回读；另一个项目的相同 citekey 会阻止当前专题库导入。新增实际 parse/export 与双项目 SQLite+dialog 回归在修前为 6 pass / 3 fail，修后 9/9 通过（[修前](frontend-evidence/bibliography-edge-before.log)、[修后](frontend-evidence/bibliography-edge-after.log)）。现在只识别合法 arXiv 输入并与后端同规则归一，保留转义字符，citekey 冲突限定于目标导出集合；全局已有论文仍用于去重。未扩为完整 TeX 宏解释器。


## 当前实施收口：成果、交接与正常工作流

本节是后续实施阶段，前文初轮问题及旧测试数字保留为历史。当前源码已经接通项目成果保存/顺序重开、完整 CSV 显式附件、关联分析会话、稿件版本到评审/slides 的来源回执与修订会话、复现归属/历史、项目迁移入口。当前整体状态由总 README/IMPLEMENTATION 汇总。

最新前端聚焦 **91/91 通过**、lint 退出 0、diff check 退出 0。另正常 PNG 插入、明确添加 graphicx、Compile 保存主稿的实际组件/磁盘回归 **13/13 通过**。受验文件哈希与日志：[frontend-final-implementation.json](frontend-evidence/frontend-final-implementation.json)。这些是实际组件、App 回调、SQLite 和文件行为验证；真实桌面及真实 TeX 编译的最终四旅程仍待后续原生记录。

- 保存于历史执行目录且尚无会话的分析，在项目默认目录变化后，通过登记成果创建合法关联会话；真实读取工具仍读取原 CSV 的非样本末行。原聊天未发送文本保留。
- 图稿生成捕获实际输入。改计划后晚返回的旧图仍可预览下载，但不作为当前输入输出保存；临时离开 A 到 B，A 的合法生成结果会保留。导入新 PDF 开始独立成果身份。保存一次捕获相同版本的论文页、要求、模型非秘密字段、参考和输出。
- 分析保留 SVG，并在‘用于稿件’时本地导出 PNG；图像已有 PNG/JPEG 直接复用。真实登记文件复制到所选稿件，旁置窄来源回执，renderer 仅在编辑草稿光标插入。复制中继续打字不会丢失文字；可显式在当前光标插入。主稿未加载 graphicx 时有明确添加动作，保留正文。
- Notes/News 显示目标对话，普通动作追加内容；只有明确命名的 Use as prompt 替换。旧回调不会抢占后来选中的任务。
- Slides 结合既有 CLI 检查与现成脚本依赖检测，缺项提供设置或配置草稿动作。该检查不声称服务认证、网络、字体和真实输出已验证，也不安装工具、不启动模型。

没有提交、push、远端 fork 或 PR。最终打包/语义 worker 和全套标准 gate 由统一协调另行记录。


## 最终正常四旅程原生交付

[精简结果与受验指纹](frontend-evidence/final-native-workflows.json)记录真实 Electron、IPC、临时 SQLite/磁盘和本机假模型服务的完整链。标准全套及发布包验收另由质量代理接手，不将聚焦通过冒称最终 PR gate。

1. 旧执行目录的分析成果重开，关联会话及完整 CSV 路径仍属旧根；原聊天草稿保留。本地真实 PNG 插入已有多文件稿，明确加载 graphicx 后由官方 Tectonic 实际编译，后两次成功耗时 554/472 ms，正文与图表均在生成 PDF 中。回源可重开原 8 行分析。
2. 变更 section 后需要当前稿重编；已编版本进入真实独立评审 run，来源/PDF hash 持久化。选定反馈生成关联修订草稿，保留页码、quote、版本和历史根。Slides 接收同版 PDF，实际缺项显示可操作配置草稿；不上传 MinerU，不冒称生成 PPTX。
3. 真实两个数据目录复制同一 thread ID：A 等待写入审批时 B 的草稿/附件隔离。A 批准后切 B 并释放本机服务延迟响应，回复、turn 和文件只写 A；B 草稿不变，DB 仍只有原始一轮。
4. 原生导出 17 文件，data-b 恢复成新项目/新 ID/新目录。原历史会话能续写旧稿并重开分析，续写只落恢复目录。数值 CSV 完成选择、映射、确认、保存和离开后重开：0.9 对 0.9、绝对容差 0，一项 within tolerance；不将其称为科学复现认证。

实际选择器归属问题已由质量作者修复并原生复验。最终 Writing/Daily 紧凑操作已从 UI 观察；补图为系统 Stage Manager 缩略图，未发布为 after。此前合格配对截图保留；V02 的 3120×1960 全幅图仅作独立证据，不冒充原配对视口。所有本轮 Electron/本机假服务已结束，任务临时资源交给最终 gate 复用。


最终截图暴露的数值比较样式已窄修：次级按钮复用现有主题控件，标题/表单字号与 Reproduce 卡片一致；三处重复免责声明改为操作说明及证据详情内一次真实来源说明。比较逻辑、状态和 IPC 未变。上列原生业务结果保留原受验边界；本次三文件新指纹另记 `post_native_ui_patch`，由质量代理执行已有组件/i18n、lint 和实际包内界面核对，不重复四旅程。
