# 科研工作流完整性实施与验收清单

本清单承接[总报告](README.md)、[产品](product.md)、[前端](frontend.md)、[后端](backend.md)与[质量](quality.md)审阅中的可执行问题及明确后续路线。基线是 `main / 1f4b37581c446770d576440f9ebb9bca5c55bfb7`；当前分支为 `codex/research-workflow-integrity`，从同一 HEAD 创建；全部实现已本地提交，最终公开 head 为 `f6b5ee37721d9e908c401f9acc8a5765654c490f`。目标是完成科研任务连续性、写入归属与证据有效性，而非继续扩充工具数量。

“所有问题”覆盖下表全部事项，不能只完成第一阶段就默认为结束。静态风险先用针对性行为验证确认；性能/安装取舍允许以测量证据关闭为“不需改动”，不为完成列表制造抽象或假缺陷。受环境限制的发布/云端真机验证应单独列明，不能伪记为通过。平台化愿景在文末明确暂缓。

## 当前整合状态

37项及R01–03全部保留，下表初轮问题及各阶段细节作为实施记录。**本地最终验收完成：标准npm test 1445项，1441通过、0失败、4条件跳过；最后V02样式/文案的既有组件/i18n 7/7、lint通过；package:desktop含build通过，实际打包二进制的PTY、正常关键词fallback、数值报告重开，以及app.asar worker/ORT/WASM通过。** 相关四条正常原生旅程与数据落盘已完成，见[最终总报告](README.md)和[最终gate](implementation-evidence/release-final-gate.json)。原版1270/初轮1288及七失败均为历史。条件项集中列在总报告。

独立新增I01（X01×W02/X02）：恢复副本后再收藏同DOI会优先选原项目paper，形成两条及笔记分裂；真SQLite/FS已复现，质量代理已窄修，[独立探针](implementation-evidence/restored-paper-discovery.cjs)退出0；B不重复且notes/PDF/pages/selection、A原对象均保留，[修后记录](implementation-evidence/restored-paper-discovery-independent-after.log)。此项挂在原任务下，不以新平台愿景扩大范围。

正常 [PR #336](https://github.com/Johanson-colab/Archimedes/pull/336) 已创建并核实，head `f6b5ee3`，open/非draft/未merge、clean，当前无GitHub check。任务临时资源清理见[记录](implementation-evidence/release-cleanup.json)。

## 流程与完成标准

- 用户已授权完成本地实现、验证及正常PR。验收已通过，发布阶段经用户fork推送分支并开PR，不直接推main、不合并或发布release。
- 保留原断言及三组已有修复，不用跳过失败、削弱目标或堆源码匹配测试换绿色。复用 paper-chat 分域、审批/native 生命周期、Files/Writing owner 与实际组件/子进程检查。
- 每项达到“已验收”须链接改动与适当证据。UI 变动按仓库要求在 `docs/assets/<feature>/` 留同视口/主题/状态的前后图；非可视改动保留前后行为日志。具体受验代码版本与测试命令随证据记录。
- 最终执行 lint、标准npm test（含两个桌面布局与theme）以及package:desktop（含类型检查/build）。实际结果见当前整合状态；四个资源条件跳过保留。
- 状态：**待分工／实施中／待验证／已验收／待测量核实／条件验收待环境**。下表负责模块是代码边界；除已明确认领者外，具体作者由主协调者分配。跨 `App/main/store` 改动先约定接口和区段，避免覆盖并行工作。

## 已有修复：保留并回归

| ID | 当前已做到 | 验收证据与边界 | 状态 |
| --- | --- | --- | --- |
| R01 | pilot 按逐 step 执行/验收语义使旧判定失效；passed/failed 绑定有效实际命令输出；保留人工诊断及无关步骤；contract 保留 shell 内部空白/换行 | [后端 B4](backend.md)，相邻63项通过。R01自身不覆盖新run/输入环境；当前V01另补新run与可得输入收据，未声明依赖仍不推断 | 已验收，已本地提交 |
| R02 | Files 草稿/保存/冲突/错误按执行 root 分域，延迟读取/刷新/保存不覆写另一 root 或后续输入 | [原生记录](frontend-evidence/post-fix-native-validation.json)、[质量复核](quality.md)。A/B 同名文件、真实延迟 IPC 已通过；不代表 App 实体与全局 store 已统一 | 已验收，已本地提交 |
| R03 | Writing 文档缓存、离开自动保存、失败草稿和保存队列绑定原 owner；旧 openRequest 不重放；编译进度带可选 root/requestId，兼容旧调用 | 同一[原生记录](frontend-evidence/post-fix-native-validation.json)，六项真实组件/临时磁盘检查及独立失败重试通过。R03自身不含继续入口，当前W01已另补；未建跨进程未保存草稿库 | 已验收，已本地提交 |

## 第一阶段：身份、写入与运行的可靠性底线

优先顺序为 A01/A02 的身份契约、L/B/M 的执行边界，再做交接。Q01–Q03 可独立并行。表中的“实测”区分真实模块/临时 DB、原生 Electron 与 renderer 预览，详见链接，不宣称真实科学实验已完成。

| ID / 优先级 | 初轮问题与证据 | 目标行为与可验证验收 | 依赖 | 负责模块 / 当前状态 |
| --- | --- | --- | --- | --- |
| A01 · P1 | 全局 store 切库使在途 A 回答丢失，真实 agent＋SQLite 报 `Research turn not found`；[B1](backend.md) | canonical dataRoot 对应独立 store；运行/审批/artifact 捕获实例。A 等回答或审批→B 切数据目录→释放 A，全部结果只落 A，B 零污染，A 不因另一窗口关闭连接而失败 | 无；与 A02 先约定 context | `store/agent/main`；已实现；真实在途双store/审批/terminal归属及独立探针通过；相关联合原生及最终gate通过 |
| A02 · P1 | Library 只换 project，旧 thread 可继续决定执行目录；main 接受 project/workspace/thread/path 混搭，静态贯通后端；[对象边界](backend.md) | 主进程一次解析并校验 `{dataRoot, projectId, workspaceId, threadId, executionRoot}`，已有 thread 从持久化记录取 root；前端原子切换。Library 转 B、旧 thread A、显式错 path 等组合被纠正或拒绝；顶栏、会话、文件、命令实际目录一致 | A01 接口；不可只靠前端隐藏 | `App/main/store/agent`；前后端context、云导入与同ID双dataRoot探针通过；最终原生确认历史会话/成果根、延迟回复和磁盘输出归属，标准gate通过 |
| A03 · P1 | composer 文本已有正确分域先例，但待发送 contextItems/附件是全局选择，切 session 可能携带旧材料；[产品分域表](product.md)为静态发现 | 附件/所选证据与草稿一起归属明确 session/新任务；A 附件→B 不自动携带，回 A 可恢复；发送时捕获 owner，迟到回调不改 B | A02 | `App/ContextPicker`；完整dataRoot+session草稿/附件分域行为通过；最终原生A附件不进入B、B草稿保留、A迟到回复正确，标准gate通过 |
| A04 · P1 | Analysis “Continue in chat”无确认覆盖已有未发文本，已在 renderer 预览复现；其他来源交接目标依赖偶然当前 chat；[F3](frontend.md) | 补充证据默认追加；paper-chat 复用项目＋论文讨论；首次 CSV/稿件创建或复用关联 session；slides/评审/复现保持独立 run。动作显示目标且保留原文本/附件；逐项验证 notes/news/analysis/writing，无需一律弹窗 | A02/A03；与 W04 数据能力分开 | `App/来源页/会话映射`；Notes/News命名目标及追加由实际组件回调覆盖；分析历史root关联会话、Writing反馈修订与原草稿保留已联合原生通过 |
| A05 · P1 | 默认首页两动作静默返回 chat/无变化，已在 renderer 实测；palette/reader 还有绕过启用规则的静态入口；[F4](frontend.md) | 统一入口解析启用与依赖：可进入，或显示明确启用入口/原因。全新偏好及禁用 app 后，首页/侧栏/palette/来源页动作均有可见结果；不静默回退 | 可先独立；接 A02 目标语义 | `App/ResearchWelcome/registry`；统一导航/启用/配置动作已实现，阶段入口原生及标准测试通过；Slides缺配置的准备动作在最终正常原生通过 |
| L01 · P1 | prepare 期 Stop 返回成功后仍启动 pilot；模型期取消误报 failed/blocked，原注册块及真实 pilot 可复现；[B2](backend.md) | 唯一 controller 贯穿 clone/probe/prepare/model/exec；取消后不启下一阶段，最终 cancelled/stopped 一致且仅收尾一次。各阶段 deferred 场景逐一停止，检查后端调用与持久化状态 | A01 运行 owner 契约 | `main/reproduction/pilot/backends`；已本地实装，controller从prepare前贯穿，取消/cleanup幂等；144项阶段全过，V01接入后相关32项全过；真实SSH+默认Python Docker Stop通过，[证据](backend.md#本地实施复现生命周期文件边界与日志l01--l02--b01--perf02) |
| L02 · P1 | before-quit 未完整等待本应用 reproduction 资源收尾，静态缺口；已有 repro recovery 可复用 | 正常退出有界且幂等 dispose；异常重开只识别本应用拥有资源并标 interrupted，不碰无关 Docker/SSH 任务。受控 backend 验证 quit/重开；真实 Docker 不可用时明确剩余环境验收 | L01；与 L03 共享 owner 语义 | `main/docker/remote/store`；已本地实装，有界quit/精确owner恢复，API/native/terminal收尾；真实localhost SSH、默认Docker及Linux非TTY Bash进程组通过；缺bash/ps如实前置失败；真实复制DB修前误认领已复现，现scope+owner+run核对，unknown/外scope保留pending和可见原因，最后8/8通过 |
| L03 · P1 | 独立进程退出后 turn/task 仍 running、审批 pending，Stop 无活运行可停，阻断管理；[B5](backend.md) | 按存活 owner 原子收尾孤儿 task/turn/thread、过期未执行审批，保留部分输出。独立进程在回答/审批/命令期退出→重开可继续、归档/fork，不要求额外模型回合，不重放危险命令 | A01；L02 owner 约定 | `store/agent/native/UI状态`；已实现；真独立进程恢复、local中断而cloud-only running保留、混合thread汇总及独立探针通过；最终gate通过 |
| B01 · P1 | Docker 主机结构化读写沿 symlink 改 checkout 外文件，真实模块已证实；SSH 相似路径静态风险；[B3](backend.md) | 复用已有真实路径/逐级链接检查，区分 checkout 输出与显式只读数据 mount。目录/文件链接、新嵌套文件不得越界写入；外部文件前后 hash 不变；正常读写保留，SSH 目标路径边界对齐 | 无；与 A02 不同根因 | `reproduction/structured-paths/backends`；已本地实装修复，真实FS/localhost SSH及容器行为覆盖symlink拒写、正常嵌套/引号/stdin；结构化读显式2MiB上限，不将批准shell冒充沙箱 |
| M01 · P1 | Anthropic clean EOF 缺 terminal 仍返回完整结论，真实 adapter 可复现；OpenAI 同类静态缺口；[B6](backend.md) | 按 provider 协议记录合法终止；缺终止保存 partial/incomplete，残缺 tool 参数不执行。验证正常结束、length、错误、缺 stop、半帧与空流 fallback；不引入无限重试 | A01/L03 状态约定 | `agent/anthropic/model-completion`；已本地实装，185项相邻通过；真实agent partial/incomplete、半截tool零执行、App终态已接；C01同ID终态更新独立闭环，不无限重试 |
| V01 · P1 | 新一次运行可能复用旧 verdict；run 缺 project/commit/计划与输入版本记录，属于明确数据缺口；[后端后续](backend.md) | 新 run 从未执行不显示旧绿勾，同 run resume 明确；保存项目归属、checkout commit/dirty、计划版本、可得输入标识与输出引用。重开可回查；输入已记录变更时旧证据标 stale，未知环境不声称已追踪 | A01/L01；保留 R01 精准失效 | `run-snapshot/store/main`；真实manager/SQLite/Git/history行为通过，新run清旧判定、输入/准备/最终收据持久化、已知plan/paper变化stale；前端receipt/history组件及最终历史run显示通过，同run resume未新增 |
| Q01 · P1 | alias `/var` 与 Git canonical `/private/var` 被误判 suspicious，三项旧失败；[质量归因](quality.md) | 用真实目录身份比较，alias/physical 对空/有 commit repo 等价；真实 alias 建删 worktree；malformed `.git` 及 parent fallthrough 仍 suspicious，原断言保留 | 无；不改 store 本体 | `git-state.cjs`＋Git/workspace 相邻测试；已验收，产品代理 |
| Q02 · P1 | win32 模拟使用宿主 path.join，PowerShell 候选混入 `/`，三项原失败；仅证明宿主模拟，未证明 Windows 真机坏 | Windows 目标路径始终用 Windows 语义；PS7、Windows PS、显式 profile 原断言通过，补 LOCALAPPDATA/非 C: 路径正例；mac/Linux login-shell 行为保留 | 无 | `terminal-shell.cjs`＋原测试；已验收，产品代理（目标路径模拟，非 Windows 真机） |
| Q03 · P1 | `Bilingual reading` 排在 `Back to reading` 前，一项旧排序失败；唯一性与合并原通过 | 仅移动键位置，不改译文；全 shard 排序/唯一/合并原断言通过。同一原排序测试在 Library 修后继续暴露既有 sessionSnapshot 顺序问题，也仅重排；不是并行新增引起 | 无；其他 shard 由并行作者维护 | `translations/library.ts`、`translations/sessionSnapshot.ts`；已验收，产品代理 |

### Q01–Q03 本轮验收记录

原四文件加三条行为回归现为 **22/22 通过、零跳过**，命令与前后日志见 [implementation-evidence](implementation-evidence/README.md)。真实 Git 检查覆盖 explicit alias 与 physical 的 empty/ready/branch、损坏子 `.git` 的 parent fallthrough、实际 worktree 注册和删除；Windows 以目标路径模拟覆盖 PowerShell 7、Windows PowerShell、指定 profile、LOCALAPPDATA 与非 C: 盘，保留 POSIX 原断言。未验证 Windows 实机。

并行 A01 将 store 路径契约改为 canonical root；经后端作者确认，仅将既有迁移测试的路径期望从 `path.resolve(projectFolder)` 改为 `fs.realpathSync(projectFolder)`，保留“shared workspace 对应同一项目目录”的原断言。修前聚焦日志是在本轮并行修改期间捕获，包含这个契约变更，**不冒充此前 1,270 项原版全套基线**；那份原版七失败及日志仍保留于质量报告。最终标准全套1441通过、0失败、4条件跳过，结果见当前整合状态。

## 第二阶段：让既有研究成果能够继续与交接

下列是报告承诺的具体产品路线，不能因为不是 crash 而从“所有问题”中漏掉。以窄交接复用现有对象；可发现性修正与确实缺少持久化分别验收。

| ID / 优先级 | 初轮问题与证据 | 目标行为与可验证验收 | 依赖 | 负责模块 / 状态 |
| --- | --- | --- | --- | --- |
| W01 · P1 | Writing 已能通过聊天 `.tex` 链接继续，普通入口却为空项目/模板/导入，非缺底层打开能力；[产品稿件旅程](product.md) | 正门列当前/最近既有 LaTeX 项目与主文件，模板移入 New；复用 listLatexProjects，不重复拷贝。多文件稿件选择主文件→编辑→重启直接继续原稿；无引擎时仍可编辑并明确编译条件 | A02/R03 | `PaperWriting/latex-workspace/偏好`；实际组件＋阶段原生多文件稿件编辑/重启继续已过；官方TeX资源另已实跑；相关联合原生及最终gate通过 |
| W02 · P1 | 离开发现页查询/候选因卸载丢失，新建专题库需离页；正常新项目已有默认库且最后库受保护，原空库外推已纠正 | 按 dataRoot＋项目保留发现状态；正常项目默认库→检索→页内建第二专题库→收藏→读一篇→返回，query/候选/目标均保留；用 fixture 验证不调用模型 | A02 | `Daily/Library/App`；发现query/候选/target按dataRoot+project恢复、默认库下页内第二专题库已实装；组件及阶段原生返回/重启通过；I01已修并独立复选同论文通过；最终标准gate通过 |
| W03 · P2 | 入选理由/查询条件无快照；个人 paper notes/reading_status 故意跨项目共享，不能误修为 bug；真实 store 已确认 | 保存短名单 query/criteria/date/provider/degraded 标识及可编辑项目选文理由；同论文 A/B 用途独立，个人阅读状态共享保留。保存→重开→回源可解释；模型评分不冒充人工判断 | A01/W02 | `discovery/store/library`；原子paper/link/项目selection、独立reason及个人notes共享已实装；真SQLite/组件与阶段原生通过；I01恢复后selection/笔记/PDF独立复核通过；最终gate通过 |
| W04 · P1 | CSV 仅浏览器 File.text 与 name；聊天只收到统计、5 行样例/20 列，无原始文件路径；图/统计过程内存态 | 保存项目分析包：源文件复制或明确链接/指纹、绘图配置、统计与输出，接现有 Artifacts。区分摘要与显式附原数据，没原文件不能声称全量后续分析；重开还原图，源变更可见 | A02/A04 | `DataAnalysis/Artifacts/文件IPC`；完整CSV/配置/输出与关联session已落，真实agent读9MiB非样本末行通过；最终原生完整八行CSV重开、历史成果root关联会话、PNG插入原稿并回源通过 |
| W05 · P2 | FigureForge 生成链已接通，但参考图/计划/设计约束/结果尚缺项目化可回访过程；已有 signature 失效机制正确 | 保存当前项目图稿及非秘密模型配置/来源/输出；复用已缓存论文图，不重复上传；重开可编辑/导出，换 reference/input 后派生约束按现有规则失效 | A02；可复用 W04 成果边界 | `ImageCreation/figureforge/Artifacts`；真实组件及SQLite/FS覆盖引用bytes/设计约束/配置/输出保存重开、输入签名与inactive迟到保存；实际包正常Figure入口/关键词检索通过，生成transport使用本地模型stub |
| W06 · P1 | 评审/slides 已有独立 run，但未从当前编译稿携带源版本与返回关系 | 当前 PDF→评审/slides 带 project、源稿路径、PDF hash/version 与返回入口，独立 run 不覆盖聊天；编译失败/旧 PDF 明示，不默默评审旧稿。fixture 验证版本/归属传递 | W01/A02/V01 的版本约定 | `PaperWriting/review/slides/main`；整稿receipt/fresh/pin及owner接口通过；最终原生官方TeX→当前PDF→review与版本引用通过，slides当前PDF/缺配置动作通过；目标会话创建/输入拷贝由实际组件+SQLite/FS覆盖 |
| W07 · P2 | 模拟评审结论未成为正确稿件的修订任务 | 选定反馈→稿件关联 revision session 草稿，保留页码/quote/PDF 版本/源文件返回；已有草稿保留，无自动未审阅写稿。相同稿件重复交接复用关联会话 | W06/A04 | `review/PaperWriting/App`；选定finding→稿件revision session、页码/quote/源版本/返回关系及原草稿保留已实际组件和最终原生通过 |
| W08 · P2 | Data charts 是外部论文图表参考，Data analysis 是自己的 CSV；Image creation 还混合图库/生成，名称和同级入口使任务绕路 | 先清楚命名输入/结果，把参考图库作为生成/写作二级资源；四条旅程不再误入参考库寻找本地绘图。不先合并数据适配器或重写页面 | A05；与 W01/W04/W05 合并截图验收 | `导航/图库/文案`；具体名称、二级参考入口及默认Figure规划阶段原生通过；保留公开合格旧配对图，后续OS缩略图不作after，不再待补 |
| W09 · P2 | ResearchPath 把 mode 推断为前阶段 accepted，并随 thread 重置；没有真实验收依据 | 优先改为诚实工作模式导航，或只对持久化、可见证据标 accepted/stale；切模式不凭空得到科学完成度，旧结果适用范围清楚。无需科研进度评分系统 | A02/V01；先选最小语义 | `ResearchPath/App`；已实装诚实Work modes，阶段原生切换通过；不再推断accepted或科学完成度 |
| W10 · P2 | API paper-chat、native 深读、slides 的 MinerU/native、图像 endpoint、Docker/SSH、首次 TeX 依赖分散，容易把未配能力当坏入口 | 按任务披露已可用能力/缺少配置与下一步；无 key 的本地统计/文件/PDF 可用，Deep search 无模型降级继续。覆盖新 profile、无 key、缺 CLI、缺引擎与配置成功，不另建配置平台 | A05/K01/K02 | `Settings/任务入口/现有preflight`；各入口配置提示/可达动作已复用并通过组件和标准测试；最终原生Slides缺依赖准备动作、官方TeX实际编译通过；Docker/SSH另有真实本地服务验收 |

W02/W03/X02 本批实现、原观察纠偏与32项聚焦详见 [文献工作流交接](implementation-evidence/literature-workflow.md)。阶段原生已另见workflow-native-validation；早期交接文档的“待验”按当时阶段阅读。未以人工空库替代真实用户路径。

## 第三阶段：可核查结论、迁移与既有能力质量

| ID / 优先级 | 初轮问题与证据 | 目标行为与可验证验收 | 依赖 | 负责模块 / 状态 |
| --- | --- | --- | --- | --- |
| V02 · P2 | `checks-passed` 不等于论文数值复现，目前没有具体 claim 的数值比较闭环 | 从小格式 CSV/JSON 与用户确认的列映射开始，记录 expected/actual、单位、dataset、tolerance；分别显示缺失/不可比/范围内/范围外，保留文件证据与版本，不让模型自行认证科学复现 | V01/W04 | `reproduction/results/比较UI`；精确十进制CSV/JSON、用户映射/单位/dataset/绝对tol四状态与run/source收据通过；最终原生选CSV→映射→保存→重开通过，最终包数值报告/样式与7项组件/i18n通过 |
| X01 · P2 | 缺可恢复的本地项目包；报告明确后续迁移路线 | 导出带 manifest/count/hash 的项目记录与用户选定 PDF/批注/报告/artifact/对话，排除凭据/缓存；另目录恢复保留归属、引用与结果，不覆盖同名现有项目，校验损坏包 | A01/A02/V01；先确定最小可恢复范围 | `store/项目导入导出`；manifest/hash/新owner与内部引用恢复经SQLite/FS/组件通过，I01再收藏独立通过；最终原生17文件导出→另一dataRoot新项目/目录→旧稿/完整分析继续通过 |
| X02 · P2 | 文献管理器互通/元数据修复仍是明确后续路线，非本轮已实现能力 | 先做 BibTeX 小范围导入/导出、identifier/citekey、预览去重/修复；往返保留用户 PDF/notes，重复导入不覆盖编辑。无需接管 Zotero 或引入新云账户 | W03/X01 对象约定 | `library/metadata/import-export`；Bib预览/重复/差异/显式repair/稳定key已实装；阶段原生及3个独立边界修复通过；I01复选优先级已修并独立通过，最终gate通过 |
| C01 · P1（云开放前） | 原版已实测 existing turn 只首次插入、终态未上传与旧回灌；tag 隐藏云政策保留 | 同 ID 按 active/final revision 单调合并、终态与事件固定、失败可重试；thread 汇总按回合计算。双 SQLite＋实际 HTTP、本地 PostgreSQL 迁移/并发旧写通过 | A01/A02；不统一 main/tag | `thread-sync/server/store`；上下文代理实现＋后端接线：本地已验收，双真实账号/托管 Auth/Realtime 仍条件验收；[完整证据](implementation-evidence/cloud-sync-review.md) |
| C02 · P1（云开放前） | 原版已实测 library 删除重连复活，paper 关系无墓碑 | 服务端删除版本/墓碑、本地持久 journal、显式重加 CAS，其他库保留 canonical paper；旧服务器警示、首次延迟上传删除与晚 ACK 保留新意图；真实 PostgreSQL RLS/迁移通过 | A01/C01 协议约定 | `library-sync/server/store`；上下文代理实现＋后端接线：本地已验收（31项聚焦），真实云账户仍条件验收；[完整证据](implementation-evidence/cloud-sync-review.md) |
| K01 · P2 | main/tag 有意分叉却同显 0.1.0；README 开发入口压过已有安装包，仍写图像生成未接通；[质量 Q3](quality.md) | 关于/诊断可取 commit/channel/platform/arch/能力开关；README 区分成品与源码、说明实际生成链/依赖。不同构建诊断可区分，不改变维护者分叉政策 | A05/W10 | `诊断/package构建元数据/README`；已实现构建身份，24项阶段聚焦＋真实About诊断通过；最终实际包体诊断通过 |
| K02 · P1 | README Node20+ 与 lock 的 Electron/rebuild>=22.12、jsdom 更窄范围及 node:sqlite 不符 | 选定实测兼容 Node/npm 组合，engines/安装前检查与文档一致；不支持版本安装前给清楚提示，支持组合锁定安装/检查成功。不声称未跑过的 Node20 已验证 | 无；遵守依赖变更范围 | `package/安装preflight/README`；已实现版本范围/锁文件根约束/有界安装前检查；实测Node26.13.0/npm11.20.0，其他声明版本不冒称已跑；最终标准gate通过 |
| K03 · P2 | require('electron') 自动下载发生在既有 timeout 外，首次全套长等，非实际测试性能；[质量首装](quality.md) | 显式桌面依赖预检/准备阶段有界、失败可解释；快速检查与桌面阶段可区分但完整 test 仍覆盖原断言。缺二进制 fixture 不得无限下载/挂起；已就绪时布局检查保留 | K02 | `scripts/package/桌面测试入口`；零下载桌面预检/显式有界准备及标准全套桌面集合已实装并经中期checkpoint；最终标准npm test通过 |
| K04 · P2（发布时） | 目前只验证源码/本地 Electron，没有验证选定 tag 安装包；已有三平台产物，不能重造 installer 当修复 | 下次选定产物绑定 commit/hash/platform/arch，用新 profile 无 key 进入本地工作、welcome 图片解码、terminal echo、小稿编译/离线复编；每支持平台记录实际结果。缺硬件/引擎明确条件，不用源码 build 追认旧安装包 | K01；PR 不等于发布授权 | `发布验收/证据`；下一选定release成品与支持平台条件验收；当前未发布mac arm64本地package及正常入口已实跑，不追认旧tag或Windows/mac Intel |
| PERF01 · P2 | 快照有保留上限，但读取/哈希早于预算判断；.venv 未忽略，每 command 前后同步扫描。只有静态上界，未测 UI/RSS | 先用受控大目录计量读取/字节/耗时，预算在昂贵读取前生效，合理跳过生成环境且截断可见；保留真正文件变更摘要。无证据不先加 worker/队列 | A01；与现有 snapshot 契约兼容 | `workspace-files/agent`；已本地实装，受控真实39MB读取降7.2MB，2行为通过且普通diff保留；预算前置、Python环境忽略/metadata降级覆盖可见；非UI/RSS普遍性能结论 |
| PERF02 · P2 | Docker/SSH helper 即使提供 tail/stream 仍累积完整输出数组，未测真实训练内存 | 受控长输出量测；内存保留有界 tail，完整日志按需流式落盘并留引用；需要完整机器 JSON 的调用显式限制/错误，不能静默截断当完整。无真实训练或远端服务费用 | L01/V01 日志归属 | `process-runner/target-log/backends`；已本地实装，8MiB输出原8388608字符留存降64000，完整目标日志/引用保留；真实SSH及默认Python Docker验证，机器完整读拒静默截断 |
| K05 · P2 | transformers 硬依赖带约301MB多平台 onnxruntime-node，而实际语义检索在浏览器 WASM worker；关键词 fallback 已有 | 测量安装/构建实际使用，评估 browser-only/可选资源交付，给出保留或减重的证据；关键词 fallback 与用户触发语义检索不退化。不因一次慢网删除功能或另建插件平台 | K02；依赖变更独立审阅 | `figureforge/dependencies/packaging`；实际mac arm64包已排除未用Node ONNX native；原worker/ORT及28,352,885B WASM实际ASAR加载通过、零HTTP(S)，正常关键词fallback通过；source依赖安装保留原样 |
| V03 · P2 | R03 已修进度 owner，但底层并发编译去重/输入版本语义仍未验证；不能先称确定覆盖 bug | 用同 root/不同源版本及多 root 并发 fixture 验证返回 PDF/日志归属与缓存版本；如确有错配再局部修。若无问题以可复跑证据关闭，不新增泛化构建平台 | R03/W01 | `managed-latex/compile`；已实装整稿目录版本、独立稳定PDF/log/receipt、排队/运行stale、5个未引用preview保留及真实run pin；受控行为、系统TeX和官方managed cold/offline已过，最终稿件联合原生通过；latexmk仍条件 |

## 四条整体验收与阶段出口

| 旅程 | 最小验收 | 覆盖任务 |
| --- | --- | --- |
| 发现→筛选→回访 | 正常项目默认库→搜候选→页内建第二专题库→保存理由→阅读→返回→重启恢复，保留降级来源；同论文跨项目用途独立 | A02/A05/W02/W03 |
| 论文＋代码→可核查复现 | 明确项目/checkout/输入→执行→修订步骤→重评/重跑→取消/重开，旧证据不证明新执行，结果可回查 | A01/A02/L01–03/B01/M01/R01/V01/V02 |
| CSV→图与解释→稿件 | 保存源与配置→重开同图→摘要/原文件边界清楚→不覆盖既有草稿→插入当前稿件并可回源 | A03/A04/W04/W05/W01 |
| 原稿→修稿→评审/展示→交接 | 正门打开既有多文件稿→保存/编译→当前版本 PDF 评审→选反馈回正确修订任务→导出恢复；跨项目与延迟返回无错归属 | R02/R03/A01/A02/W01/W06/W07/X01 |

第一阶段出口不能只看七个旧失败消失：在途 A/B 数据目录、准备/模型/审批取消、进程重开与链接越界必须有行为证据。后续阶段沿上述 ID 更新，不将未完成目标删去；统一 PR 检查已由质量代理执行并记录；各阶段聚焦数字不相加。

## 明确暂缓的愿景

暂缓通用自动科研编排/任意 Skills-MCP 任务平台、推断未知依赖 DAG 并级联清空实验、完整 provenance/长期语义记忆平台、任意论文全自动数值解析、团队实时协作平台扩张、新一批新闻/图库模块、完整 notebook/Python/R 环境、全局状态框架重写，以及从零建设安装器/自动发布基础设施。这里的暂缓**不包括**上表 C01/C02 已有云同步完整性、V01 最小快照或 V02 小格式数值比较；也不否定已有功能。范围改变需明确记录理由，不能默默以愿景分类漏掉已承诺问题。

本批阶段原生证据：[完整JSON](../2026-11-16-system-review/frontend-evidence/workflow-native-validation.json)；before/after均为2200×1898、charcoal/English/100%。Daily页内建库已按审阅反馈改为Save to旁展开，Writing Refresh改为标题小操作，最后after将与下一组联合验收一并重采。
