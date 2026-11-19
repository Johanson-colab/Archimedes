# Archimedes

<p align="center">
  <a href="README.md"><img src="https://img.shields.io/badge/English-111111?style=for-the-badge" alt="English"></a>
  <a href="README.zh-CN.md"><img src="https://img.shields.io/badge/%E4%B8%AD%E6%96%87-9a6a06?style=for-the-badge" alt="中文"></a>
</p>

> 本地优先的研究智能体套件：发现证据、阅读论文、检查代码、运行研究工作，并在可追溯的前提下完成写作。

**网站：** [archimedes-research.com](https://archimedes-research.com)

<p align="center">
  <img src="docs/assets/readme/archimedes-hero-light.webp" alt="Archimedes 研究工作区：研究对话、智能体活动与 Files">
</p>

Archimedes 不是套着论文列表的通用聊天壳。它的重心是研究闭环：问题 → 来源 → 证据 → 实现 → 实验 → 写作。它以 Electron 桌面应用运行，默认将工作区数据保存在本地，并让模型与搜索提供方可配置，而不是绑定到单一厂商。

## 安装与运行

**从这里开始。** 推荐让编码智能体负责安装和首次启动。

### 推荐：让编码智能体安装

**复制给智能体。** 将下面的内容粘贴到 Claude Code、Codex、Cursor 或其他能操作文件和终端的编码智能体中。

```text
在这台机器上从 https://github.com/Johanson-colab/Archimedes 安装 Archimedes。
目标是得到可用的本地 Electron 桌面安装，而不仅是网页预览。

1. 确认 Git 和 Node.js 20+ 可用。
2. 将仓库克隆到合适的本地目录，并进入该目录。
3. 运行 `npm install`，等待原生终端模块重新构建完成，然后显式运行 `npm run prepare:desktop`。
4. 使用适合当前平台的命令，从 `.env.example` 创建 `.env.local`。
   不要要求我在聊天中粘贴 API key。暂停并让我直接填写模型配置，然后继续。
5. 运行 `npm run dev` 启动应用。确认 Electron 窗口已打开。
   仅有 127.0.0.1:5173 的渲染进程页面不算完成。
6. 如果终端原生模块失败，运行 `npm run rebuild:native` 后重试。
7. 汇报执行过的命令、应用位置，以及仍然存在的具体错误。
```

这是非开发者最快的路径：智能体可以检查前置条件、执行安装、诊断原生模块错误，并确认 Electron 窗口成功打开。

### 手动安装

前置条件：[Git](https://git-scm.com/downloads) 和当前 Node.js LTS（建议 Node 20 或更高版本）。`npm` 随 Node 一起安装。不需要 Python 服务、数据库服务或全局 Electron。

```bash
git clone https://github.com/Johanson-colab/Archimedes.git
cd Archimedes
npm install
npm run prepare:desktop
cp .env.example .env.local    # macOS / Linux
npm run dev
```

在 Windows PowerShell 中，用以下命令复制环境变量模板：

```powershell
Copy-Item .env.example .env.local
```

在启动前，将 OpenAI 兼容端点填入 `.env.local`，或稍后在 **Settings → Models** 中配置：

```bash
ARCHIMEDES_LLM_API_KEY=your-api-key
ARCHIMEDES_LLM_BASE_URL=https://api.openai.com/v1
ARCHIMEDES_LLM_MODEL=gpt-6.1 Terra
```

应用即使没有模型 key 也能打开，但聊天和智能体操作无法运行。网页搜索是可选项，使用单独的 key。

| 首次运行问题 | 修复 |
| --- | --- |
| `npm install` 后原生终端模块报错 | 运行 `npm run rebuild:native`，然后再次运行 `npm run dev`。 |
| Vite 启动后 Electron 未打开 | 检查终端输出中的端口或 Electron 错误，按 `Ctrl+C` 停止后重试。 |
| 聊天无法回答 | 检查 `.env.local` 或 Settings → Models 中的三个模型值，然后重启。 |

## 功能

- **Research Apps** —— 将文献发现、论文阅读、复现、数据分析和写作等聚焦工具放入共享工作区。目标是让研究者通过组合 Skills、MCP 工具、模型和智能体后端来自定义这些工作流。
- **文献发现与阅读** —— 浏览 Daily papers 和会议目录，在项目 library 中整理论文，并通过搜索、笔记、高亮、翻译和基于来源的讨论来阅读 PDF。
- **论文与实现** —— 在论文旁打开关联仓库和项目网站，使用复现工作流研究研究与代码、数据之间的联系。
- **分析与写作** —— 处理研究数据、准备 LaTeX 项目、编译和预览论文，并使用集成终端与工作区工具。
- **扩展与后端** —— 通过 marketplace 发现 Skills、插件和 MCP 服务器，安装受支持的 Skill 包，并为研究任务配置模型与智能体后端。支持范围和附件行为因后端而异。
- **研究上下文与来源** —— 保留项目对话、论文和来源引用，让研究者回到工作背后的上下文。实验谱系和更广泛的证据溯源仍在开发中。
- **研究记忆与协作** —— 长期经验保留和共享研究项目是持续探索的方向。

Research App 自定义，以及 Skills、MCP 工具、模型和后端的自动组合，属于产品方向；并非所有组合目前都受支持。图像生成尚未接通：Image creation 目前提供会议图表库和带脚手架的组合面板。

## 研究闭环

1. **定义** —— 从研究问题开始，在项目中收集上下文。
2. **发现与阅读** —— 查找相关工作，检查论文和图表，并记录笔记和来源引用。
3. **连接与复现** —— 检查关联代码和数据，然后在工作区中准备复现或实验。
4. **分析与写作** —— 使用分析和写作工具研究结果并撰写论文。
5. **评审与回访** —— 讨论发现、评审草稿，并回到保存的论文和对话。

长期目标是通过实验谱系和证据溯源，将问题、代码、数据、实验、结果和结论连接起来，同时保留研究经验并支持共享项目中的协作。

### 原则

- **证据优先于流畅表达。** 搜索命中、已读页面、附件文件和仓库内容始终可区分。
- **论文、代码和数据应当放在一起。** 实现证据与它所支撑的论文主张并列呈现。
- **默认本地优先。** 工作区状态保存在本地；凭据保留在 Electron 主进程。
- **重要操作需要人类批准。** 智能体提出的文件写入和 shell 命令会暂停以等待批准。
- **不伪造完整性。** 缺失的 proceedings、受限来源和不可用元数据会被明确暴露，而不是编造。

## 配置与隐私

模型提供方和搜索提供方相互独立。在应用内对话框或 `.env.local` 中配置模型；在 **Web data** 中使用 Brave、Tavily、Exa 或 Firecrawl 配置网页搜索。

- 工作区记录保存在 `.archimedes/archimedes.db`，由 Git 忽略。
- 模型凭据保存在 Electron 主进程，不会暴露给渲染进程。
- 智能体写入和 shell 命令需要明确的批准/拒绝。
- 沙箱浏览器窗口处理动态或需要登录的页面；用户直接登录。
- 应用不会绕过付费墙、私有仓库或来源权限。

## 验证

```bash
npm run prepare:desktop
npm run lint
npm run build
npm test
```

`prepare:desktop` 显式准备 Electron 二进制，三分钟超时；`check:desktop` 只检查已有二进制，不启动下载。慢网络可将 `ARCHIMEDES_DESKTOP_PREPARE_TIMEOUT_MS` 设到 600000。缺少运行时会在启动或完整测试前显示准备命令。

`npm test` 包含两项真实 Electron 布局回归，需要桌面显示环境（无显示的 Linux 可用 `xvfb-run npm test`）。`test:core` 用于非桌面测试迭代；`test:desktop` 运行两项桌面检查。完整 PR 检查仍运行 `npm test`。

## 更多

- [Authentication](docs/auth.md)
- [Artifacts](docs/artifacts.md)
- [Reproduction](docs/reproduce.md)
- [Workbench split panes](docs/workbench-split-panes.md)
- [Project, workspace and session model](docs/workspace-session-model.md)
- [Collaboration](docs/collaboration-api.md)
- [Theme tokens](docs/theme-tokens.md)

## 路线图

Archimedes 已覆盖核心研究闭环，但尚未完成。下一阶段包括持久的项目级研究记忆、更大论文集合上的语义检索、更丰富的可复现实验工具、更稳健的来源适配器，以及带有明确权限边界的插件/MCP 发现。

目标不是研究表演，而是可靠的科研伴侣：让从问题到证据再到实现的链条更容易检查、质疑和扩展。

## 社区

欢迎加入 Archimedes 微信群了解更多信息。

<img src="docs/assets/Archimedes-wechat-group.png" alt="Archimedes 微信群二维码" width="280" />

## 欢迎引用

如果 Archimedes 对你的研究有帮助，请引用：

```bibtex
@software{archimedes2026,
  title   = {Archimedes: A Local-First Research-Agent Suite},
  author  = {Weijiang Lv and Jiayu Wang and Archimedes Contributors},
  year    = {2026},
  url     = {https://github.com/Johanson-colab/Archimedes}
}
```

在 LaTeX 中，将 BibTeX 条目加入参考文献后，使用 `\cite{archimedes2026}` 引用。
