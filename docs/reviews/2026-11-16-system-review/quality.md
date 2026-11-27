# 测试与发布质量审阅

> 时间边界：第1–5节是初轮历史审阅；1274/1288、七失败等统计不是当前状态。用户随后授权按完整实施矩阵继续解决问题；当前完成度与统一验收以本轮 [README.md](README.md) / [IMPLEMENTATION.md](IMPLEMENTATION.md) 为准。本视角后续工具链、编译和迁移/数值核查实施见第6–8节，不能把旧检查点当作当前未修清单。

基线：`main / 1f4b37581c446770d576440f9ebb9bca5c55bfb7`；检查日期：2026-11-16；环境：macOS arm64、Node 26.13.0。本视角只读产品源码，独立运行少量聚焦测试和隔离回归探针；没有安装依赖、启动 Electron、调用付费模型、操作真实研究资料或修改产品代码。作者其后已将 pilot/contract、Files 和 Paper Writing 局部修复应用主工作区，本报告分别记录原版全套与修改后的聚焦结果；真实 Electron 验收由前端统一控制。

**判断：现有测试包含应保留的真实行为验证，主要缺口是对象身份跨越异步、窗口和进程后的完整性。再增加每个函数的测试数量，无法替代这几条用户旅程。** 另外，源码开发版与公开 v0.1.0 有意采用不同功能范围，验证结论必须绑定具体 commit/构建，不能只写“0.1.0 测试通过”。

## 1. 现有检查实际证明什么

| 检查层次 | 仓库中的实例 | 有价值的证据与适用边界 |
| --- | --- | --- |
| 真实持久化、真实子进程与协议 | `electron/reproduction-run-store.test.cjs:12`、`electron/agent/command-runner.test.cjs:17`、`electron/codex-agent-integration.test.cjs:10`、`electron/external-agent-integration.test.cjs:10` | SQLite 写回、真实命令的退出码/日志/超时/取消、真实协议子进程与 native 分派确有执行。native 子进程是测试 fixture，验证集成协议，不代表官方 CLI 的每个版本或真实模型服务都已验证。 |
| 有交互的组件行为 | `electron/library-workspace.test.cjs:8`、`:83`、`:93` | JSDOM 中挂载实际组件、点击、切换 reader，能捕获局部状态回归；bridge、部分子组件和加载方式被替代，无法证明完整 App 的项目/store 身份或 Chromium 排版。 |
| 源码/配置契约 | `electron/ui-audit-auth.test.cjs:21`、`:34`；`electron/app-packaging.test.cjs:48` | 适合约束 IPC 名称、主题规则、必要配置和约定入口，代价低。匹配 `safeStorage.encryptString`、UI 标签或 ASAR 配置不能单独证明加密恢复、入口可达性或打包程序能启动。保留这类检查，但按契约称呼，不称完整 UI 验收。 |
| 真实 Chromium 的局部布局 | `electron/chat-layout-width.test.cjs:6`；`electron/pdf-root-layout.test.cjs:12` | 前者用真实 Electron 对四组宽度/主题测量；后者默认跳过，需显式启用。两者都是隔离 HTML/CSS 场景，不是完整应用安装/导入/编辑旅程。 |
| 需要额外条件的真实集成 | `server/supabase-server.live.test.cjs:12`、`:29`；`server/presence.live.test.cjs:11`、`:34`；`electron/managed-latex-engine.live.test.cjs:11`；`electron/pdf-equations.test.cjs:97` | 两用户云端、真实 TeX bundle、指定真实 PDF 等依赖环境/fixture，默认跳过有合理原因；跳过不等于这些能力通过。本轮未提供账户或真实远端服务。 |

`package.json:24` 把 Node、server、局部 Electron 布局和主题检查放在同一入口；`lint` 仅是 TypeScript 检查，`build` 是类型检查加 renderer 构建（`:14`、`:19`），都不验证桌面主进程/安装包。打包命令也只先执行 build，不自动执行全套 tests（`:16–18`）。

在基线 Git tree 内未见 `.github/`，该 commit 的 GitHub combined-status 查询为空；这只能说明**仓库内未见工作流、该提交没有此次接口可见的 check 结果**，不能断言维护者没有外部 CI 或手工发布验证。仓库已有带测量和平台限制的实证记录，应保留这种写法，例如 `docs/assets/welcome-packaging/README.md:5` 和 `docs/assets/pdf-layout-stability/README.md:21` 明确 arm64 主机检查不能证明 Intel 硬件启动。

## 2. 三个高价值交叉核实

### Q1 · P1 · 单对象测试通过，不能覆盖数据归属和任务生命周期

我先对**未修改原版**独立执行以下既有测试，33/33 通过、零跳过：

```sh
node --test electron/reproduction-pilot.test.cjs electron/reproduction-recovery.test.cjs electron/window-agent-run.test.cjs electron/agent/command-runner.test.cjs
```

随后阅读后端探针、确认其隔离/无费用边界，再独立运行两个脚本。其中真实 agent+SQLite 的跨数据目录/进程重开两项目标均失败；原始 main 复现注册块的准备期 Stop、真实 runPilot 的计划修订两项目标也均失败。

```sh
node --test docs/reviews/2026-11-16-system-review/backend-evidence/store-lifecycle.cjs
node --test --test-name-pattern='Stop during provisioning|changing an executed runbook' docs/reviews/2026-11-16-system-review/backend-evidence/reproduction-lifecycle.cjs
```

| 原版场景 | 独立观察 | 为什么既有测试没有拦住 |
| --- | --- | --- |
| A 的模型请求等待时，B 打开另一数据目录，再释放 A 的回答 | `Research turn not found.`；A 的 thread/turn 仍 running、回答为空 | 既有用例通常在一个临时 workspace 中完成整个任务；`store.openWorkspace` 会关闭全局旧连接（`electron/store.cjs:895`），没有模拟异步运行期间另一窗口切库。 |
| 创建 running turn/pending approval 的进程退出，再由另一进程重开 | thread/turn 仍 running、approval 仍 pending；Stop 返回 false，归档要求先停止 | `reproduction-recovery.test.cjs:12` 真实验证了 Reproduce 恢复；恢复实现也只处理 reproductions（`store.cjs:877`）。这项正确机制值得扩展，而不是视为所有任务已恢复。`window-agent-run.test.cjs:4` 验证活进程窗口关闭取消，并不等价于崩溃后恢复。 |
| 复现 prepare 尚未完成时 Stop，随后释放 prepare | Stop 返回 true，pilot 仍启动且 signal 未 aborted | command runner 的取消已覆盖真实执行，复现准备是另一条生命周期；其 controller 初值为 null（`main.cjs:1540`），进入 executeRun 才创建，Stop 只可选调用 abort（`:1615`）。 |

这些是**新增行为目标在原版失败**，与上游既有测试通过并不矛盾。探针使用 fake transport/backend；跨库和恢复执行真实持久化/独立子进程，准备期 Stop 执行原始完整局部 IPC 注册块，并未冒充完整 Electron/Docker E2E。详情见 [独立 store 日志](quality-evidence/store-lifecycle-original.log) 和 [独立复现日志](quality-evidence/reproduction-original.log)；复现脚本由后端报告提供，见其 `backend-evidence/`。

### Q2 · P1 · 证据失效需要正反例，已有测试甚至固定了过宽的复用规则

原 `reproduction-pilot.test.cjs:131` 明确测试“保留 id 就保留 verdict”。初始 install command 为空，修订后填入 `make install`，仍要求保留 passed。因此这不只是缺少测试：测试预期本身没有区分重命名与执行定义改变。

独立探针仅执行 `old-check`，随后把同 id 命令修订为 `new-check`；原版返回内部 `verified`，最终是 `new-check / passed / Old configuration passed`。根因在原版 `electron/reproduction/pilot.cjs:263`：按 id 无条件复制 verdict/evidence；done 只查剩余步骤状态。这里证明的是步骤证据错归属，不把内部状态名称等同于“论文数值已复现”。

**局部修复已应用主工作区，尚未提交/PR。** 我先在隔离候选独立运行 pilot 29/29 通过，随后只读复核实际主工作区四文件差异，并对应用后的完整受影响集合再次独立复跑：**63/63 通过，零跳过，diff-check 通过**。改命令/执行条件清判定，仅改标题/出处或调整顺序保留；改验收阈值需要重新作出判断，但可显式重评既有输出。原测试把初始命令补为 `make install`，保留所有原断言，使其真正成为“同语义改标题”的正例。这比清空全部结果或强制重跑昂贵实验更符合用户需要。

contract 的 `step.command`、`check.command`、`entrypoint.command` 也改用保留内部空白/换行的规范化，保留原长度边界，普通 prose 仍使用原规则；pilot 复用统一规范化。新增“normalize→JSON→normalize”的回读用例检查三处命令逐字一致及 passed 状态。这个增量必要，否则先前修好的命令会在持久化回读时再次被改写。原 stale-verdict 探针在应用后亦通过：新命令未执行时保持 pending，清空旧 evidence，不再返回 verified。

当前可在主仓库直接复跑，无需已清理的临时 worktree：

```sh
node --test electron/reproduction-pilot.test.cjs electron/reproduction-contract.test.cjs electron/reproduction-preflight.test.cjs electron/reproduction-planner.test.cjs
node --test --test-name-pattern='changing an executed runbook' docs/reviews/2026-11-16-system-review/backend-evidence/reproduction-lifecycle.cjs
git diff --check
```

[原版既有正例日志](quality-evidence/existing-focused-original.log)、[应用后独立63项日志](quality-evidence/pilot-contract-applied.log)、[应用后旧证据探针](quality-evidence/revised-command-applied.log)。这些证据只支持局部修订语义，不支持跨步骤依赖、数据/环境版本变化或完整实验 lineage 已解决；跨库/进程恢复、准备期 Stop 和 symlink 写入等问题仍未修复。

### Q3 · P2 · 发布版与 main 有意分叉，当前版本字符串不足以说明审核范围

2026-11-16 通过 GitHub 只读接口核实：

- `v0.1.0` annotated tag 指向 `af3e8b4c201b25bb8c4415b23f14f0c752120c0a`；当前远端 main 与本地基线相同。compare 返回 `diverged`，main ahead 6 / behind 4。
- 分叉是明确选择。main 的 `ea32b04` 提交说明云入口隐藏只保留在 `release/0.1.0`；tag 的 `src/cloud-features.ts` 是 `false`，main 删除门禁、恢复账户/团队入口。`shared/research-apps.json` 则两者相同，Reproduce、FigureForge、Data charts、Paper to Slides 默认关闭。
- 公开 release 提供 Windows x64 与 macOS 两架构安装包、SHA-256，并披露未签名、首次 TeX 需要网络、无自动更新等限制。这是值得保留的能力披露，不应因为 main 有云入口就把所有云端问题直接归给已发布安装包。
- README 默认 clone main（`README.md:48`）；main 的 package version 仍为 `0.1.0`（`package.json:5`），界面 footer 仅显示这个 version（`src/App.tsx:3456`）。同样叫 0.1.0 的截图/报错可能来自不同功能集。tag 也不包含 main 后续 welcome 文件 URL 和 PDF root layout 修复；当前 main 通过不能追认旧安装包包含这些修复。

建议最低成本地在“关于/诊断信息”或发布清单记录 commit、开发/发布通道、平台架构与能力开关；README 把安装成品和开发源码路径说清。**不要求统一两个分支能力，也不要求先建自动发布平台。** 下一次发布时，对选定 tag 构建的实际产物做烟测并将结果绑定文件摘要即可。本轮没有下载/执行 release 成品，不判断三个现有二进制的实际启动情况。

官方来源：[发布页](https://github.com/Johanson-colab/Archimedes/releases/tag/v0.1.0)、[tag → main 比较](https://github.com/Johanson-colab/Archimedes/compare/v0.1.0...1f4b37581c446770d576440f9ebb9bca5c55bfb7)、[有意恢复开发主线能力的提交](https://github.com/Johanson-colab/Archimedes/commit/ea32b0422f8a67167b10523144bb21065ca454b4)。本轮只读 API 摘录见 [release-traceability.json](quality-evidence/release-traceability.json)。

## 3. 首装成本与平台检查应如何解释

**P2：先把 Node 入口条件写准确。** README 的代理指令只检查 Node20+（`:30`），手装也写 Node20 或更高（`:45`）；当前 lock 的 Electron 43.4.1 要求 `>=22.12.0`（`package-lock.json:4570`），rebuild 同样要求 >=22.12，jsdom 要求 22.13+ 或 24+ 等明确范围（`:6126`）；store 直接使用 `node:sqlite`（`electron/store.cjs:8`）。应选定与 lock 兼容并验证过的 Node/npm 组合，在安装前检查。本轮只实测 Node26，没有实际重测 Node20，不能将本轮下载慢归因于版本不满足。

统一安装者实际报告 `npm ci` 约24分钟退出0，root node-pty 重建成功、package/lock 未改；随后原版全套一度停在 `chat-layout-width.test.cjs:7` 的 `require('electron')` 自动补下载。20秒 timeout 只包住 execFileSync，不覆盖 require 解析阶段。**该下载现已完成，Electron43.4.1可用，chat-layout-width 本身通过；全套已经结束。** 下载等待属于测试前置依赖，不是断言失败；完整耗时约18分钟包含这段等待，不能用作测试执行性能或应用启动性能的结论。本视角没有重复安装或启动 Electron。

日常快速测试可避开显式桌面用例；单独在真实桌面阶段先验证 Electron 二进制可用，再跑两个几何回归和一次完整应用烟测。不是删除既有布局断言，也不需要另造一个测试框架。首次成本中的 ONNX 多平台 native 包来自 transformers 硬依赖，而功能是默认关闭的 FigureForge 浏览器语义搜索；其拆分价值由前后端报告评估，本视角不据一次慢下载建议移除功能。

### 原版全套结果与七个失败的独立归因

前端在补丁应用前按 `npm test` 相同四个文件集合、限制并发4运行，实际覆盖262个文件：**原版1270项 / 1256通过 / 7失败 / 7跳过，exit1**。所有局部修改及测试接线适配完成后，统一执行者对264个文件运行了同一文件集合：**最终1288项 / 1274通过 / 7失败 / 7跳过，exit1，约20.4秒**。本视角逐名核对日志，剩余失败与原版七项完全同名，未出现新增失败；没有再次独立运行全套。pilot、Files/Writing 的独立聚焦结果另见第2、5节。全套命令如下：

```sh
node --test --test-concurrency=4 electron/*.test.cjs electron/figure-forge-upstream-*.mjs electron/agent/*.test.cjs server/*.test.cjs
```

[原版全套日志](quality-evidence/baseline-tests-original.log)、[最终修改后全套日志](quality-evidence/final-tests-applied.log)。全套仍不通过，不能写成“全部检查通过”。统一执行者另行运行的 lint、build、theme 均退出0，本视角已核日志和[检查结果](quality-evidence/verified-checks.json)；build 的 bundle size 提示是 warning，不是检查失败。theme 不视为失败 Node 命令后自动执行的结果。

我在当前主工作区对这四个无关失败文件聚焦复跑：19项 / 12通过 / 同样7失败。仅把隔离 TMPDIR 切为其 physical realpath，两个 Git 文件变为9/9通过；没有修改源码或断言。另用真实 Git/store 直接比较同一目录两种路径，并观察 shell 的候选路径，得到下列因果：

| 失败用例（原准确名称/位置） | 原观察与独立归因 | 影响与仍未修范围 |
| --- | --- | --- |
| `git state distinguishes none, empty, and ready folders` — `electron/git-state.test.cjs:19` | 已 init 的空仓库 expected empty，actual suspicious。`git-state.cjs:33` 仅 path.resolve 输入，而 `:65` 与 Git canonical topLevel 作字符串比较；macOS `/var/...` 与 `/private/var/...` 指向同目录却不相等。 | 真实目录别名识别缺陷；不只是测试环境噪声。物理路径通过并不表示已修。 |
| `a linked worktree is reported as nested instead of a project root` — `electron/git-state.test.cjs:41` | linked worktree 的 nested 断言已通过，失败在 `:52` 对原仓库 expected ready，actual suspicious；与上一项同根因。 | 不应误报为 Git 无法创建/识别 linked worktree；是原仓库路径身份被误判。 |
| `git projects can open and remove a worktree workspace` — `electron/workspace-session-model.test.cjs:178` | 失败于 `:184` 项目 git_state 检查，尚未进入用例的 worktree 创建。另一个真实 store 探针确认：同一个已有 commit 的仓库，别名状态 suspicious、物理状态 ready，按别名创建 worktree 被误拒为“Create a commit ...”。 | 会阻断通过目录别名打开的真实项目之 worktree 操作。应保留检查 malformed `.git` 的目的，将目录身份比较做正确。 |
| `keys stay sorted inside each shard so concurrent additions do not collide` — `electron/i18n-translations.test.cjs:36` | `src/i18n/translations/library.ts:21` 的 Bilingual reading 位于 Back to reading 前，违背小写键字典序。相邻的翻译唯一性与 shard 合并测试通过。 | 源码排序约定失败，不证明翻译丢失或 UI 不能显示；仍应报告，未顺手重排文件。 |
| `Windows prefers PowerShell 7 when it is installed` — `electron/terminal-shell.test.cjs:5` | `terminal-shell.cjs:26` 在 macOS 用宿主 path.join 生成 `C:\\Program Files/PowerShell/7/pwsh.exe`；测试 exists 只接受反斜杠 Windows 路径，因此落入 cmd.exe。 | 跨平台模拟用宿主路径实现的缺口；该失败不能直接证明 Windows 实机找不到 PowerShell。未修，也未在 Windows 实机验证。 |
| `Windows falls back to Windows PowerShell before cmd` — `electron/terminal-shell.test.cjs:17` | 同一宿主路径分隔符问题发生于 `terminal-shell.cjs:27` 的 Windows PowerShell 候选，mock exists 不匹配，回退 cmd.exe。 | 同上；macOS/Linux 正常 shell 选择用例仍通过，不将这三项包装为 macOS 终端整体不可用。 |
| `explicit shell profiles do not fall through to a different shell` — `electron/terminal-shell.test.cjs:39` | 显式 powershell profile 仍使用上述不匹配候选，随后 `:34` 走既有 fallback，actual cmd.exe。 | 同上；本轮只证明模拟路径和 fallback 的因果，不扩大为真实 Windows profile 失败结论。 |

复核脚本可直接运行并自行清理临时 Git/SQLite 资料：

```sh
node docs/reviews/2026-11-16-system-review/quality-evidence/recheck-failures.cjs
```

[别名路径19项日志](quality-evidence/seven-failures-alias.log)、[物理路径Git9项日志](quality-evidence/git-physical.log)、[目录身份与shell候选实测](quality-evidence/failure-causes.json)。三类失败分别是真实路径身份行为、源码维护约定和宿主上的Windows模拟，不能统称“已知平台失败”后忽略。

七项跳过也逐项可解释：Kimi desktop converter fixture未给定；本机无 latexmk；真实 TeX bundle未给定；MemT PDF未给定；PDF root真实Electron回归需显式启用；Supabase双用户API与Realtime各一项未提供账户/启用开关。它们没有成为通过项。发布前仍需在支持的原生平台完成关键烟测；本轮没有用降低断言或跳过失败项的方式取得绿色结果。

## 4. 下一轮只保留五条高收益旅程验收

| 顺序/旅程 | 最小场景与合格标准 | 为什么值得做 |
| --- | --- | --- |
| 1 · 身份与异步写回 | A 运行/等审批；B 打开另一数据目录并执行无关操作；释放 A。回答、事件、审批、artifact 只落 A；B 不增记录。再对同名文件的项目切换保留/丢弃草稿作一次 UI 检查。 | 一次测试跨过全局 store、窗口、run 与文件归属，直接发现本轮最高影响失败。fake provider 足够，无需模型账户。 |
| 2 · 修订后的证据 | 旧命令成功→同 id 改命令→done 应拒绝；新命令执行后才通过。标题/排序改写应保留；阈值改变允许显式重评旧数值。写入再读回后 shell 命令的有意义空白应保持。 | 同时保护可靠性和昂贵实验成本；比只断言 status 字段或清空所有结果更强。 |
| 3 · 取消与重开 | 分别在 prepare、模型等待、等待审批时 Stop；后续不再启动新执行。用独立进程退出后重开，孤儿运行/审批明确收尾，部分输出可查看，用户无需额外模型回合就能继续/归档。 | 活进程 abort 与恢复数据库是两个环节，必须连起来验；不承诺自动恢复或重放危险命令。 |
| 4 · 继续已有稿件 | 在真实工作目录打开已有多文件稿件、选择主文件、编辑/保存/编译，切换项目和重启后再继续；不重复导入拷贝，不写错目录，编译失败明确。 | 既有 `latex-workspace.test.cjs:117` 验证的是导入和主文件选择，无法证明 UI 能顺畅继续真实稿件。先用小 fixture，真实编译只在具备指定引擎的阶段运行。 |
| 5 · 选定发布成品首次运行 | 在隔离新 profile 打开该 tag 的实际平台安装包；无 key 能进入本地工作、默认功能/云入口符合该构建，welcome 图片有解码尺寸，终端能 echo，首个小稿件编译/离线重编译得到明确结果；记录 commit、hash、平台和跳过理由。 | 合并验证 renderer、preload、main、资源和 native ABI；源码 build 或 ASAR 文件存在无法替代。每个平台一条烟测即可，不要求每项功能全排列。 |

前四条可拆成少量真实模块/子进程目标加一轮人工桌面验收；第五条按发布时运行。保持已有命令防重放、审批拒绝/中断、窗口关闭取消、输出引用、真实布局和主题检查。优先填完整旅程的空白，而不是重复测同一 guard、替换所有正则检查、建设通用任务平台或给每个函数新增测试。

## 5. Files / Paper Writing 局部修复的独立复核

两条原版覆盖路径已经由前端在真实 Electron 和隔离磁盘证实：Files 的 A 未保存稿经 B 的 Save 写进 B；Writing 的 B 编辑在切到 A 时无需点击 Save 就写进 A。本视角随后只读审阅作者完整差异，没有自行修改产品或测试，也未启动第二个 Electron。

**Files：按执行目录分域 draft/saving/conflict/error，保存捕获 owner，迟到完成先更新原 scope 的保存基线，再决定能否更新可见 pane。** 切换不会靠删除 A 稿来保护 B。新增四项测试验证实际 helper 的跨根同名稿、延迟保存、保存期间后续输入和隐藏 scope 的 dirty 检查；它们没有挂载 App/CodeMirror，不能独自证明实际 Save 接线正确。原 UI 契约只是将旧全局 draft 引用改为全 scope dirty 聚合，原 confirm、提示和保护要求均保留，并未删除失败断言。

独立审阅还发现第一版 reload 只比 root，无法处理 A 的慢读→切B→回A继续输入→旧读返回。执行 App 原 reload 回调配合 deferred bridge，确实把新输入改回 Original A。作者随后增加执行目录代际和请求时 draft 身份检查。相同回调探针在修后验证：同 root 继续输入、A→B→A 继续输入均保留新稿；读取/refresh/目录/关闭确认等可见返回受 owner+代际约束。保存完成仍能更新隐藏原 scope，未用丢弃所有异步结果来回避收尾。

**Writing：按 root 持有编辑会话，按文档记录 draft/保存基线和顺序队列；离开 root 或源文件时将捕获的最新稿保存到原文档。** 旧 openRequest 消费后不会因 workspace callback 改变而重放。编译返回归 owner scope，进度用 workspace/requestId/path 关联；main 发出、preload 转发、类型和组件接收已逐段核对，旧两参数 compile 调用保持兼容。

新增六项 Writing 测试**实际挂载组件并写入独立临时磁盘**，涵盖离开自动保存、同名稿分域、保存中继续输入、同 root 切源文件、迟到读取/编译、写失败保稿及 IPC/旧调用正例。模板/图标/部分容器和 bridge 是 fixture，不是完整 Electron 或真实 TeX 编译。另以真实保存 helper+临时磁盘独立确认：一次写失败不会毒化队列；重试和后续输入按顺序保存到 A，B 保持原文，成功后错误清除。不是把禁止写入或隐藏未保存稿当作修复。

| 独立验证 | 结果 | 证据范围 |
| --- | --- | --- |
| Files 新旧 helper + 两份 Workbench 契约 | 36/36通过 | [聚焦日志](quality-evidence/files-focused-fixed.log)；helper 和源码契约，实际 App 接线另由下述原生验收补足 |
| App 实际 reload 局部回调 | 第一版丢稿；修后两场景均保留新输入 | [原失败](quality-evidence/files-reload-race-first.log)、[修后](quality-evidence/files-reload-race-fixed.log)；[可复跑探针](quality-evidence/files-reload-race.mjs)，不冒充 React/Electron E2E |
| Writing 组件、source search、LaTeX workspace、managed compiler | 33项 / 32通过 / 0失败 / 1跳过 | [独立日志](quality-evidence/writing-focused-first.log)；跳过是本机未安装 latexmk 的真实模板编译 |
| 保存失败→重试→最新排队输入 | 通过，其他 root 未改、最终 saved、错误清除 | [独立临时磁盘结果](quality-evidence/writing-save-retry.log)、[可复跑探针](quality-evidence/writing-save-retry.mjs) |
| 旧目录链接行为 harness 与 coedit 源码契约适配 | 独立4/4通过 | [日志](quality-evidence/final-harness-adaptations.log)；见下述证据边界 |

统一修改后首轮曾多出三项旧测试失败：目录链接 harness 未注入新增实际 scope 判断函数两项，coedit 源码契约仍硬编码已移除的 draftRef 一项。最终仅调整这两份测试的接线/定位：目录链接测试一起编译 **App 实际 `isCurrentFileWorkspace` 与 `openChangedFile`**，传入版本 refs，保留目录展开和迟到请求原断言，新增 A→B→A 旧 inspect 不落 UI；没有把判断 stub 为恒 true。coedit 仍检查 SharedNoteEditor 的 loaded 防护、initialText、docKey，回调定位改为当前 setDraft，并增加 loaded file 的挂载 guard。独立4/4后，最终全套只剩上述原版七失败。coedit 仍属于源码契约，不证明真实云端协作已验证。

主仓库复跑命令：

```sh
node --test electron/file-editor.test.cjs electron/file-editor-scope.test.cjs electron/ui-audit-workbench.test.cjs electron/ui-audit-workbench-files.test.cjs
node --test electron/paper-writing-workspace.test.cjs electron/paper-source-search.test.cjs electron/latex-workspace.test.cjs electron/managed-latex-engine.test.cjs
node docs/reviews/2026-11-16-system-review/quality-evidence/files-reload-race.mjs
node docs/reviews/2026-11-16-system-review/quality-evidence/writing-save-retry.mjs
```

**最终原生验收已完成。** 由前端统一操作实际 Electron43.4.1 的 main/preload/renderer，我已读取其[最终记录](frontend-evidence/post-fix-native-validation.json)：Files 的 A 未保存稿可恢复，B 同名文件独立；延迟的是一次真实 write-file IPC，释放后仍由原 handler 写盘，A 完成未改变 B 后续输入、Unsaved/Save 状态或磁盘。Writing 的 B 编辑立即切 A 后，A 保持原文、B 已自动保存；A 不重放旧 B 打开请求，回 B 可见标记与 Saved。记录包含阶段内容、SHA256 和被验收源码哈希。这是前端现场验收与本视角的证据核阅，区别于上面的独立组件/局部回调测试。

本轮选择的 Files/Writing 保存路径和 pilot 修订语义已达到局部验收标准；最终全套仍有七项已归因失败。原生场景关闭 Auto compile，未调用真实 TeX、模型或云账户，也未验证已发布安装包；跨窗口全局 store、普通任务崩溃恢复、复现 prepare 取消、结构化 symlink 写入等仍未修。前端记录本轮 Electron 正常退出、预览标签和服务关闭、临时 profile/资料/包装器整体删除且无进程残留；所需日志已归档在本报告 evidence，清理不影响复核。

## 6. 新授权阶段：K01/K02/K03/K05 工具链实施

本阶段仅修改工具链、包根元数据、诊断组件/模块、README 和相关文档；main/preload/bridge 类型接线由后端 owner 集成。未启动第二个 Electron、未运行全仓或发布产物，没有 issue、fork、push 或 PR。详细操作和后续完整门槛见 [development-validation.md](../../development-validation.md)。

| 项目 | 已实现及本轮证据 | 尚待统一验收 |
| --- | --- | --- |
| K01 构建身份 | 构建/打包记录 commit、channel、dirty、应用源码/config 指纹及真实功能政策；运行时附 platform/arch/Electron。About 可展开诊断。无 `.git` 时 commit/channel 为 unknown，dirty/fingerprint 为 null，不用空列表固定 hash 伪造精度。实际 main/preload handler 与打包 fixture 的字段闭环通过。 | 前端已有同视口暗色 About 前图；后图与真实 app:build-info 在下一轮统一 build/native 执行。当前不是已发布 v0.1.0 的追认验收。 |
| K02 安装条件 | engines、项目 engine-strict、安装前脚本和 README 一致为 Node `^22.18.0 || >=24.0.0`、npm `^10.9.0 || ^11.0.0`；版本文件与 packageManager 固定实测复现组合26.13.0/11.20.0。保留所有依赖版本/解析，lock仅根 engines新增。当前组合 check:env 与离线 `npm ci --dry-run --ignore-scripts` 通过。 | 声明范围不冒充每个版本均跑过。另一Node24官方直连TLS失败，隔离npm binary安装长等后已停止本任务进程；没有修改系统Node或声称24已实测。 |
| K03 显式桌面准备 | 零下载预检只读 electron manifest/path；两份原桌面测试也直接用此路径，缺 runtime 不再触发 require 的隐式下载。prepare 显式有界；缺 runtime 和停滞 installer 的真实临时 fixture 均通过。完整 npm test 仍包含原四组所有文件，并显式开启 PDF root 桌面回归；core是单独命令，不取代完整门槛。 | 由唯一桌面 owner 使用新的 `npm test` 统一验收；没有为过关默认 skip 桌面，也不能沿用旧 globs 绕过新预检。 |
| K05 发布包体 | 使用 electron-builder 实际 dependency matcher 对已安装43个 Node ONNX文件测得301,068,136 bytes，精确排除后保留0；现有 renderer 两份 WASM 合计55,214,662 bytes不变。只裁发布包，保留source依赖/版本、worker、WASM、权重入口和关键词fallback；不声称npm安装变快或DMG恰好缩小301MB。 | 已提供实际 app.asar / 快速资源fixture两种输入的 ASAR browser worker/WASM加载脚本。快速fixture准备成功，未抢跑Electron；最终未发布package:desktop、真实产物资源加载与关键词fallback仍须统一执行。import/WASM解析不等于CLIP推理。 |

本轮新工具链、构建身份（含实际main/preload）和相邻配置/翻译测试 **24/24通过，零跳过**；[日志](implementation-evidence/quality-toolchain-focused.log)。[lock离线dry-run](implementation-evidence/quality-toolchain-lock-dry-run.log)成功不被称为重新完整安装；此前同26.13.0/11.20.0的真实npm ci记录仍在第3节。[真实builder file-set字节](implementation-evidence/quality-toolchain-package-bytes.json)和[资源fixture准备记录](implementation-evidence/quality-toolchain-resource-fixture.json)均注明范围，临时fixture已清理。实际运行依赖资源的本地无费用路线和条件限制列在开发验收文档，未把条件跳过计为通过。

当前可复跑及最终统一命令：

```sh
node --test electron/toolchain.test.cjs electron/build-info.test.cjs electron/app-packaging.test.cjs electron/about-logo.test.cjs electron/ui-audit-settings.test.cjs electron/i18n-translations.test.cjs
npm run check:env
npm run check:desktop
node scripts/measure-package-runtime.cjs
# 以下由统一桌面执行者在源码收敛后执行，不与共享应用并发：
npm test
npm run package:desktop
node scripts/prepare-semantic-worker-audit.cjs --asar /absolute/path/to/app.asar --out /tmp/archimedes-resource-audit
# 使用已准备的Electron执行输出的entry.cjs，保留result.json后清理该临时目录。
```

**PR准备：** connector与gh均为feiiiiii5，上游REST权限pull=true/push=false；当前只有origin上游remote，尚未创建fork。上游main仍为本轮原HEAD。见[只读记录](implementation-evidence/quality-toolchain-pr-readiness.json)。用户已授权验收通过后fork、推送分支并提交PR；最终阶段执行标准全套、相关原生流程与实际包体验收。

本轮收尾另独立复跑 context-review 两探针，均退出0：[跨dataRoot/云导入身份](implementation-evidence/quality-toolchain-context-identity-after.log)、[混合运行恢复](implementation-evidence/quality-toolchain-context-recovery-after.log)。同云threadID不再共用composer键或附件；新导入thread前后端executionRoot一致；local turn interrupted而cloud turn/thread保持running。读取store新逻辑确认：权限检查后只补缺本地workspace身份，历史root保留；恢复结束按剩余running汇总thread，不在每个本地turn上写idle。没有因此修改后端或扩大为整个科研闭环验收。

## 7. V03 编译输入、稳定产物与 W06 接口

独立受控探针证实两项原行为：第二次编译覆盖第一次返回路径中的 PDF；另一 root 正在编译时，同 main 的排队请求即使 section/.bib 已改仍共用旧 promise。[before](implementation-evidence/v03-compiler-before.log) 保留原结果，[同探针 after](implementation-evidence/v03-compiler-after.log) 两项均修复。它调用真实编译编排和临时磁盘，但 compiler child 是受控 fixture，不是真 TeX。

当前实现保留全局串行，只为请求增加整稿目录 manifest/hash，并为每次 build 保留独立 PDF/log/receipt。排队或运行期间输入改变会返回 stale、`ok:false` 和空当前 PDF 路径，历史实际产物仍有 hash 可查。新鲜 handoff 经真实 preload/main 局部 handler 重新核磁盘整稿及 PDF；未保存的 renderer 草稿仍须由 W06 的 owner 队列/dirty 检查阻止交接，磁盘 helper 无法代替这一步。

生命周期按本轮协调收敛为每个 main 最近五个**未引用且已完成** preview；无完成 manifest 的进行中目录不清。真实 review/slides run 取得 ID 后 fresh 验证并 pin，其 PDF/log/manifest 不受 preview 清理；只有创建持久化失败才 rollback pin，正常 failed/cancelled run 保留历史输入。31 项聚焦为 **30 通过、0 失败、1 跳过**，另 source search **4/4 通过**；跳过仍是本机无 latexmk 的原模板编译。覆盖了实际 hash、跨 root、section/bib/image 版本、改变/删除源、未追踪 symlink、actual IPC、新旧请求、引用保留及创建失败释放。[完整证据与命令](implementation-evidence/v03-compiler.md)、[聚焦日志](implementation-evidence/v03-focused-final.log)。W06 的实际 run 创建和原生 UI 接线仍由前端/后端负责，helper 通过不等于整个交接已验收。

真实 Homebrew **Tectonic0.17.0** 使用配置中的 `default_bundle_v33.tar`：90 秒及后续空缓存 360 秒尝试均在首次下载/生成格式中达所选期限；保留同任务已下载 cache 后，续编 **149,629ms** 生成含 section 和 BibTeX bibliography 的真实 PDF。改两者后 `--only-cached` 强制不下载的重编 **306ms** 通过；旧 PDF 字节保持，新旧源/PDF fresh 检查正确。[真实结果](implementation-evidence/v03-real-tex-resumed.log)。这证明该真实系统引擎/指定 bundle 的小稿与离线复编，不是官方 managed archive 运行验收，也不等于所有模板编译通过。原 managed live 测试的 Helvetica flat-bundle fixture 尚需补齐，未把它的条件 skip 记为成功。

16MiB/66 文件暖文件系统的五次 capture 为 11.5–23.2ms，manifest 9,012B；只说明该本地 fixture 成本，不宣称大稿或整应用性能改善。目录覆盖、外部依赖/符号链接边界和保留策略见 [manuscript-builds](../../manuscript-builds.md)。临时稿件均删除、无 TeX 进程残留；下载 cache 为后续统一 managed 验收保留，准确路径、大小、命令与清理责任见 [资源交接](implementation-evidence/v03-resource-handoff.json)。本视角没有抢跑 Electron、全套或打包，也没有启动 X01/V02 新格式实现。

## 8. X01 项目迁移与 V02 数值核查

**X01 已实现并通过聚焦验收。** 可移动目录包包含 manifest、记录 JSON、资源数量与 SHA-256 blobs；用户在项目菜单选择内容、稿件源文件/文件夹并预览缺失资源，再导出或恢复。恢复用真实 SQLite 事务重建新本地 ID/引用，在唯一新目录创建本地项目；同名已有项目、旧稿和源数据不覆盖。云链接/outbox/权限、待审批动作、native 会话及 Docker/SSH 活资源所有权不进入恢复。运行中记录转中断历史；V01 restoration 保存原 owner/run/checkout，明确没有在新目录执行过。

真实 SQL/文件测试验证 PDF/索引/批注/对话、独立 review 数据库、可继续编辑的成果包及源稿；旧 thread root 与新 default root 不同、目录别名均能恢复到正确可用目录。Windows drive/UNC 以序列化格式在本机往返，**不代表 Windows 真机验收**。缺失/外改成果仍为 missing/changed；索引后被改过的 PDF 不会与旧索引配成 ready。standalone result→based-on-result thread 的循环引用在同事务中分阶段建立，不关闭 FK；未选成果时对应可空关联清除。损坏 hash 在目标写入前拒绝，后续 SQL 错误回滚新记录与新文件。

**V02 已实现并通过聚焦验收。** 用户选择小 CSV/flat JSON，确认 expected/actual、metric、unit、dataset 和绝对 tolerance；结果分 missing/incomparable/within/outside，独立保存源字节、映射、精确数值和 run/source 哈希，不改 checkpoint/run 状态。首次候选的二进制浮点 epsilon 被整合审阅否决；最终使用有界 BigInt 十进制判断，JSON 数字字面量和 UI 容差原文保留。`10^16→10^16+2 / tol1` 为 outside，JSON `1→1.0000000000000001 / tol0` 为 outside，`0.7→0.8 / tol0.1` 为 within；超支持精度为不可比。数据集和单位不推断、不自动转换，也不把用户附入文件当作由该 run 产出的证明。

source/run/报告映射改变会保留历史并标 stale。实际组件测试覆盖用户确认、重复点击仅保存一次、跨 scope 迟到返回、快照变化自动显示 stale、固定大容差原文到桥；X01 也可带数值报告和源数据，恢复新归属后保留历史 run 绑定的 stale 标记。共享 CSV parser 原样抽到 shared ESM，旧 DataAnalysis 全部行为断言保留并实际加载该 parser。

首个 X01/V02 检查点 **43/43 通过、0 失败、0 跳过**：[日志](implementation-evidence/x01-v02-final-focused.log)、[范围与完整命令](implementation-evidence/x01-v02.md)。测试执行真实 SQLite/磁盘/注册器/preload 与实际 React 组件，前端已挂项目入口及当前/历史 run 面板。公开使用说明见 [项目迁移](../../project-transfer.md)、[数值核查](../../numerical-comparisons.md)；正式代码/测试不依赖本地报告目录。

随后 I01 整合复现了同 dataRoot 恢复 B 后再次收藏同 DOI，global canonical 误选 A、B 增成两条的问题。窄修将无冲突的目标库/项目强 ID 匹配置于全局查重之前；全局强 ID 仍先于弱 title，普通跨项目共享个人阅读状态保持原断言。Bib 预览和实际导入使用相同优先级，显式 repair 写同一个 B.id。真实 Daily→B 新收藏夹和 Bib 重复导入/显式修复组件正例 **16/16**，B notes/PDF/index/selection 与 A 原对象均保持；产品视角独立 probe 也通过。[修前](implementation-evidence/restored-paper-discovery-before.log)、[修后](implementation-evidence/restored-paper-discovery-after.log)、[组件邻测](implementation-evidence/x01-library-cross-final.log)。更新后的合并聚焦为 **59/59、0 失败、0 跳过**：[最终日志](implementation-evidence/x01-v02-i01-final-focused.log)。此处是当前源码冻结检查点，后续统一原生/全套/打包结果由最终验收补入。

最后原生 Transfer 验收暴露选择框未绑定发起窗口的问题。四个 Transfer 选择器改用 `event.sender` 对应父窗；保留原 IPC owner 断言并验证父窗实参，相关 **18/18** 通过。[日志](implementation-evidence/x01-parent-window.log)。前端随后实际完成 17 文件导出→另一 dataRoot 恢复新项目/目录、旧稿及完整 8 行分析继续使用。V02 选择框可以显示，但实际点击 Open 后未返回映射页；据完整操作结果，同一父窗修复应用到唯一 CSV/JSON chooser，保留原实际 IPC 断言，相关 **9/9** 通过。[日志](implementation-evidence/v02-parent-window.log)。

## 9. 最终交付验收

最终标准 `npm test` 为 **1445项、1441通过、0失败、4条件跳过**（约27.6秒，含两个真实Electron布局、官方managed TeX、MemT与theme）。首次三项失败为旧测试的函数截取终点/News新增prop定位，保留所有原业务断言后11/11、标准全套均通过。最后V02仅样式/文案变更，现有组件/i18n **7/7** 与lint通过；原免责声明定位改为保存后Evidence来源文案，保留状态不提升和所有四分类断言。

`package:desktop`退出0，实际mac arm64二进制启动、PTY、语义不可用时正常关键词结果、保存数值报告重开及最终样式均通过。实际app.asar载入原worker/ORT并编译28,352,885B WASM，零HTTP(S)，未包含onnxruntime-node。包生产源码为618d950，随后仅测试和最终截图提交；公开head f6b5ee3，共221文件，无本地审阅日志/第三方资源。

[最终gate](implementation-evidence/release-final-gate.json)、[实际包汇总](implementation-evidence/final-package-summary.json)、[入口结果](implementation-evidence/final-package-entry-result.json)、[原生四旅程](frontend-evidence/final-native-workflows.json)。四条件为latexmk、官方Kimi工具、两Supabase真实账号用例；本地包未签名/未发布，未跑Windows/mac Intel及付费MinerU/PPTX生成。其余条件与资源清理集中在总报告，不再重复展开。

正常 [PR #336](https://github.com/Johanson-colab/Archimedes/pull/336) 已开放，head f6b5ee3，与本地一致，非draft/未合并、clean；当前无GitHub状态或check-run。任务Electron/provider及临时profile/第三方fixture已清理，Docker处于任务前停止状态；保留本地.app与报告。[发布核实](implementation-evidence/published-pr.json)、[清理](implementation-evidence/release-cleanup.json)。
