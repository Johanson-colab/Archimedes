# Archimedes 施工 Spec（合二为一最终版：Wave 1 + Wave 2）

**基线**：2026-11-25（新加坡）· 上游 `Johanson-colab/Archimedes` `main`（`75b626f6`）。  
**服务对象**：日常使用 Git、SSH、LaTeX、Coding Agent 的中英双语 CS / AI / ML 硕博生、博士后、青年学者与工业界算法研究员。  
**交付与决策口径（最新）**：
- **真正工作区为上游 GitHub 仓库 `Johanson-colab/Archimedes`**（严禁直推 `main` 或 force-push 共享分支，每完成一组即直接推分支并在上游更新已有 PR 或新建 PR）；本地主目录 `/Users/fei/Desktop/Archimedes` 不再封存，同步保持最新 `origin/main` 以便测试，已推上游的临时 worktree 及时清理。
- **忽略 Windows 专属适配与真机验收**（由其他协作者负责）；需外部凭据或他机复验的项在对应 PR 正文列清步骤，转交维护者测试。
- **全部卡片均已放行施工**（不再卡外部审批等待）；Codex 可在施工中自由提出自己的优化想法与技术判断——**本文件内任何条款（含 Wave 2）与 Codex 的实际技术判断或最新主线事实发生冲突时，一律以 Codex 为主**。

[施工红线](#rules) · [Part A 与基线](#part-a) · [后端模块图](#architecture) · [Wave 1 队列 A01–A34](#queue) · [Wave 2 纯修复队列 B01–B12](#wave2) · [Part B 封存范围](#part-b)

---

<a id="rules"></a>

## 0　施工红线与反过度工程约束

1. **边界校验一次做完。** 只在五处做严格校验：① IPC 入口校验 sender、参数、owner 与权限；② 路径沙箱校验实际根、目标及现有父目录；③ 外部 I/O 校验模型流、网络、SSH、子进程及文件解析结果；④ 数据库迁移校验旧格式、事务结果与回滚；⑤ 凭证存储校验加密可用性、读写权限与迁移结果。边界内传递已验证值，禁止重复判空、重复 normalize、静默 try/catch 吞错和针对不可能状态的兜底。批准后目标被外部编辑、连接中断、数据库被替换均是**新事实**，在执行或回写边界处理一次。保留真正的领域规则，如运行只能由其发起者取消。
2. **Rule of Two。** 抽共享模块前在 PR 中给出两个现存调用点和相同的行为契约。没有第二处就留在原地。迁移一条路径即切换它的全部调用并删掉旧实现；仍有调用者的公开 facade 和旧数据读取契约要保留。禁止空目录、占位 API、双写和无消费者的表。
3. **测试与改动 1:1。** 每个被改变的不变量保留一条主路径和一至两条高危失败路径；同类输入合并为表驱动测试。纯 bug 修复只新增 1–3 个回归用例。优先扩已有行为测试，禁止新增或扩写靠扫描源码正则/字符串来断言界面的 `ui-audit-*.test.cjs`。继续运行已有门禁，不为无关模块补测试。新增测试行数原则上 ≤ 核心生产代码净新增行数的 1.5 倍；按 `git diff --numstat` 分别计数，排除锁文件、构建产物、截图。净增 ≤0 的搬迁/删除型修复尽量复用既有测试；确需短回归，在 PR 写明行数与能捕获的真实故障。不得用填充生产代码、压行或删除有效断言凑比例。
4. **Diff Pruning 为提审条件。** 对基线和最后一次评审分别执行 `git diff --name-status origin/main...HEAD`、`git diff --numstat origin/main...HEAD`、`git diff --check origin/main...HEAD`，逐行去掉假想防御、重复测试、无关格式改动和白名单外改动。原 PR 分别核对历史差异与本轮修订。受管写入/命令走审批，凭据留在主进程，迟到的结果只回原数据目录、项目和会话。
5. **前端证据随 PR 提交。** 每个受改界面都要用真实 Electron 在**同视口、缩放、主题、语言、数据和交互状态**截前后图，放进 `docs/assets/<feature>/` 并在 PR 正文逐页嵌入。新界面从触发前的同一入口截“前”。缺图保持待验收。使用现有主题与控件，每个 surface 的中英字符串放在同一 shard，按英文键排序。非视觉变更附同输入的前后结果、日志或基准。[仓库贡献规范](https://github.com/Johanson-colab/Archimedes/blob/75b626f620e6acf14ef5d45516364812e708d475/AGENTS.md)

---

<a id="part-a"></a>

## Part A　Wave 1 锁定施工范围（`A01`–`A34`）

### A.1　基线与优先级总览

| 级别 | 首先解决的用户问题 | 对应工作与状态 |
|---|---|---|
| P0 | 原 v0.1.0 包漏生产依赖；#383 afterPack 硬编码 Windows 路径与反斜杠导致 macOS 校验失败。 | A01（待施工；仅验 macOS，Windows 忽略）。 |
| P0 | #382 已合入，普通远程 shell 的 10 秒倒计时可在未点击 Run 时执行写命令。 | A02（待施工）。 |
| P0 | Graph 活跃表以裸 run ID 取消；Reproduce 活跃表、临时凭据和 Agent 审批等待者也使用裸 ID，双库同 ID 互相干扰。 | A03–A04（待施工）。 |
| P0 | 扩展源将 token 明文写进 JSON 并经 4 个 IPC 回传 renderer。 | A05（待施工）。 |
| P1 | 路径沙箱抽取、退出恢复、锁 13 项 `latest`、BibTeX 误合并、现稿迟到保存、模型配置与首批后端读放大。 | A06–A09、A16–A17、A23–A28、A33–A34（A16/A17/A24/A26/A27/A33/A34 已本地完成待提上游；A28 放行合入；其余待施工）。 |
| P2 | 包体、格式往返与警告、发现/应用入口体验；四项点名任务（#376/#377/#378/#321）。 | A10、A18–A22、A11–A15（A11–A15、A18–A21 已本地完成待提上游；A10/A22 待施工）。 |
| M1/M2 | 保存项目分析包、从稿件表格单元追溯实验数据/日志、稿件引文插入、编译 PDF 模拟审稿与修订草稿。 | A29–A32（待施工）。 |

**实现基线**：上游 `75b626f6` 已复用 #341 异步 store、#347 编译回执、#350 草稿归属、#352/#353 快照与路径、#354 截断处理、#365/#367/#368/#375 设置图标/引文键/导出预览/重复回答、#371 BibTeX 解析、#379 本机实验取消、#382 短 SSH、#384 双语检索、#386 缓存导航。

**工作区与分支约定**：主目录 `/Users/fei/Desktop/Archimedes` 可同步保持最新 `origin/main` 以便测试；新卡从最新 `origin/main` 开分支，原 PR 保留历史并普通 push，不直推 `main` 或 force-push；已完成并推送至上游 PR 的临时 worktree 及时清理。

<a id="architecture"></a>

### A.3　后端目标目录与本批落点

保持 preload 的具名接口和 store 的公开 facade。当前 `main.cjs` 2,693 行、272 处字面量 `ipcMain.handle(`；`store.cjs` 4,850 行，已用同步 SQLite、WAL、外键与 AsyncLocalStorage。按下列去向渐进迁移，每次只搬当卡列出的域并删旧实现；其余目录本轮不创建。

```text
electron/
├── main.cjs                   启停、单实例、窗口/菜单、协议、安全策略、IPC 装配、退出确认
├── ipc/
│   ├── desktop.cjs            window、app、clipboard、workbench、sidebar
│   ├── workspace.cjs          选择/打开/观察目录、文件、context、skills
│   ├── sessions.cjs           research 快照、project/workspace/thread、artifact，沿用 thread-commands
│   ├── library.cjs            Library CRUD、Reader、云库兼容；A26 已迁四个只读查询
│   ├── discovery.cjs          literature-search/review、News、Radar、Journey、Proactive
│   ├── manuscripts.cjs        paper、精读、review、presentation、Slides、FigureForge
│   ├── experiments.cjs        Research Graph、experiment-run 与 activity
│   ├── reproduction.cjs       Reproduce 计划、准备、运行、凭据
│   ├── agent.cjs              agent run、审批、停止、task；沿用 native-agent-commands
│   ├── settings.cjs           model-config、agent-backend、environment、SSH、speech、web-search
│   ├── extensions.cjs         扩展源、安装、plugins
│   ├── collaboration.cjs      现有 auth、identity、project 成员、collab、comments、audit、presence
│   └── terminal.cjs           PTY 的 handle/on、窗口绑定与清理
├── runtime/active-runs.cjs     A03
├── security/path-sandbox.cjs  A06
├── security/secrets-store.cjs A05
├── store.cjs                  兼容入口、getSnapshot 与跨域事务协调
└── storage/
    ├── database.cjs           打开/关闭、连接租约、目录/文件身份、当前库上下文
    ├── schema.cjs             建表、索引、按原顺序运行历史迁移与启动修复
    ├── projects.cjs           项目、环境、workspace、成员角色、执行目录
    ├── library.cjs            论文、题录、PDF 页、批注、paper chat/review/slides、Daily 缓存
    ├── threads.cjs            会话、turn、附件、event、snapshot、fork/undo、上下文投影（A28/B06）
    ├── agent-records.cjs      task、command、action、native binding 与审批状态
    ├── experiments.cjs        Graph 节点/修订/边、实验工作区、run、活动与证据
    ├── reproduction.cjs       reproduction、run、attempt 与已有恢复查询
    ├── artifacts.cjs          文件来源、历史产物与已读状态
    └── collaboration.cjs      已有外部 ID 映射、同步、comments、audit
```

| 共享原语 | 两处现有消费与最低契约 |
|---|---|
| `runtime/active-runs.cjs` | Graph 的 `experiment-runner.cjs` 与 main 内的 `activeReproductionRuns` 均持有 controller。按 **[canonicalDataRoot, domain, runId]** 注册，另持启动时捕获的 store 实例/代际、发起主体与所属会话。Stop 在副作用前校验主进程解析出的主体及归属。禁止从 renderer 指定根。重复启动拒绝，重复停止无副作用；迟到 finally 只释放自己的登记。准备阶段登记取消意图；在尚不能中止的外部准备操作返回后，校验 owner，清理所得后端并跳过执行。退出确认后由 main 在 `before-quit` 调度、有界等待，只清理本进程所有的运行；用户放弃退出则保持运行。`will-quit` 保留最终同步清理。 |
| `security/path-sandbox.cjs` | 普通 Files 的保存/变更预览与 Agent workspace tools 都校验根和目标。只共享规范根、最近已存在祖先的 realpath 与基于路径段的包含判断。写新文件验证其父目录，实际执行时重新确认被外部替换的目标。Agent 保留自己的逐段禁链、隐藏文件、预期版本与批准规则。 |
| `security/secrets-store.cjs` | 扩展源与现有 `environment-vault.cjs`（及 Wave 2 的 `model-config.cjs` / `news.cjs`）共用 safeStorage 加解密与私有原子写盘：拒绝不可用后端/`basic_text` 的新持久化，临时文件 POSIX `0o600`，验证后同目录替换。保留各自记录格式、命名/用途与公开 DTO。扩展 token 按源 ID 与获准目的地使用，修改目的地须重设；旧明文成功迁移回读后才清理。 |

<a id="queue"></a>

### A.4　Wave 1 PR 施工队列（`A01`–`A34`）

**白名单约定**：`E/`、`S/`、`I/` 分别展开为 `electron/`、`src/`、`src/i18n/translations/`；`图(slug:surface,…)` 只增加 `docs/assets/<slug>/<surface>-before.png` 与 `<surface>-after.png`。**公共门禁**：`npm run lint`、`npm test`、`npm run build`。`B` 指开工时刷新的 `origin/main`。

#### A01 · B · 基于 [#383](https://github.com/Johanson-colab/Archimedes/pull/383) `26144d00` 新 PR · P0 安装包
- **Goal**：跨平台修正 afterPack，按运行平台定位真实 app.asar 并读取条目（同时支持 POSIX `/` 与 Windows `\`），缺任一必需模块即失败。
- **Allowed Files**：`electron-builder.config.cjs`、`package.json`、`scripts/verify-package.cjs`、`E/verify-package.test.cjs`。
- **Explicit Non-Goals**：不裁剪 ONNX，不做 Windows 真机安装器验收（PR 注明待 Windows 侧核对）。
- **Minimal Verification**：`node --test electron/verify-package.test.cjs`（覆盖好包、缺必需依赖坏包及 POSIX/Windows 路径）；macOS 实跑 `npm run package:desktop` 与成品首启，记录资产 SHA。

#### A02 · B · 新 PR · 承接已合 [#382](https://github.com/Johanson-colab/Archimedes/pull/382) · P0 远端批准
- **Goal**：从倒计时分支排除远端操作；SSH shell 只在用户看清主机、目录、命令并点 Run 后执行一次。
- **Allowed Files**：`S/App.tsx`、`S/approval-countdown.mjs`、`S/approval-countdown.d.mts`、`E/approval-countdown.test.cjs`、`E/agent/ssh-workspace.test.cjs`、`docs/research-ssh-workspace.md`、`图(ssh-explicit-approval:card)`。
- **Explicit Non-Goals**：保持现有本机工具和远端结构化读/改的独立审批；不实现长作业。
- **Minimal Verification**：`node --test electron/approval-countdown.test.cjs electron/agent/ssh-workspace.test.cjs`；桌面隔离 SSH 计数：超时/拒绝/换会话均为 0 次，Run 后恰 1 次，重复点击不重放。

#### A03 · B · 新 PR · 承接已合 #341/#379 · P0 取消归属
- **Goal**：把 Graph 和 Reproduce 实际活动记录放入 `active-runs.cjs`；只允许原库和 domain 停止运行。准备期可撤销后续执行，已在进行的远端准备显示待确认。
- **Allowed Files**：`E/{main.cjs,agent.cjs,runtime/active-runs.cjs,research-graph/experiment-runner.cjs}`、`E/{experiment-run-cancellation.test.cjs,workspace-store-context.test.cjs}`、`S/ReproduceView.tsx`、`I/reproduce.ts`、`图(owned-run-stop:remote-pending)`（若退出确认为系统原生 `dialog`，改用行为日志验收，不强截原生弹窗）。
- **Explicit Non-Goals**：不改写 clone/SSH 准备流程，不承诺已终止未确认的远端进程，不按裸 PID 认领。
- **Minimal Verification**：`node --test electron/experiment-run-cancellation.test.cjs electron/workspace-store-context.test.cjs electron/window-agent-run.test.cjs`；同 ID 双库 B Stop 对 A 取消回调为 0，A Stop 可停止且准备返回后不再执行。

#### A04 · B · 新 PR · A03 后 · P0 审批与临时凭据归属
- **Goal**：让审批 claim/wait/resolve 和 Reproduce 凭据读写先绑定原数据目录与所有者，再触发副作用。
- **Allowed Files**：`E/{main.cjs,agent.cjs,agent/approval-manager.cjs,reproduction/env-store.cjs,agent-approval-surface.test.cjs,reproduction-env.test.cjs,workspace-store-context.test.cjs}`。
- **Explicit Non-Goals**：不推通用权限框架；持久凭据不能使用仅进程有效的地址作身份。
- **Minimal Verification**：`node --test electron/agent-approval-surface.test.cjs electron/reproduction-env.test.cjs electron/workspace-store-context.test.cjs`；同 ID 两库不同合成值互不干扰。

#### A05 · B · 新 PR · 扩展源/环境变量 · P0 凭据
- **Goal**：封住 extensions 的 list/save/reset/feed 四个出口并迁移旧 token，在 `secrets-store.cjs` 中共用系统加密与原子落盘。
- **Allowed Files**：`E/{main.cjs,extensions-marketplace.cjs,environment-vault.cjs,security/secrets-store.cjs,extensions-marketplace.test.cjs,environment-vault.test.cjs}`、`S/{App.tsx,ExtensionsView.tsx,vite-env.d.ts}`、`I/settings.ts`、`图(extension-source-credentials:sources)`。
- **Explicit Non-Goals**：不更换所有凭据提供方（`model-config.cjs` 与 `news.cjs` 迁移放在 Wave 2 `B05`）。
- **Minimal Verification**：`node --test electron/extensions-marketplace.test.cjs electron/environment-vault.test.cjs`；验证 4 出口/日志/错误无原值，源地址改变不转发旧凭据，加密不可用可恢复。

#### A06 · B · 新 PR · P1 路径沙箱抽取（POSIX 优先）
- **Goal**：从 Files 与 Agent 提取重复的 `realpath`/祖先包含判断到 `security/path-sandbox.cjs`，保持两个调用方各自合同。
- **Allowed Files**：`E/{security/path-sandbox.cjs,workspace-files.cjs,agent/workspace-tools.cjs,agent/workspace-tools.test.cjs,workspace-files.test.cjs}`。
- **Explicit Non-Goals**：不整合远端路径策略，不做 Windows 专属真机验收（PR 注明待 Windows 侧核对）。
- **Minimal Verification**：`node --test electron/workspace-files.test.cjs electron/agent/workspace-tools.test.cjs`；根内正常，根外符号链接零写入。

#### A07 · B · [#356](https://github.com/Johanson-colab/Archimedes/pull/356) `958ce456` · A03 后 · P1 恢复
- **Goal**：在原 PR 清理本机遗留运行和旧审批，保留 partial、已完成答复与未保存工作；对不能验证归属的存活 PID 保留待核状态。
- **Allowed Files**：`E/{main.cjs,agent.cjs,store.cjs,agent-shutdown.test.cjs,reproduction-recovery.test.cjs}`、`S/{App.tsx,LibraryView.tsx,SideConversation.tsx,vite-env.d.ts}`、`I/conversation.ts`、`图(recovery:conversation,library,side-conversation)`。
- **Explicit Non-Goals**：不认领无关进程、不推断远端死亡。
- **Minimal Verification**：`node --test electron/agent-shutdown.test.cjs electron/reproduction-recovery.test.cjs electron/experiment-run-cancellation.test.cjs`。

#### A08 · B · 新 PR · P1 锁定 13 项 latest
- **Goal**：将 `package.json` 两个依赖区的全部 13 个 `latest` 替换为 B 的 `package-lock.json` 实际精确版本，同步 lock 根声明。
- **Allowed Files**：`package.json`、`package-lock.json`。
- **Explicit Non-Goals**：不升级包、不刷新传递依赖或改业务代码。
- **Minimal Verification**：`npm ci`、`npm ls --depth=0`、`npm run check:desktop`；非根 lock 条目与 B 逐字节一致。

#### A09 · B · 新 PR · A01、A08 后 · P1 最小 GitHub Actions（macOS 优先）
- **Goal**：添加 `pull_request` 触发的最小 CI 门禁（`macos-latest`，权限 `contents: read`），执行 `npm ci`、`prepare:desktop`、`lint`、`test:core`、`check:theme`、`package:desktop` 与 `verify-package.cjs`（含坏包拒绝测试与 TeX 缓存处理）。
- **Allowed Files**：`.github/workflows/desktop-ci.yml`。
- **Explicit Non-Goals**：不发布、不签名、不做 Windows runner（留待 Windows 协作者按需追加）。
- **Minimal Verification**：workflow 在 PR 上全绿，且坏包夹具被校验器拒绝。

#### A10 · B · [#355](https://github.com/Johanson-colab/Archimedes/pull/355) `8c2ab211` · A01 后 · P2 包体
- **Goal**：只在 renderer 的语义检索仍能真实推理时，移除可证明未用的原生 ONNX 打包字节。
- **Allowed Files**：`electron-builder.config.cjs`、`scripts/{measure-package-runtime.cjs,prepare-semantic-worker-audit.cjs,run-semantic-worker-audit.cjs}`、`E/semantic-worker-audit.test.cjs`、`docs/semantic-packaging.md`。
- **Explicit Non-Goals**：不得削弱 #383 的必需依赖校验；若依赖图仍要求 `onnxruntime-node` 则暂缓。
- **Minimal Verification**：`node --test electron/semantic-worker-audit.test.cjs electron/figure-forge-retrieval.test.cjs`、`npm run package:desktop`、`node scripts/measure-package-runtime.cjs`。

#### A11 · B · 新 PR · [#377](https://github.com/Johanson-colab/Archimedes/issues/377) · [已完成本地分支 `codex/a11-paper-templates`，直接提上游 PR]
- **Goal**：默认显式选本地极简 article，并给 COLM、AAAI、KDD 添加可识别的年份、track、来源和可用工程入口。
- **Allowed Files**：`shared/{latex-templates.json,official-latex-templates.json}`、`S/{PaperTemplateLibrary.tsx,PaperWritingView.tsx}`、`I/writing.ts`、`E/{official-latex-templates.test.cjs,latex-workspace.test.cjs}`、`docs/paper-template-library.md`、`图(paper-templates:chooser,venue,manuscript)`。
- **Explicit Non-Goals**：不改变旧 `archimedes` starter 语义，不写通用 ZIP 下载器。
- **Minimal Verification**：`node --test electron/official-latex-templates.test.cjs electron/latex-workspace.test.cjs`；PR 注明 AAAI 需 pdfLaTeX（内置 Tectonic 兼容回退在 `B07` 处理）。

#### A12 · B · 新 PR · [#378](https://github.com/Johanson-colab/Archimedes/issues/378) · [已完成本地分支 `codex/a12-slides-analysis`，直接提上游 PR]
- **Goal**：按 Reproduce/Paper Review 结果页统一 Slides 和 Analysis 的背景、标题层次、按钮与反馈，保留各自结果区。
- **Allowed Files**：`S/{PaperToSlidesView.tsx,paper-to-slides.css,DataAnalysisView.tsx,data-analysis.css}`、`I/{paperSlides.ts,dataAnalysis.ts}`、`图(slides-analysis:slides,analysis-plot,analysis-table)`。
- **Explicit Non-Goals**：不动参照页，不做持久化或本地生成 PPTX。
- **Minimal Verification**：`node --test electron/paper-to-slides.test.cjs electron/data-analysis.test.cjs` + 3 组前后截图。

#### A13 + A14 · B · 新 PR · [#376](https://github.com/Johanson-colab/Archimedes/issues/376) · [已完成本地分支 `codex/research-news-sources`，直接提上游 PR]
- **Goal**：接入稳定科研 RSS 源并按订阅独立显示刷新状态；复用主进程 Tavily 仅在用户主动触发时检索公开 X 原帖。
- **Allowed Files**：`E/{news.cjs,news-sources.cjs,web-search.cjs,news-sources.test.cjs,news-refresh.test.cjs,web-search.test.cjs}`、`S/{NewsView.tsx,vite-env.d.ts}`、`I/news.ts`、`图(research-news:feed,source-settings)`、`图(news-x:provider,results)`。
- **Explicit Non-Goals**：不增加后台付费刷新或新凭据存储。
- **Minimal Verification**：`node --test electron/news-refresh.test.cjs electron/news-sources.test.cjs electron/web-search.test.cjs`；PR 正文注明 Tavily X 真实联机待维护者配 Key 复验。

#### A15 · B · 新 PR · [#321](https://github.com/Johanson-colab/Archimedes/issues/321) · [已完成本地分支 `codex/a15-first-run-guide`，直接提上游 PR]
- **Goal**：可跳过、可重开的双语首启指南（`localStorage` 持久化），先介绍总体布局再指引各模块。
- **Allowed Files**：`S/{App.tsx,ResearchWelcome.tsx,FirstRunGuide.tsx}`、`I/app.ts`、`S/styles.css`、`E/first-run-guide.test.cjs`、`图(first-run-guide:intro,workbench,help)`。
- **Explicit Non-Goals**：不替换欢迎页、不要求模型 key、不碰后端数据库。
- **Minimal Verification**：`node --test electron/first-run-guide.test.cjs` + 3 组前后截图。

#### A16 + A17 · B · [#369](https://github.com/Johanson-colab/Archimedes/pull/369) & [#372](https://github.com/Johanson-colab/Archimedes/pull/372) · [已完成本地分支 `codex/a16-pr369` / `codex/bibtex-review-20261125`，推送更新上游 PR]
- **Goal**：导入预览与 SQLite 写入对旧指纹、作者尾部 `others`、冲突强 ID 及批内代表得出一致匹配决定。
- **Allowed Files**：`E/{bibliography-records.cjs,bibliography-records.test.cjs,bibliography-interchange.test.cjs,store.cjs,library-sync.cjs,library-sync.test.cjs}`、`S/{BibliographyDialog.tsx,bibliography.ts}`、`I/library.ts`、`图(bibtex-title-match:import)`、`图(bibtex-batch-identity:preview)`。
- **Explicit Non-Goals**：不扩 `server/sql`。
- **Minimal Verification**：`node --test electron/bibliography-records.test.cjs electron/bibliography-interchange.test.cjs electron/library-sync.test.cjs`。

#### A18 · B · [#370](https://github.com/Johanson-colab/Archimedes/pull/370) · [已完成本地分支 `codex/a18-pr370`，推送更新上游 PR]
- **Goal**：在已合 #371 的解析器上保留 TeX 字符、重音和 DOI 的往返含义。
- **Allowed Files**：`S/bibliography.ts`、`E/bibliography-interchange.test.cjs`、`图(bibtex-roundtrip:preview)`。
- **Explicit Non-Goals**：不改论文身份或语言系统。
- **Minimal Verification**：`node --test electron/bibliography-interchange.test.cjs`。

#### A19 + A20 · B · [#373](https://github.com/Johanson-colab/Archimedes/pull/373) & [#374](https://github.com/Johanson-colab/Archimedes/pull/374) · [已完成本地分支 `codex/a19-pr373`，推送更新上游 PR]
- **Goal**：中英界面显示可定位到原始输入位置的导入警告，并在预览标明实际导出会丢失的卷/期/页码/作者分组。
- **Allowed Files**：`S/{BibliographyDialog.tsx,bibliography.ts}`、`I/library.ts`、`E/{bibliography-interchange.test.cjs,test-support/bibliography-fixture.cjs}`、`图(bibtex-warnings:zh,en)`、`图(bibtex-export-loss:preview)`。
- **Explicit Non-Goals**：不更改持久模型或扩大支持字段。
- **Minimal Verification**：`node --test electron/bibliography-interchange.test.cjs electron/i18n-translations.test.cjs`。

#### A21 · B · [#342](https://github.com/Johanson-colab/Archimedes/pull/342) · [已完成本地分支 `codex/a21-pr342`，推送更新上游 PR]
- **Goal**：保留 #386 后仍缺的项目内查询、筛选与目标文献集合恢复。
- **Allowed Files**：`S/{ConferenceDiscovery.tsx,LibraryView.tsx,discovery-state.ts,library-workspace.css}`、`I/library.ts`、`E/{discovery-project-state.test.cjs,daily-discovery-ui.test.cjs,test-support/discovery-fixture.cjs}`、`图(discovery-project-state:daily,conference)`。
- **Explicit Non-Goals**：不重做 Daily 缓存导航或会议目录加载。
- **Minimal Verification**：`node --test electron/discovery-project-state.test.cjs electron/daily-discovery.test.cjs`。

#### A22 · B · [#351](https://github.com/Johanson-colab/Archimedes/pull/351) `7376c8dc` · P2 应用入口
- **Goal**：对齐当前首页、命令面板和已关闭的研究应用，启用成功后才导航。
- **Allowed Files**：`S/{App.tsx,CommandPalette.tsx,research-apps.ts,sidebar-registry.tsx}`、`I/app.ts`、`E/{research-app-entry.test.cjs,research-app-entry-notice.test.cjs,research-app-settings.test.cjs}`、`图(research-app-entry:home,palette,settings)`。
- **Explicit Non-Goals**：不改默认启用项、不重绘首页。
- **Minimal Verification**：`node --test electron/research-app-entry.test.cjs electron/research-app-entry-notice.test.cjs electron/research-app-settings.test.cjs`。

#### A23 · B · [#348](https://github.com/Johanson-colab/Archimedes/pull/348) `898bc91a` · P1 续写现稿
- **Goal**：复用现有写作入口，原地打开多文件稿件，让迟到的读取、保存与编译留在原稿。
- **Allowed Files**：`E/{main.cjs,preload.cjs,paper-writing-workspace.test.cjs}`、`S/{App.tsx,PaperWritingView.tsx,paper-writing-state.ts,paper-writing-workspace.css,vite-env.d.ts}`、`I/writing.ts`、`图(continue-existing-manuscript:chooser,editor)`。
- **Explicit Non-Goals**：不提供命名版本、审稿或 Slides；不覆盖外部编辑器的新字节。
- **Minimal Verification**：`node --test electron/paper-writing-workspace.test.cjs electron/latex-workspace.test.cjs electron/file-editor-owner.test.cjs`。

#### A24 · B · [#359](https://github.com/Johanson-colab/Archimedes/pull/359) · [已完成本地分支 `codex/a24-opencode-go`，推送更新上游 PR]
- **Goal**：保留左栏 OpenCode Go provider，在真实调用路径消除 Gemini 无图错误中的私有 header/密钥。
- **Allowed Files**：`E/{figure-forge.cjs,figure-forge.test.cjs,model-request-headers.cjs,model-request-headers.test.cjs}`、`图(model-go:provider,error)`。
- **Explicit Non-Goals**：不叠加多模型注册表。
- **Minimal Verification**：`node --test electron/figure-forge.test.cjs electron/model-request-headers.test.cjs electron/model-config.test.cjs electron/model-completion.test.cjs`。

#### A25 · B · [#360](https://github.com/Johanson-colab/Archimedes/pull/360) `df67e5c4` · A24 后 · #358 · M2 多模型
- **Goal**：仅重放 registry 差异，单模型保持默认，启用高级配置后 composer 显示与 Agent/Proactive 实际请求一致。
- **Allowed Files**：`E/{agent.cjs,model-registry.cjs,model-registry.test.cjs,model-backend-settings.test.cjs,agent-complete.test.cjs}`、`E/agent/{active-context.cjs,model-capabilities.cjs,model-capabilities.test.cjs,reasoning.cjs}`、`S/{App.tsx,ModelSettingsModal.tsx,HarnessPicker.tsx}`、`I/{agent.ts,settings.ts}`、`图(model-registry:settings,composer,error)`。
- **Explicit Non-Goals**：不重复 #359 provider，不迁全部 Research Apps/原生后端。
- **Minimal Verification**：`node --test electron/model-registry.test.cjs electron/model-backend-settings.test.cjs electron/agent-complete.test.cjs electron/agent/model-capabilities.test.cjs`。

#### A26 · B · 新 PR · [已完成本地分支 `codex/a26-library-ipc`，直接提上游 PR]
- **Goal**：把 `library:list`、`list-projects`、`list-papers`、`get-bibliography` 四个只读 handler 迁入 `electron/ipc/library.cjs`。
- **Allowed Files**：`E/{main.cjs,ipc/library.cjs,workspace-store-context.test.cjs,bibliography-records.test.cjs,ui-audit-project-libraries.test.cjs}`。
- **Explicit Non-Goals**：不动 preload、类型、参数或返回。
- **Minimal Verification**：`node --test electron/library-workspace.test.cjs electron/workspace-store-context.test.cjs electron/ui-audit-project-libraries.test.cjs`。

#### A27 · B · 新 PR · [已完成本地分支 `codex/a27-thread-read-benchmark`，直接提上游 PR]
- **Goal**：在固定合成库上量出打开/切换/发送/轮询的实际耗时与读取放大，交付可重放基线（`scripts/bench-thread-reads.cjs`）。
- **Allowed Files**：`scripts/bench-thread-reads.cjs`。
- **Explicit Non-Goals**：不改生产查询或装新依赖。
- **Minimal Verification**：`node scripts/bench-thread-reads.cjs --sizes 20,250,1000 --events 20000 --sessions 50 --samples 30 --json`。

#### A28 · B · 新 PR · 放行合入候选补丁 · B1 Store 首批
- **Goal**：正式合入 A28 候选补丁（已验证减少长会话 38.6% SQL 返回行、首片提速 28.1%，放宽 30% 机械门槛予以接受），将投影读路径落入 `electron/storage/threads.cjs`，保持原 facade 合同。
- **Allowed Files**：`E/{store.cjs,storage/threads.cjs,native-harness-bindings.test.cjs}`、`E/agent/context.test.cjs`。
- **Explicit Non-Goals**：不改变完整详情、首次 native 导入、resume 或权限判断（8 秒轮询增量优化见 `B06`）。
- **Minimal Verification**：`node --test electron/native-harness-bindings.test.cjs electron/agent/context.test.cjs electron/thread-commands.test.cjs electron/workspace-store-context.test.cjs` + A27 复测。

#### A29 · B · 新 PR · M1 保存分析 · 参考 [fork #7](https://github.com/feiiiiii5/Archimedes/pull/7)
- **Goal**：为用户显式保存的一份小 CSV 在原项目目录写一份带源字节、摘要、单位、配方、计算结果与 owner 的受管分析包，退出后能重开（若仅用工作区受管文件不新增 SQLite 表，可不碰 `E/store.cjs`）。
- **Allowed Files**：`E/{main.cjs,preload.cjs,project-results.cjs,project-results.test.cjs,data-analysis.test.cjs}`（仅当确需表索引时含 `E/store.cjs`）、`S/{App.tsx,DataAnalysisView.tsx,data-analysis.ts,vite-env.d.ts}`、`I/dataAnalysis.ts`、`图(saved-analysis:save,reopen)`。
- **Explicit Non-Goals**：不做数据清洗平台、任意 notebook 或跨机备份。
- **Minimal Verification**：`node --test electron/data-analysis.test.cjs electron/project-results.test.cjs`；A 延迟保存不落 B，源副本缺失标缺不偷换。

#### A30 · B · 新 PR · A23、A29 后 · M1 数值回查
- **Goal**：从指定稿件版本的一个手选表格单元回到固定 CSV、均值算法以及所选 Graph run 的原始观测和日志。
- **Allowed Files**：`E/{main.cjs,preload.cjs,project-results.cjs,manuscript-evidence.cjs,manuscript-evidence.test.cjs}`、`S/{App.tsx,PaperWritingView.tsx,research-graph/ExperimentInspector.tsx,vite-env.d.ts}`、`I/writing.ts`、`图(manuscript-evidence:cell,run)`。
- **Explicit Non-Goals**：复用 #347 编译凭据和 Graph 原 ID，不建统一 Evidence DB。
- **Minimal Verification**：`node --test electron/manuscript-evidence.test.cjs electron/manuscript-snapshot.test.cjs electron/experiment-runs.test.cjs`；3-seed 夹具精确还原均值与差值。

#### A31 · B · 新 PR · A23、A11 后 · M2 引文 · 参考 [fork #2](https://github.com/feiiiiii5/Archimedes/pull/2)
- **Goal**：从项目 Library 选论文，采用「先写 `.bib` 并校验外部冲突，成功后再向 `.tex` 插入 `\cite{key}`」的顺序语义，插入可编译引用。
- **Allowed Files**：`S/{PaperWritingView.tsx,PaperWritingCitations.tsx,paper-writing-citations.ts,bibliography.ts}`、`I/writing.ts`、`E/paper-writing-citations.test.cjs`、`图(manuscript-citation:picker,editor)`。
- **Explicit Non-Goals**：不做 Zotero 同步、不造复杂事务引擎。
- **Minimal Verification**：`node --test electron/paper-writing-citations.test.cjs electron/bibliography-interchange.test.cjs`。

#### A32 · B · 新 PR · A23 后 · M2 审稿修订 · 参考 [fork #5](https://github.com/feiiiiii5/Archimedes/pull/5)
- **Goal**：从当前成功编译的 PDF 发起模拟审稿，让作者选择一条带页码的意见进入私有修订草稿。
- **Allowed Files**：`E/{main.cjs,preload.cjs,paper-review.cjs,paper-review-store.cjs,manuscript-handoff.cjs,manuscript-handoff.test.cjs}`、`S/{App.tsx,PaperWritingView.tsx,PaperReviewView.tsx,manuscript-handoff.ts,vite-env.d.ts}`、`I/{writing.ts,paperReview.ts}`、`图(manuscript-review:source,review,revision)`。
- **Explicit Non-Goals**：不代投、不做 OpenReview 拉取或自动改稿。
- **Minimal Verification**：`node --test electron/manuscript-handoff.test.cjs electron/manuscript-snapshot.test.cjs electron/paper-review-app.test.cjs electron/paper-review-store.test.cjs`。

#### A33 · B · 新 PR · [已完成本地分支 `codex/a33-arxiv-version`，直接提上游 PR]
- **Goal**：在 `E/paper-review.cjs` 保留用户输入的显式 arXiv 版本号（如 `v1`），版本不可用时明确报错，不静默回退到无版本最新版。
- **Allowed Files**：`E/{paper-review.cjs,paper-review-app.test.cjs}`。
- **Explicit Non-Goals**：不改其他审稿导入源。
- **Minimal Verification**：`node --test electron/paper-review-app.test.cjs`。

#### A34 · B · 新 PR · [已完成本地分支 `codex/a34-model-stream`，直接提上游 PR]
- **Goal**：在 `E/agent.cjs` 对 OpenAI 兼容空流/缺合法终态不再静默二次 POST 非流式重发，仅在端点明确拒绝流式时走兼容分支。
- **Allowed Files**：`E/{agent.cjs,agent-complete.test.cjs,model-completion.test.cjs}`。
- **Explicit Non-Goals**：不改 Anthropic 适配器与正常重试策略。
- **Minimal Verification**：`node --test electron/agent-complete.test.cjs electron/model-completion.test.cjs`；空流/缺终态 POST 1 次、工具执行 0 次。

### A.5　存量 PR 技术处置

| 工作 | 处置 |
|---|---|
| #342 / #348 / #351 | 分别保留目标文献集合、原稿延迟保存、入口启用三处差异。对应 A21 / A23 / A22。 |
| #355 / #356 | 用 #383 校验裁剪后的成品；本机中断恢复与远端失联分开。对应 A10 / A07。 |
| #359 / #360 | 先修 provider 错误回传，再重放 registry-only 差异。对应 A24 / A25。 |
| #369 / #372 / #370 / #373 / #374 | 默认保留原 PR（或按 Codex 判断整合收敛为 #369+#372、#373+#374 与独立 #370），保留原讨论映射。#371 已合入。 |

其他作者的 Windows 专属 PR（#380/#385/#363/#364）及 #334 不由本队列接管。

---

<a id="wave2"></a>

## Wave 2　前后端深度排雷与纯修复施工队列（`B01`–`B12`）

> 本队列来自独立第三方源码审阅与实跑测试，与 `A01`–`A34` 零重叠，全部聚焦真实 Bug、安全隐患、资源泄漏与主线程/渲染卡顿。**若任何条款与 Codex 的技术判断、既有 PR 结构或最新主线事实冲突，一律以 Codex 为主，可自由合并、裁剪或调整实施顺序。**

### Batch 1 · 测试基线清零（将 `npm test` 拉回 0 失败全绿）

#### B01 · P0 · 清除基线自带的 4 项常年测试/脚本失败
- **Goal**：修复上游基线本身存在的 4 个失败项（含 1 个真实 Python 脚本 Bug），使 `npm run test:core` 达到 **0 失败全绿**：
  1. `I/native.ts`：`"stop the running turn before sending another native request."` 键位未按字母排序；
  2. `E/agent/experiment-retry-audit.test.cjs:15`：macOS `os.tmpdir()` 返回 `/var/...` 与子进程 `realpath` `/private/var/...` 不一致；
  3. `E/ui-audit-tabs.test.cjs:22`：正则 `/<Tabs value=\{searchKind\}/` 仍匹配旧版 `LibraryView.tsx`；
  4. `E/assets/research-skills/idea-spark/scripts/run.py`：从外部 `cwd` 执行时未将 skill 根目录加入 `sys.path`，真实触发 `ModuleNotFoundError: No module named 'scripts.next_step'`。
- **Allowed Files**：`I/native.ts`、`E/agent/experiment-retry-audit.test.cjs`、`E/ui-audit-tabs.test.cjs`、`E/assets/research-skills/idea-spark/scripts/run.py`、`E/agent/research-skills.test.cjs`。
- **Explicit Non-Goals**：不修改其他翻译 shard，不扩写 `ui-audit-*` 断言，不重构 `run.py` 业务。
- **Minimal Verification**：`node --test electron/i18n-translations.test.cjs electron/agent/experiment-retry-audit.test.cjs electron/ui-audit-tabs.test.cjs electron/agent/research-skills.test.cjs` 全绿，随后 `npm run test:core` 0 失败。

### Batch 2 · 后端崩溃、进程泄漏与凭据安全修复

#### B02 · P0 · 修复 `fs.watch` 缺失 `error` 监听导致主进程闪退
- **Goal**：为 `watchWorkspace`（`E/main.cjs:251`）创建的 `FSWatcher` 挂载 `error` 监听，在目录被删、卸载或句柄超限时优雅停止 watcher 而不崩溃主进程。
- **Allowed Files**：`E/main.cjs`、`E/workspace-files.test.cjs`。
- **Explicit Non-Goals**：不更换监听库，不改动防抖与忽略列表。
- **Minimal Verification**：模拟 `FSWatcher` 触发 `error`，进程不崩溃、watcher 被关闭并从 `workspaceWatchers` 移除。

#### B03 · P0 · 修复 `terminal:run` 三连 Bug（硬编码 shell、密钥泄漏、孤儿进程）
- **Goal**：修复 `E/main.cjs:2420-2470` 的 `terminal:run` / `terminal:stop` / `closeAllTerminals` / `closeWindowTerminals`：① 去除非 Windows 硬编码 `/bin/zsh`，复用 `E/terminal-shell.cjs`；② 子进程改用 `cleanTerminalEnvironment()` 避免泄漏主进程 `ARCHIMEDES_LLM_*` 等密钥；③ 使用独立进程组（`detached: true`）按进程组终止子进程树，不遗留后台孤儿进程。
- **Allowed Files**：`E/main.cjs`、`E/terminal-shell.cjs`、`E/terminal-shell.test.cjs`。
- **Explicit Non-Goals**：不改动 `node-pty` 交互终端协议，不处理 Windows 专属 `taskkill`。
- **Minimal Verification**：2 个真实子进程用例验证密钥不透传，且 stop 后父壳与派生孙进程均退出。

#### B04 · P0 · 补全 `will-quit` 后台任务与句柄清理
- **前置依赖**：`A03`（`E/runtime/active-runs.cjs`）。
- **Goal**：在 `E/main.cjs:2677` 退出清理补齐漏掉的 `deepReadingRuns`、`activeLiteratureSearches` 与 `workspaceWatchers`，并在关窗时释放 `windowPreviewTokens` / `previewTokenWorkspaces`。
- **Allowed Files**：`E/main.cjs`、`E/agent-shutdown.test.cjs`、`E/paper-deep-reading-ipc.test.cjs`。
- **Explicit Non-Goals**：不改动深读 checkpoint 格式。
- **Minimal Verification**：退出钩子触发后活跃深读与文献搜索收到 abort、全部 watcher 关闭、关窗 token 释放。

#### B05 · P0 · 迁移 `model-config.cjs` 与 `news.cjs` 明文凭据至统一加密与原子写盘
- **前置依赖**：`A05`（`E/security/secrets-store.cjs`）。
- **Goal**：消除 `E/model-config.cjs:65`（主模型 API Key）和 `E/news.cjs:99`（Reddit `clientSecret`、GitHub `token`、X `bearerToken`）的明文落盘与非原子覆写，复用 `secrets-store.cjs` 做 `safeStorage` 加密与临时文件原子替换；旧明文迁移回读成功后再清除。
- **Allowed Files**：`E/model-config.cjs`、`E/news.cjs`、`E/security/secrets-store.cjs`、`E/model-config.test.cjs`、`E/news-sources.test.cjs`。
- **Explicit Non-Goals**：不改变公开 DTO 字段形状或设置 UI 表单。
- **Minimal Verification**：表驱动验证旧明文无损迁移、加密不可用时保护旧配置、写入中断不损坏原文件。

### Batch 3 · 后端主线程防阻塞与 LaTeX 稳定性修复

#### B06 · P1 · 运行期 8 秒全量轮询改增量事件读取 + 消除并发重入竞态
- **前置依赖**：`A27`、`A28`（`storage/threads.cjs`）。
- **Goal**：根治 B0 实测暴露的「1,000 轮会话每 8 秒轮询读 23,006 行 / 7.47 MB」与 `S/App.tsx:1792-1804` 并发重入竞态：后端新增按 `threadId + afterEventId` 增量读取事件接口（校验 owner），前端改为串行调度并在切换/撤销时重置游标。
- **Allowed Files**：`E/storage/threads.cjs`、`E/store.cjs`、`E/main.cjs`、`E/preload.cjs`、`S/App.tsx`、`S/vite-env.d.ts`、`E/workspace-store-context.test.cjs`。
- **Explicit Non-Goals**：不替换正常流式推送，不改完整线程加载接口。
- **Minimal Verification**：用 `scripts/bench-thread-reads.cjs` 复测 1,000 轮轮询，无新事件时载荷下降 ≥95%；慢请求不乱序覆盖，撤销后游标重置。

#### B07 · P1 · LaTeX 编译支持取消、进程树清理、异步工程扫描与本机 `pdflatex` 回退
- **Goal**：修复 `E/latex-workspace.cjs`：① `runCompiler` 接入 `AbortSignal` 与进程组清理（切稿/关窗/退出可中止）；② `listLatexProjects` 改有界异步遍历（`fs.promises`）；③ 当内置 Tectonic（XeTeX）因宏包限制失败（如 AAAI 官方样式）且本机存在 `pdflatex`/`latexmk` 时支持显式选用本机编译器重编。
- **Allowed Files**：`E/latex-workspace.cjs`、`E/main.cjs`、`E/preload.cjs`、`S/PaperWritingView.tsx`、`S/vite-env.d.ts`、`I/writing.ts`、`E/latex-workspace.test.cjs`。
- **Explicit Non-Goals**：不做 SyncTeX、不打包新 TeX 发行版、不改编译回执格式。
- **Minimal Verification**：`node --test electron/latex-workspace.test.cjs` 覆盖 abort 终止子进程树、异步列表排序一致、指定本机 `pdflatex` 编译。

#### B08 · P1 · 消除主进程同步 `spawnSync("git", ...)` 阻塞
- **Goal**：将 `E/store.cjs`（worktree 创建/删除/分支检测，lines 2509/2591/2645/2651/3547）、`E/git-state.cjs` 和 `E/research-graph/experiment-runner.cjs:22` 的同步 `git` 调用改为异步 `execFile`，防止大仓库冻结主进程与所有终端。
- **Allowed Files**：`E/git-state.cjs`、`E/store.cjs`、`E/research-graph/experiment-runner.cjs`、`E/main.cjs`、`E/git-state.test.cjs`、`E/workspace-session-model.test.cjs`。
- **Explicit Non-Goals**：不改变 Git 状态枚举与 worktree 命名，不引入外部 Git 库。
- **Minimal Verification**：`node --test electron/git-state.test.cjs electron/workspace-session-model.test.cjs electron/experiment-runs.test.cjs` 全通过，慢 git mock 不阻塞主进程事件循环。

### Batch 4 · 前端内存/监听泄漏与交互卡顿修复

#### B09 · P1 · 修复 `BrowserView` `<webview>` 7 个事件监听器零 cleanup 与切语言闭包过期
- **Goal**：修复 `S/BrowserView.tsx:75-154`：用 ref 读最新 `t`，在 `useEffect` 返回清理函数完整移除 7 个 `<webview>` 事件监听器并在卸载时释放节点。
- **Allowed Files**：`S/BrowserView.tsx`、`E/ui-audit-workbench-browser.test.cjs`（仅必要同步）、`E/browser-view.test.cjs`。
- **Explicit Non-Goals**：不重构浏览器导航或增标签页。
- **Minimal Verification**：挂载→切语言触发加载失败→卸载，错误文案随新语言更新且全部监听移除。

#### B10 · P1 · 修复 `TerminalPanel` 拖拽缩放中途卸载导致的全局监听泄漏与 body 样式锁死
- **Goal**：修复 `S/TerminalPanel.tsx:157-164`，将拖拽清理函数存 ref，在 unmount 时强制移除 `window` 的 `pointermove`/`pointerup` 并移除 `document.body.terminal-resizing`。
- **Allowed Files**：`S/TerminalPanel.tsx`、`E/terminal-panel.test.cjs`。
- **Explicit Non-Goals**：不改 `xterm.js` 与 PTY 通信。
- **Minimal Verification**：进入拖拽态后卸载组件，验证 `terminal-resizing` 已移除且后续 `pointermove` 不触发回调。

#### B11 · P1 · 前端 `localStorage` 容错保护与分栏拖拽写盘防抖
- **Goal**：收口 `S/App.tsx`（lines 284, 292, 301, 553, 1216）与 `S/PaperWritingView.tsx`（lines 39, 45, 295-297）的裸 `JSON.parse` / `localStorage.setItem`，防损坏白屏与 `QuotaExceededError`；将 `PaperWritingView` 的 `browserWidth`/`previewSplit` 改为防抖或在拖拽结束写盘。
- **Allowed Files**：`S/App.tsx`、`S/PaperWritingView.tsx`、`E/paper-writing-workspace.test.cjs`。
- **Explicit Non-Goals**：不引入新存储库，不改已有 `localStorage` 键名与格式。
- **Minimal Verification**：注入损坏 JSON 与 `QuotaExceededError` stub 正常启动不抛错；连续 20 次宽度变更只写盘 1 次。

#### B12 · P2 · 聊天流式 `assistant_delta` 局部订阅，降低长对话输入掉帧
- **Goal**：将 `S/App.tsx` 顶层高频更新的活跃流式响应文本抽离为局部订阅状态（配合 `requestAnimationFrame` 合批刷新），使流式输出期间历史消息列表、侧栏与输入区不整树重绘；落库事件与最终消息顺序完全不变。
- **Allowed Files**：`S/App.tsx`、`S/StreamingMessage.tsx`、`E/chat-input-performance.test.cjs`、`图(streaming-isolation:chat)`。
- **Explicit Non-Goals**：不引入第三方状态管理库，不改 Markdown/KaTeX 渲染或消息分页。
- **Minimal Verification**：`node --test electron/chat-input-performance.test.cjs` 通过，流式期间历史消息组件 commit 为 0、最终文本逐字一致。

---

<a id="part-b"></a>

## Part B　远期演进备案（本轮禁止实现、禁止预留表或抽象）

| 封存项 | 重新立项的触发条件 |
|---|---|
| 跨机全量灾备、全局 catalog＋分项目库、自动灾备迁移 | 有真实换机/恢复失败或已验证的单库隔离缺陷，明确缺失资产、所有者与恢复目标。 |
| 完整数据质量清洗引擎、逐样本 AI 评测平台 | 研究者给出无法用现有脚本重算的具体数据或失败样本。 |
| VoiceOver／DPI 全设备矩阵；UNC、BOM、Unicode 组合、大小写碰撞等极端路径矩阵 | 有明确用户工单指出失败设备或真实编码文件。 |
| SQLite worker 池、FTS5/向量全库、全量剩余 10+ 域一次性拆完、更换前端状态库 | Wave 1 + Wave 2 后仍可重复测到阻塞或无法完成的检索。 |
| 远程长实验产品化、Slurm/PBS、Reproduce 批量与 #387 跨会话证据记忆 | 在 #388 真实远端验收或 #218/#387 明确需求后再立项。 |
| Zotero 双向写回、OpenReview/rebuttal 工作台、SyncTeX、模板自动 ZIP 获取、全离线 Slides、通用 MCP Host、签名/自动更新 | 当前工具确实阻断研究任务或维护者提出具体发行需求。 |
| 多人云端协作、订阅、泛学科市场、Windows 专属特性 | 本轮排除，仅维持既有数据与入口兼容。 |
