# Archimedes 全桌面应用测试场景矩阵

日期：2026-11-17  
状态：只做调研与测试设计；未改产品代码、未开 PR  
目标：把“完整桌面 app”拆成可执行的测试场景，覆盖所有功能面，并标明当前覆盖来自 main / 开放 PR / fork PR / 未发布本地实现 / 真缺口

---

## 0. 使用说明

### 0.1 状态标签

| 标签 | 含义 |
| --- | --- |
| `M` | 上游 main 已有功能/测试 |
| `P#n` | 上游开放 PR 覆盖，尚未合并 |
| `F#n` | fork 开放 PR 覆盖，尚未合并 |
| `L` | 本地未发布实现（`f6b5ee3` / 主工作区未提交），尚未拆分成 PR |
| `NEW` | 没有现有 PR/分支覆盖，是真正待设计或待实现 |
| `C` | 条件测试，需要外部资源（Docker/SSH/TeX/Supabase/真实模型等） |

### 0.2 证据类型

| 类型 | 含义 |
| --- | --- |
| `AUTO` | 已有自动化 focused test，可 `node --test <file>` |
| `FS/DB` | 真实文件系统 / SQLite 断言，不能只用 mock |
| `NATIVE` | 真实 Electron 窗口操作 + 同视口/同主题 before/after 截图 |
| `PKG` | 真实 `app.asar` / 打包二进制审计 |
| `SIM` | 受控 fixture / 模拟模型输出；不得声称真实科研质量 |
| `COND` | 条件资源通过后才算通过；skip 要记录原因 |

### 0.3 测试层级

1. **L1 单元/行为**：`node --test electron/...`，快循环。
2. **L2 集成**：真实 FS/SQLite/IPC/子进程，检查归属、持久化、恢复。
3. **L3 原生 UI**：真实 Electron 窗口，组件截图，键鼠路径。
4. **L4 打包**：`npm run package:desktop` + app.asar 审计 + 实际二进制。
5. **L5 人工验收**：完整研究旅程，记录真实证据和已知限制。

---

## 1. 测试环境与 fixtures

### 1.1 基础环境

```bash
node -v                # 22.18+ (22.x) 或 24+，固定 26.13.0
npm -v                 # 10.9+ (10.x) 或 11.x
node scripts/check-toolchain.cjs
npm ci
npm run prepare:desktop
npm run check:desktop
```

手工 UI 用独立 profile：

```bash
npm run dev
# 或打包后：
release/mac-arm64/Archimedes.app/Contents/MacOS/Archimedes \
  --user-data-dir=/private/var/folders/y6/7f277x5n4z14sqwsw21h8ffm0000gn/T/archimedes-full-app-profile
```

### 1.2 标准 fixture 集

| Fixture | 内容 | 用途 |
| --- | --- | --- |
| `DATA_A` | 独立数据目录 A，含 project P、workspace W、session S1/S2、manuscript M（多文件 `.tex` + `.bib` + `figures/`） | 正常旅程、归属 A |
| `DATA_B` | 独立数据目录 B，故意复用同名 project id / session id | 跨 dataRoot 归属测试 |
| `PDF_1` | 有可搜索文本、页码、图表的 PDF | 阅读、高亮、页索引、review、slides |
| `PDF_2` | 与 PDF_1 同 basename 但字节不同 | PDF 身份/覆盖回归 |
| `CSV_1` | 8+ 行数值 CSV，含 unit 列、缺值、异常值 | 分析、数值比较 |
| `BIB_1` | 含 `inproceedings`、`@comment`、重音字符、重复 citekey 的 BibTeX | BibTeX roundtrip |
| `TEX_PROJECT` | 本地多文件 LaTeX 项目 + 官方 Tectonic bundle fixture | 编译 receipt、版本、字体 |
| `RUN_FIXTURE` | 本地短命令 + 可选 localhost sshd + 本地 Docker image | Reproduce 停止/清理/远程 |
| `MODEL_FIXTURE` | 受控模型响应，含完成/未完成/工具调用批次 | agent finality、审批 |
| `GRAPH_FIXTURE` | question / idea / experiment / result / writing 对象与 edges | research graph |
| `SNAP_FIXTURE` | 已保存的项目结果包（analysis/figure） | O14/O15/O16 |

### 1.3 条件资源

| 资源 | 用到场景 |
| --- | --- |
| `ARCHIMEDES_TEX_TEST_BUNDLE` | H 组 managed compiler live |
| `MEMT_PDF` | E 组 PDF equations |
| `KIMI_PPTD_TEST_PYZ` | J 组 PPTD checker |
| `SUPABASE_LIVE_TESTS=1` + 两账号 | L 组 hosted Auth/Realtime |
| Docker daemon + 受限 image | G 组 Docker backend |
| localhost sshd + 临时密钥 | G 组 SSH backend |
| 真实模型 key（可选） | C 组真实烟测；不得写入 PR 证据 |

---

## 2. 场景矩阵

### A. 首次启动、Shell 与窗口

| ID | 场景 | 关键步骤 | 预期 | 证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| A01 | 全新安装首次启动 | 无 `last-workspace.json`，启动 app | 出现首次启动/数据目录选择；不把 home 当 workspace；可创建默认目录 | NATIVE/FS | `NEW`，issue #321 |
| A02 | 跳过模型配置 | A01 后选择“稍后配置模型” | 本地文件/PDF 可用；聊天区明确提示配置模型 | NATIVE | `NEW` |
| A03 | 模型配置入口 | Settings → Models 填 provider/baseURL/model/key，Test connection | 成功保存；`hasApiKey=true`；测试连接给出明确结果 | AUTO+NATIVE | `M`: `model-config.test.cjs` |
| A04 | 向导可重入 | Settings/Footer 再次打开首启向导 | 已选目录保留；可取消且不破坏当前 workspace | NATIVE | `NEW` |
| A05 | 老用户不受影响 | 已有 `last-workspace.json`，重启 | 直接进入原 workspace，不弹向导 | NATIVE/FS | `NEW` |
| A06 | 侧栏模块清单 | 打开每个 sidebar entry | 12 个内置模块入口可达；Beta 标签正确；默认关闭项符合 `research-apps.json` | AUTO | `M`: `sidebar-settings`, `research-app-settings` |
| A07 | 侧栏排序/隐藏 | Settings → Research Apps 启停、拖动排序 | 立即反映在侧栏；重载后保留 | AUTO+NATIVE | `M`: `sidebar-order.test.cjs` |
| A08 | 命令面板 | Ctrl/Cmd+K 搜索命令、页面、面板并执行 | 命令可执行；键盘导航与 aria-label 正确 | AUTO+NATIVE | `M`: `CommandPalette` 相关 UI audit |
| A09 | Slash commands | 输入框输入 `/` 命令 | 命令列表、过滤、插入行为符合文档 | AUTO | `M`: `slash-commands` docs + tests |
| A10 | 主题切换 | paper / charcoal 切换，重载 | 颜色 token 一致；无硬编码色回退 | AUTO+NATIVE | `M`: `appearance`, `theme-tokens`, `ui-audit-*` |
| A11 | 文字大小/字体/图标 | 修改 text size、font、file icon style | 全部界面同步；快捷键可用 | AUTO+NATIVE | `M`: `file-text-size`, `appearance` |
| A12 | 单实例 | 第二次打开 app | 只保留一个窗口；第二个进程退出/聚焦原窗口 | AUTO | `M`: `ui-audit-single-instance.test.cjs` |
| A13 | About / build info | Settings → General → Build diagnostics | 显示 commit/channel/platform/arch；无 key；不报“未验证科学结论” | AUTO | `M/P#349 closed`; `build-info.test.cjs` |
| A14 | 退出清理 | 有活跃 run/terminal 时 Quit | 子进程、SSH、Docker、agent shutdown 完成；下次可恢复 | FS/DB | `P#356`; `agent-shutdown`, `reproduction-lifecycle` |

### B. Project / Workspace / Session 数据模型

| ID | 场景 | 关键步骤 | 预期 | 证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| B01 | 创建 project + workspace | New project → 选目录 → 建 workspace | DB 记录归属正确；侧栏显示；`.archimedes` 在指定目录 | FS/DB | `M`: `project-workspace`, `workspace-session-model` |
| B02 | workspace 命名/重命名 | 自动命名、手动改名 | 名称库与历史保持；路径不变 | AUTO | `M`: `workspace-names` |
| B03 | session 切换 | 同 workspace 多 session 切换 | 草稿、消息、上下文不串 | AUTO+FS/DB | `M/F#1`: `task-selection`, `composer-session` |
| B04 | 同 project 不同 dataRoot | DATA_A/B 同名 project id，延迟回复 | 回复/附件/磁盘输出只归原 A | FS/DB | `P#341/F#1/F#3`; `workspace-context`, `task-selection` |
| B05 | 历史 execution root | 打开历史 reproduction/run | 选中态写在实际渲染读取的 key；不会因当前 workspace 不同而丢 | FS/DB | `L` N04 修复；`project-research-navigation` |
| B06 | 外部文件变化 | 修改 workspace 文件 | watcher 触发刷新；忽略 `.archimedes`、`.git`、`node_modules` | AUTO | `M`: `workspace-files`, `file-editor` |
| B07 | 软链接/越界路径 | 请求 workspace 外路径 | 拒绝；结构化命令保持 checkout/path 边界 | AUTO | `P#353`; `reproduction-paths`, `local-paths` |
| B08 | 数据目录导出/恢复 | 导出 17 文件项目，在 DATA_B 恢复 | 新项目/目录/ID 重映射；旧稿、分析、版本继续可用 | FS/DB | `L` O20; `project-transfer.test.cjs` |
| B09 | 项目研究索引 | 新建 conclusion/question，链接 paper/run/version | 保存/重开/删除证据后提示正确；跨项目隔离 | FS/DB+NATIVE | `L` N04; `project-research*` |
| B10 | 模型/数据所有权 | 同 id 不同 root 的 library/review/analysis 操作 | 操作落原 owner；切换 root 不交叉污染 | FS/DB | `P#341/#350/#356`, `F#3` |

### C. Chat、Agent 与模型后端

| ID | 场景 | 关键步骤 | 预期 | 证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| C01 | API harness 发消息 | 配置 OpenAI-compatible，发送普通问题 | 文本流正常；工具调用暂停审批 | SIM/AUTO | `M`: `agent-complete`, `model-response` |
| C02 | 未完成流 | provider 返回 incomplete / partial JSON tool batch | 标记为 Incomplete；不执行未完成工具；journey 不显示 Completed | SIM+AUTO+NATIVE | `P#354`; `model-completion`, `agent-complete` |
| C03 | 工具审批/拒绝 | agent 提议 file write / shell | approve 执行，reject 不执行；结果写回对话 | AUTO | `M`: `agent-approval-surface`, `agent/tool-registry` |
| C04 | 中断/停止 | 生成中 stop / interrupt | 停止流式输出；不残留后台 run；可再次发送 | AUTO | `M`: `agent-shutdown`, `window-agent-run` |
| C05 | 模型重试 | 5xx/超时 | 有界重试；错误信息友好；不吞异常 | AUTO | `M`: `agent/model-retry` |
| C06 | 能力差异 | 不同 model capabilities/reasoning effort | UI 可用项与模型能力一致 | AUTO | `M`: `model-capabilities`, `harness-picker` |
| C07 | native Codex | 绑定 Codex CLI，发消息 | 本地 harness 执行；turn thinking/commentary 可见；权限模式正确 | COND+AUTO | `M`: `codex-native`, `native-agent-*` |
| C08 | native Claude Code / OpenCode | 绑定 CLI | 与 Codex 相同的基本 turn 生命周期 | COND+AUTO | `M`: `external-backend`, `native-harness-*` |
| C09 | 附件/上下文 | 附加文件、选中文本、图片 | 大小显示；超过上限拒绝；context items 可增删 | AUTO+NATIVE | `M`: `message-attachments`, `composer-image-preview` |
| C10 | 草稿与队列 | 切 session、发送失败后返回 | 草稿/附件/队列保留，不被其他 session 抢走 | AUTO+FS/DB | `F#3`; `composer-session`, `composer-handoff-ui` |
| C11 | 新聊天模式 | standard/research/idea-spark/experiment/paper/review | 进入正确 prompt；不会暗示不存在的完成状态 | AUTO | `M`: `new-chat-modes`, `work-modes` |
| C12 | Proactive agent | 开启主动建议，点击建议 | 只加草稿或打开 app；不自动执行 | AUTO+NATIVE | `M`: `proactive-agent`, `ui-audit-proactive` |
| C13 | Web search | 配置 Brave/Tavily/Exa/Firecrawl key，搜索 | 结果带来源；无 key 时明确提示 | AUTO | `M`: `web-search.test.cjs` |
| C14 | 真实模型烟测（可选） | 用你自己的 key 跑一次完整研究问题 | 只在本地人工记录；不把真实输出当自动化证据 | SIM/COND | `C`，不进入公开 PR |

### D. Files / Terminal / Workbench

| ID | 场景 | 关键步骤 | 预期 | 证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| D01 | 文件树浏览 | 打开大 workspace | 分级加载、忽略目录、截断提示正确 | AUTO | `M`: `workspace-files`, `workspace-directory-link` |
| D02 | 文件编辑/保存 | 修改、保存、刷新 | 草稿/冲突/保存反馈归属执行 root | AUTO+FS/DB | `P#350`; `file-editor-scope`, `file-editor` |
| D03 | 多 tab | 打开多文件、关闭/复制路径/关闭其他 | tab 行为一致；滚动/悬浮正确 | AUTO+NATIVE | `M`: `ui-audit-file-tab-menu`, `tabs` |
| D04 | 分屏 | 左右/上下拖拽 tab 到 Workbench | 分屏状态保存；宽度可拖拽 | AUTO+NATIVE | `M`: `workbench-split-panes`, `ui-audit-workbench-split` |
| D05 | 交互式终端 | 打开 PTY，运行命令，关闭窗口 | 输出正确；进程随窗口/退出结束 | AUTO | `M`: `terminal-shell`, `terminal-settings` |
| D06 | 长命令/取消 | 运行长任务后 cancel | 进程树结束；无残留子进程 | AUTO/COND | `M`: `agent/command-runner`, Windows fixture 在 mac 可失败 |
| D07 | 快照预算 | 目录/文件超大时交给 agent | 先预算再读；超限有提示，不会 OOM | AUTO | `P#352`; `workspace-snapshot-budget` |
| D08 | Artifacts | 打开/选择/评论 artifact | 列表、hover、selected 状态正确 | AUTO+NATIVE | `M`: `artifacts*`, `ui-audit-artifacts` |
| D09 | Workbench Notes | 编辑 Notes，切 tab | 内容保留；归属正确 | AUTO | `M`: `workbench-notes` |
| D10 | Browser tab | 打开允许的网页/仓库页 | 外链安全；不允许的导航被阻止 | AUTO | `M`: `ui-audit-workbench-browser` |
| D11 | Journey (Beta) | 开启 Journey，跑一轮 agent | 阶段/事件状态正确；失败恢复后不永久 Needs attention | AUTO | `M`: `journey-*`, `ui-audit-journey` |
| D12 | 快捷键/焦点 | Tab/Alt/Ctrl+K 等 | 焦点环、aria、快捷键一致 | AUTO+NATIVE | `M`: `ui-audit-composer-focus`, `menus` |

### E. Library / PDF / 标注 / 引用

| ID | 场景 | 关键步骤 | 预期 | 证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| E01 | Library 导入 | 导入 PDF、BibTeX、文件夹 | 项目库分类、文件复制/引用正确 | AUTO+FS | `M`: `library-local-import`, `project-libraries` |
| E02 | 同名 PDF 不同内容 | 导入 PDF_1/PDF_2 | 两个独立 paper/asset；不被弱标题覆盖 | AUTO+FS | `P#346`; `library-local-import` |
| E03 | BibTeX roundtrip | 导入 BIB_1 → 预览 → 导出 → 再导入 | citekey/字段/注释/重音字符保留；冲突有提示 | AUTO | `P#346`; `bibliography-interchange` 相关 |
| E04 | 项目选文理由 | 从 discovery 收藏到 library，填写理由 | 理由与来源保留（若该 PR 未关闭则验证） | AUTO | `P#344 closed/deferred` |
| E05 | PDF 阅读 | 打开、缩放、翻页、搜索 | 文本层/页面/搜索高亮正确 | AUTO+NATIVE | `M`: `pdf-*`, `paper-chat-*` |
| E06 | PDF 标注 | 高亮、评论、页索引、图 capturing | 标注落 DB；重开仍在；范围不外溢 | AUTO+FS/DB | `M`: `scoped-annotations`, `pdf-highlight-segments` |
| E07 | Paper chat | 对 PDF 提问，带引用页 | 回答来源可追溯；不编造页码 | SIM/AUTO | `M`: `paper-chat-*`, `paper-source-search` |
| E08 | Paper deep reading | 运行 deep reading skill | 双语 Markdown/HTML 结构正确；图/公式保留 | SIM/AUTO | `M`: `paper-deep-reading*` |
| E09 | Repository extraction | 从论文提取 repo，find repository | repo 链接准确；clone 目录受控 | AUTO/COND | `M`: `paper-repository*`, `find-repository` |
| E10 | Canvas notes | 在 paper canvas 添加图/引文卡片 | 保存重开；源链接可打开 | AUTO+NATIVE | `M`: `ui-audit-paper-canvas`, `canvas` |
| E11 | 论文与代码审计 | paper-to-code audit prompt | 结论标注 confirmed/contradicted/incomplete/not implemented | SIM/AUTO | `M`: `LibraryView` audit prompt |
| E12 | PDF 条件测试 | MEMT fixture | 公式识别通过；skip 需记录 | COND | `M`: `pdf-equations.test.cjs` |

### F. Discovery / News / Benchmark / Extensions

| ID | 场景 | 关键步骤 | 预期 | 证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| F01 | Daily 搜索 | quick/deep query | 查询按 key 缓存；快速切回不永久 loading | AUTO+NATIVE | `P#342`; `discovery-*` |
| F02 | Conference mode | ICML/NeurIPS 切换，显式 full proceedings | 显式模式优先；pending 返回后状态正确 | AUTO+NATIVE | `P#342`; `conferences` |
| F03 | 收藏到 library | 从 daily 收藏到指定 library | project/library 选择保留；返回原上下文 | AUTO | `M/P#342`; `discovery-bibliography` |
| F04 | Daily figure cache | 重复打开同一 paper | 图缓存命中；失败有回退 | AUTO | `M`: `daily-figure-cache` |
| F05 | News 源配置 | 添加 RSS/X/subreddit/watch/mute | 过滤与聚类正确；无 key 时明确 | AUTO+NATIVE | `M`: `news-*`, `ui-audit-news` |
| F06 | Benchmark Radar | 刷新公共索引、断网、搜索 | canonical catalog 恢复；stale cache 迁移；本地保存 | AUTO | `M`: `benchmark-radar*`（main 最近修复） |
| F07 | Extensions marketplace | JSON/GitHub/MCP/npm 源 | 源配置、浏览、安装技能/插件/MCP 正确 | AUTO+NATIVE | `M`: `extensions-marketplace`, `skill-catalog` |
| F08 | 插件副作用 | 安装/启用/禁用 runtime plugin entry | 侧栏注册/注销正确；不加载未授权代码 | AUTO | `M`: `sidebar-plugins` |
| F09 | Research Apps 默认状态 | 全新配置 | 默认启用/ Beta 状态与 `shared/research-apps.json` 一致 | AUTO | `M`: `research-app-settings` |

### G. Reproduce / Experiment / Metrics

| ID | 场景 | 关键步骤 | 预期 | 证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| G01 | 生成计划 | 选 paper，生成 runbook | 计划来自论文/代码，不凭空补数据 | SIM/AUTO | `M`: `reproduction-planner` |
| G02 | 执行与 checkpoint | 本地运行短命令 | 到 checkpoint 暂停；失败步骤有解释与一次修复 | AUTO | `M`: `reproduction-pilot` |
| G03 | 非 completed contract | planner 返回 incomplete/partial JSON | 不接受为可用 contract；journey 不显示 Completed | SIM/AUTO | `P#354`（与 C02 共用） |
| G04 | 停止 run | 运行中 stop | 本地/SSH/Docker 进程与资源清理；状态变 stopped | FS/DB+COND | `P#356/L` O07; `reproduction-lifecycle` |
| G05 | 退出时清理 | run 中 Quit | 所有 owned process/recovery 记录正确 | FS/DB | `P#356`; `reproduction-recovery` |
| G06 | 输入变化失效 | 改 CSV/配置/代码后重看旧 run | 旧检查失效；提示重新验证 | FS/DB | `L` O09; `reproduction-contract`, `reproduction-snapshot` |
| G07 | 保存输入/运行历史 | 保存 run snapshot，重开 | 输入、命令、cwd、HEAD、状态、log 可恢复 | FS/DB | `L` O09; `reproduction-run-store` |
| G08 | 完整日志 | 产生 > 内存上限的输出 | 完整日志落盘；内存 tail 有界；UI 不卡 | FS/DB | `L` O10; `reproduction-backends` |
| G09 | 环境变量 | 保存 env、env file、测试连接 | 敏感值不导出；路径校验 | AUTO | `M`: `reproduction-env*` |
| G10 | 结构化文件边界 | Docker/SSH 读写 checkout 内/外路径 | 内外边界清晰；符号链接拒绝 | AUTO | `P#353`; `reproduction-paths`, `reproduction-backends` |
| G11 | SSH backend | localhost sshd + 临时密钥 | 连接、运行、取消、清理均正确 | COND | `M/L`; `reproduction-remote`, `ssh-servers` |
| G12 | Docker backend | 受限 image/container | 运行、取消、清理均正确；不碰无关容器 | COND | `M/L`; `reproduction-backends` |
| G13 | 仓库 checkout | clone/ref/branch/path | clone 可取消；分支与写入路径受控 | AUTO/COND | `M`: `repository-checkout*`, `git-state` |
| G14 | 数值比较 | CSV/JSON 用户映射列 + 十进制容差 | 比较结果正确；缺失列/单位有提示 | AUTO+NATIVE | `L` O21; `metric-comparison*` |
| G15 | 历史 run 导航 | 当前 workspace 与 run execution root 不同 | 打开请求落到实际选中的 run | FS/DB | `L` N04 修复; `project-research-navigation` |
| G16 | 远程生命周期 | SSH 断开/超时 | 有界等待、取消、错误呈现；不泄漏 transport | COND | `C`; 历史 PR #305 closed，需确认当前覆盖 |

### H. Paper Writing / LaTeX

| ID | 场景 | 关键步骤 | 预期 | 证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| H01 | 新建/打开稿件 | 选 project，新建 main `.tex` | 多文件树正确；mainPath 可选 | AUTO+NATIVE | `M`: `paper-writing-workspace` |
| H02 | 继续已有稿件 | 重开 project，保留未保存队列 | 正确选择稿件与 workspace；覆盖 save 不丢 | AUTO | `P#348`; `paper-writing-workspace` |
| H03 | 多文件编辑保存 | 编辑 section、bib、figure | 保存按 owner 队列；冲突提示 | AUTO+FS | `P#348/#350`; `paper-writing-*` |
| H04 | 模板库 | 选会议/出版商模板 | 模板文件落地正确；官方 kit 来源明确 | AUTO | `M`: `official-latex-templates` |
| H05 | 托管 Tectonic 编译 | 冷编译 + 二次编译 | 官方 engine 校验；首次下载资源；PDF 成功 | COND | `M`: `managed-latex-engine*`, `latex-workspace` |
| H06 | 离线/弱网编译 | 缓存已存在时断网 | warm compile 成功；错误信息明确 | COND | `M`: `managed-latex-engine.live.test.cjs` |
| H07 | 编译 receipt | 改源码后编译 | PDF/log 绑定源码版本；历史 PDF 不冒充当前 | FS/DB | `P#347`; `manuscript-snapshot` |
| H08 | 编译并发/同 root | 同时操作两个稿件 | 不串 PDF；project/root 不同时隔离 | AUTO | `M/P#347`: `latex-workspace`, `manuscript-snapshot` |
| H09 | 引用插入 | 从 library 选择 paper，插入 cite，更新 `.bib` | 只改目标 manuscript；保留人工字段与 directives | AUTO+FS | `F#2`; `paper-writing-citations` |
| H10 | BibTeX 细节 | 重复 citekey、重音、`@comment`、逗号 | 不丢条目；解析告警可翻译 | AUTO | `F#2/P#346` findings |
| H11 | 命名版本 | 保存 “First complete draft”，改稿，compare，restore | 真实文件 diff；restore 保留返回点；清 PDF receipt | FS/DB+NATIVE | `F#8` N03; `paper-writing-history` |
| H12 | 字体/unicode 警告 | 编译含 CJK/特殊字符 | 诊断可读；不误判为成功 | COND | `M`: `latex-unicode-warnings` docs + tests |
| H13 | 搜索稿件内容 | 多文件搜索 | 结果定位到文件/行；大文件有预算 | AUTO | `M`: `paper-source-search` |
| H14 | 草稿与 PDF 同屏 | 修改源码后看旧 PDF | stale 标记/重新编译提示明确 | NATIVE | `M/P#347` |

### I. Figure / Chart / Data Analysis

| ID | 场景 | 关键步骤 | 预期 | 证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| I01 | Figure reference gallery | 搜索论文图、打开大图 | 来源、caption、论文链接正确 | AUTO+NATIVE | `M`: `figureforge-retrieval`, `ui-audit-image-creation` |
| I02 | FigureForge 流程 | 分析论文 → 计划 → 重建/生成 → 导出 | 中间态可编辑；SVG 可继续编辑 | SIM/AUTO | `M`: `figure-forge-*` |
| I03 | 语义搜索 fallback | 打包环境禁用网络/权重加载失败 | 关键词搜索仍返回候选 | PKG | `P#355`; semantic worker audit |
| I04 | 保存/重开图稿包 | 保存 source/reference/config/output，关闭重开 | 完整恢复；输入变化使旧输出失效 | FS/DB | `L` O15; `figure-project-results` |
| I05 | 图稿插入稿件 | 已保存图插入 existing manuscript | 文件落地；source receipt 绑定；符号链接拒绝 | FS/DB | `L` O16; `project-result-commands` |
| I06 | Data charts | 浏览论文图表引用 | 搜索、打开、导出行为一致 | AUTO+NATIVE | `M`: `data-charts-view` |
| I07 | CSV/TSV 分析 | 上传 CSV_1，profile/stats/chart | 统计正确；10MiB 上限；SVG 导出 | AUTO | `M`: `data-analysis` |
| I08 | 保存完整分析 | 保存 CSV/config/statistics/output | 重开后继续对话与图表 | FS/DB+NATIVE | `F#7`; `project-results`, `data-analysis` |
| I09 | 分析 dataRoot 切换 | 保存中切到 DATA_B | 不误报成功、不污染 B 缓存 | FS/DB | `F#7` 已修; `project-results` |
| I10 | 大 CSV 预算 | 大文件交给 agent | 读取有上限，提示只带摘要/路径 | AUTO | `M/P#352`; `data-analysis`, snapshot budget |
| I11 | 结果包 hash | 保存/读取 result package | manifest/files/hash 一致；越界文件被拒 | FS/DB | `F#7/L` O14/O15; `project-results` |

### J. Slides / Paper Review

| ID | 场景 | 关键步骤 | 预期 | 证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| J01 | Paper → Slides 准备 | 选 PDF_1 进入 Paper to Slides | 依赖检查清晰；缺依赖时给配置入口 | AUTO+NATIVE | `M/F#6`; `paper-to-slides*` |
| J02 | Slides handoff | 生成目标 session 草稿 | 同 PDF 进入 slides 任务；不自动执行付费生成 | AUTO | `F#6`; `manuscript-handoff` |
| J03 | Deck 预览 | 打开 preview | 页序、页码、占位态正确 | AUTO+NATIVE | `M`: `PaperPresentationDeck`, `ui-audit-*` |
| J04 | PPTD checker | 本地官方工具 | 通过或不通过均真实记录；skip 记录原因 | COND | `M/F#6`; `kimi-pptd`, `kimi-slides-skill` |
| J05 | Paper Review 输入 | arXiv ID / PDF_1 | 输入校验；来源清楚 | AUTO+NATIVE | `M`: `paper-review-app` |
| J06 | Review pipeline | 配置模型并运行 | findings 按 severity；不编造证据 | SIM/AUTO | `M`: `paper-review-pipeline`, `paper-review-model` |
| J07 | Review venues | 会议/期刊设置 | venue 列表与设置持久化 | AUTO | `M`: `paper-review-venues`, `paper-review-settings` |
| J08 | Review → Revision | 选择部分反馈进入修订任务 | 只带选中反馈；回到正确 manuscript | AUTO+FS/DB | `F#5`; `manuscript-handoff`, `manuscript-workflow-ui` |
| J09 | Review store | 重开历史 review | run 与 source PDF/version 绑定 | FS/DB | `M/F#5`; `paper-review-store` |

### K. Research Graph / Provenance / Transfer

| ID | 场景 | 关键步骤 | 预期 | 证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| K01 | Graph 对象创建 | 创建 question/idea/experiment/result/writing | 五类对象可创建；revision append-only | FS/DB | `P#308`; graph store |
| K02 | Typed edges | 连接对象并 pin 两端 revision | 关系不会指向旧内容 | FS/DB | `P#308` |
| K03 | 自动 extraction | 成功 Research turn 后异步抽取 | 不阻塞聊天；失败不影响主流程 | SIM/AUTO | `P#308` |
| K04 | Experiment run 记录 | 运行 approved local experiment | command/cwd/HEAD/status/log/exit 被记录 | FS/DB | `P#308` |
| K05 | Lineage UI | 打开 graph/branch rail | 分支、merge、ancestry 高亮可读 | NATIVE | `P#308` |
| K06 | 项目研究笔记 | 新建/编辑 conclusion/question | 归属 project；重开保留 | FS/DB+NATIVE | `L` N04 |
| K07 | 证据链接 | 链接 paper/run/result/version | 打开的是请求的具体对象，不替换 | FS/DB+NATIVE | `L` N04 |
| K08 | 删除证据 | 删除被引用的 paper/run | 笔记显示 unavailable，不崩溃 | FS/DB | `L` N04 |
| K09 | 项目导出包 | 导出含 versions/notes/results 的项目 | package hash/count 正确；敏感 `.env.local` 不导出 | FS/DB | `L` O20; `project-transfer` |
| K10 | 项目恢复 | 在 DATA_B 恢复 | IDs/refs 重映射；named version 可用且当前源文件缺失也有提示 | FS/DB | `L` O20/N04 |
| K11 | Import rollback | 中途失败后回滚 | 不留半恢复项目 | FS/DB | `L` O20 未提交材料 |
| K12 | Handoff 服务 | analysis/manuscript/figure 交接 | 草稿、附件、owner、receipt 内容等价 | AUTO | `L` N01; `research-handoffs` |

### L. Auth / Collaboration / Cloud

| ID | 场景 | 关键步骤 | 预期 | 证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| L01 | 本地身份 | 首次显示 local identity | 离线可用；名字/头像规则正确 | AUTO | `M`: `local-identity` |
| L02 | 邮箱注册/登录 | signup → loopback confirmation → sign in | PKCE flow id、回调、错误提示正确 | COND | `M`: `auth-flow`, `supabase-auth` |
| L03 | 改密/重置 | change password/reset | 错误与限流提示正确 | COND | `M`: auth tests |
| L04 | Project members | 本地/云成员添加移除 | 角色、权限、列表正确 | AUTO | `M`: `project-members`, `collaboration-roles` |
| L05 | Presence | 多端/两账号在线 | presence 显示与离开正确 | COND | `M/C`: `presence*`, `server/presence.live` |
| L06 | Shared notes | 多端编辑 CRDT notes | 合并、重开正确 | COND | `M`: `collaboration-contracts` |
| L07 | Shared runs | 发起/查看 shared agent run | 归属与可见性正确 | COND | `M`: `collaboration-*` |
| L08 | LaTeX co-edit | 多端编辑源码 | 不覆盖本地 LaTeX；notes 合并 | COND | `M`: `ui-audit-coedit`, collab docs |
| L09 | Session comments sync | 评论、回复、resolve | 同步与投影正确 | COND | `M`: `session-comment-sync`, `annotation-sync` |
| L10 | Cloud turn finality | 并发写同一 turn | 只有 terminal state 生效；不回退 | FS/DB+COND | `L` O24; `cloud-sync-integrity`, `thread-sync` |
| L11 | Cloud library deletion | 删除/延迟 ack/重加 | tombstone、revision、re-add 正确 | FS/DB+COND | `L` O25; `library-sync`, `library-cloud-sync` |
| L12 | LAN server | `npm run server:lan` | 启动、权限、governance 文档一致 | COND | `M`: `server/lan-server.test.cjs` |
| L13 | Supabase server | `npm run server:supabase` | Auth/RLS/Realtime 与文档一致 | COND | `M`: `server/supabase-server.live.test.cjs` |
| L14 | 云账号入口可见性 | release vs main feature policy | 与 build capability 一致；不误隐藏/误显示 | AUTO | `M`: `ui-audit-auth`, `ui-audit-cloud-sharing` |

### M. Session Tools / UI 细节 / i18n

| ID | 场景 | 关键步骤 | 预期 | 证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| M01 | Session switcher | 多 session 切换、滚动 | 选中态、滚动位置正确 | AUTO+NATIVE | `M`: `session-switcher-scroll` |
| M02 | Thread visibility | hide/show thread | 过滤规则与 UI 一致 | AUTO | `M`: `thread-visibility` |
| M03 | 定位批注 | 在对话区选中文本加 comment | anchor、resolve、present 正确 | AUTO+NATIVE | `M`: `session-comment-*`, `comments` |
| M04 | Snapshot export | 选择范围，导出 MD/JSON/PNG | 长图/范围/登录保护正确 | AUTO+NATIVE | `M`: `session-snapshot*`, `ui-audit-session-snapshot` |
| M05 | Settings IA | 10 个 section + subview | 导航、deep link、alias 正确 | AUTO | `M`: `settings-information-architecture` |
| M06 | Workspace settings | Current workspace / Change folder | 路径、连接状态、切换限制正确 | AUTO+NATIVE | `M`: `WorkspaceSettingsHub` |
| M07 | Web/SSH settings | provider/key、SSH server CRUD | 保存与验证正确；secret 不回显 | AUTO | `M`: `web-search`, `ssh-servers`, `model-backend-settings-safety` |
| M08 | Research aids settings | proactive/comments/snapshots | 开关生效 | AUTO | `M`: `workbench-settings`, `journey-settings` |
| M09 | i18n en/zh | 切换语言、重载 | 全部新增 key 有中文；shard 字母序 | AUTO | `M/P#339`; `i18n-translations` |
| M10 | 错状态 | 无项目/无论文/无结果/无 key | StateView/InlineNotice 文案明确，不空白 | AUTO+NATIVE | `M`: 多个 `ui-audit-*` |
| M11 | 菜单与对话框 | 右键菜单、溢出菜单、Modal | 键盘、焦点、位置一致 | AUTO+NATIVE | `M`: `ui-audit-menus`, `ui-audit-dialogs` |
| M12 | 可访问性 | 按钮 aria-label、focus outline | 关键控件可键盘操作 | AUTO+NATIVE | `M`: UI audit 集合 |
| M13 | 性能 | 聊天长输入、大 artifact 列表 | 无卡顿；输入性能回归 | AUTO | `M`: `chat-input-performance`, `paper-chat-performance` |
| M14 | 图片预览/语音 | composer 图片、麦克风权限 | 大小限制；mic usage string 有效 | AUTO/COND | `M`: `composer-image-preview`, `speech` |

### N. Packaging / Release / 全链路

| ID | 场景 | 关键步骤 | 预期 | 证据 | 状态 |
| --- | --- | --- | --- | --- | --- |
| N01 | 标准 gate | `npm test` | 全量测试 + theme 通过；skip 记录原因 | AUTO | `M` |
| N02 | 类型与构建 | `npm run lint`, `npm run build` | 无 TS 错误；renderer build 成功 | AUTO | `M` |
| N03 | 服务端测试 | `npm run server:test` | server 测试通过 | AUTO | `M` |
| N04 | 打包 | `npm run package:desktop` | 产出 `release/mac-arm64/Archimedes.app` | PKG | `M` |
| N05 | app.asar 入口 | 检查 runtime 文件、无 `.env`、图标 | `check-packaged-icons.cjs` 通过 | PKG | `M`: `app-packaging`, `check-packaged-icons` |
| N06 | WASM 资源 | semantic worker audit | ORT/WASM 加载编译；HTTP=0；关键词回退可用 | PKG | `P#355` |
| N07 | 打包入口烟测 | 直接运行打包二进制 | PTY、PDF、文件保存、关键词回退可用 | PKG | `M/P#355` |
| N08 | 未签名安装说明 | 从浏览器下载 DMG 并双击 | README/release 说明与 macOS 15+ 行为一致（System Settings，不写右键） | NATIVE | `NEW`，签名暂缓 |
| N09 | 真实首次研究旅程 | A01 → E01 → G01 → H05 → H09 → M04 | 全链路证据串起来；每步可回溯 | NATIVE/FS/DB | 组合场景 |
| N10 | 跨 dataRoot 旅程 | DATA_A 全程后切 DATA_B 再回 A | A/B 数据不混；延迟事件归 A | FS/DB | `P#341/F#1/F#3` |
| N11 | 打包后首次旅程 | 用 PKG app 跑 N09 | 打包产物与 dev 行为一致；记录未知差异 | PKG+NATIVE | 组合场景 |
| N12 | 有界失败验收 | 故意断网/缺 fixture/模型失败 | 错误可见、不伪造成功、可恢复 | AUTO+NATIVE | 全模块通用 |

---

## 3. 推荐的一轮完整执行顺序

1. **L1 快筛**：所有相关 focused tests + `npm run test:core` + `npm run lint` + `npm run build` + `npm run check:theme` + `npm run server:test`。
2. **L2 集成**：按 B/C/D/E/G/H/I/J/K/L 顺序跑真实 FS/SQLite/IPC 场景；跨 dataRoot 场景放在数据归属之后。
3. **L3 原生 UI**：对每个 changed surface 做同视口/同主题 before/after；核心旅程用 N09。
4. **L4 打包**：N01–N07；再做 N11 打包后旅程。
5. **L5 人工/条件**：C14、G11/G12、H05/H06、J04、L02–L13；记录 skip/未知。
6. **收尾**：写实际命令、实际结果、截图/日志路径、已知失败；不要提交 `docs/reviews/` 到公开 PR。

---

## 4. 覆盖缺口提示

当前没有现成 PR/分支覆盖、需要重点设计的场景：

- A01–A05 首次启动/向导（issue #321）。
- N08 未签名安装说明（macOS 15+ Gatekeeper）。
- G16 SSH 远程生命周期需要确认当前真实覆盖（历史 PR #305 已关闭）。
- C14 真实模型烟测只能作为本地人工记录，不能进入自动化质量声明。
- 大量 `F#`/`L` 场景依赖链未合并；必须等 PR 落地后再作为独立分支证据。

---

## 5. 一句话版本

**完整桌面 app 的测试不是“跑一遍 npm test”，而是按 A–N 十四个面覆盖：首次启动、数据归属、agent、文件/workbench、library/PDF、discovery、reproduce、writing、figure/analysis、slides/review、graph/transfer、cloud、session/UI、packaging；每一场景标明 main/PR/local 状态和证据类型，先自动化、再集成、再原生 UI、最后打包与人工旅程。**
