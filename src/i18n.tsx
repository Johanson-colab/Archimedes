import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Language = "en" | "zh";
export type TextSize = "smaller" | "small" | "default" | "large" | "larger";
export type InterfaceFont = "system" | "geist";
export type MonoFont = "system" | "geist-mono";
export type ChatVerbosity = "low" | "medium" | "high";

const LANGUAGE_STORAGE_KEY = "archimedes-language";
const TEXT_SIZE_STORAGE_KEY = "archimedes-text-size";
const INTERFACE_FONT_STORAGE_KEY = "archimedes-interface-font";
const MONO_FONT_STORAGE_KEY = "archimedes-mono-font";
const CHAT_VERBOSITY_STORAGE_KEY = "archimedes-chat-verbosity";
const TEXT_SCALE: Record<TextSize, number> = { smaller: 1, small: 1.05, default: 1.1, large: 1.15, larger: 1.2 };

const translations: Record<string, string> = {
  // Application chrome
  "New": "新建",
  "Files": "文件",
  "Skills": "技能",
  "Knowledge": "知识",
  "Literature library": "文献库",
  "Daily papers": "每日论文",
  "Benchmark Radar": "基准雷达",
  "Gallery": "图库",
  "Paper writing": "论文写作",
  "Visual research index": "视觉研究索引",
  "LaTeX workspace": "LaTeX 工作区",
  "Live research feed": "实时研究流",
  "Benchmark intelligence": "基准情报",
  "Artifacts": "产物",
  "Projects": "项目",
  "New project": "新建项目",
  "No chats yet": "暂无对话",
  "Create a project to begin": "创建项目以开始",
  "Archived projects": "已归档项目",
  "Archived chats": "已归档对话",
  "New research task": "新建研究任务",
  "Workspace connected": "工作区已连接",
  "Opening workspace": "正在打开工作区",
  "Ready for a new task": "可以开始新任务",
  "{count} research chats": "{count} 个研究对话",
  "Choose workspace": "选择工作区",
  "Show sidebar": "显示侧栏",
  "Hide sidebar": "隐藏侧栏",
  "Browse skills": "浏览技能",
  "Open literature library": "打开文献库",
  "Open daily papers": "打开每日论文",
  "Open Benchmark Radar": "打开基准雷达",
  "Open gallery": "打开图库",
  "Open paper writing": "打开论文写作",
  "Show workbench": "显示工作台",
  "Hide workbench": "隐藏工作台",
  "Archimedes navigation": "Archimedes 导航",
  "Primary": "主导航",
  "Resize sidebar": "调整侧栏宽度",
  "Settings": "设置",
  "Workbench": "工作台",
  "Journey": "历程",
  "Trajectory": "轨迹",
  "Terminal": "终端",
  "Agent journey": "Agent 历程",
  "Agent trajectory": "Agent 轨迹",
  "Workbench panels": "工作台面板",
  "Resize workbench": "调整工作台宽度",
  "Terminal settings": "终端设置",

  // Projects
  "Collapse project": "收起项目",
  "Expand project": "展开项目",
  "New chat in {name}": "在 {name} 中新建对话",
  "Rename {name}": "重命名 {name}",
  "Archive {name}": "归档 {name}",
  "Remove {name}": "移除 {name}",
  "Restore {name}": "恢复 {name}",
  "Archive chat": "归档对话",
  "Restore chat": "恢复对话",
  "Permanently delete chat": "永久删除对话",
  "Project name": "项目名称",
  "Could not rename project: {error}": "无法重命名项目：{error}",
  "Research workspace": "研究工作区",
  "A project groups related chats while keeping every chat history independent.": "项目用于组织相关对话，同时让每个对话的历史保持独立。",
  "Agent reliability study": "Agent 可靠性研究",
  "Cancel": "取消",
  "Create project": "创建项目",
  "Permanent action": "永久操作",
  "Remove project?": "移除项目？",
  "{name} and its {chats}, research turns, and recorded Agent actions will be permanently deleted.": "{name} 及其{chats}、研究轮次和已记录的 Agent 操作将被永久删除。",
  "Remove project": "移除项目",
  "Delete chat?": "删除对话？",
  "{title}, its research turns, recorded Agent actions, and chat history will be permanently deleted.": "{title} 及其研究轮次、已记录的 Agent 操作和对话历史将被永久删除。",
  "Delete chat": "删除对话",
  "1 chat": "1 个对话",
  "{count} chats": "{count} 个对话",

  // Settings
  "Preferences that apply across Archimedes.": "适用于整个 Archimedes 的偏好设置。",
  "General": "通用",
  "Language": "语言",
  "Choose the language for the Archimedes interface.": "选择 Archimedes 界面使用的语言。",
  "English": "English",
  "简体中文": "简体中文",
  "Text size": "文字大小",
  "Smaller": "更小",
  "Small": "小",
  "Default": "默认",
  "Large": "大",
  "Larger": "更大",
  "Text size scales the whole interface for easier reading.": "文字大小会缩放整个界面，便于阅读。",
  "Interface": "界面",
  "Conversation": "对话",
  "Fonts": "字体",
  "Folder": "文件夹",
  "Choose how Archimedes looks. System follows the operating system.": "选择 Archimedes 的外观。跟随系统会使用操作系统的设置。",
  "Used for conversation, navigation, and interface text.": "用于对话、导航与界面文字。",
  "Used for code, terminal output, and trajectory detail.": "用于代码、终端输出与轨迹详情。",
  "Journey settings": "Journey 设置",
  "View": "视图",
  "Default view": "默认视图",
  "Story": "故事",
  "Outline": "大纲",
  "Map": "地图",
  "Always": "始终",
  "Auto": "自动",
  "Off": "关闭",
  "Map threshold": "地图阈值",
  "Map chapters": "地图章节数",
  "Map steps": "地图步数",
  "chapters": "章节",
  "steps": "步",
  "or": "或",
  "Since you left": "离开期间",
  "Since your last visit": "自上次查看以来",
  "Follow live": "跟随实时",
  "Chapters": "章节",
  "Max chapters": "最大章节数",
  "Auto-merge": "自动合并",
  "Collapse completed": "折叠已完成章节",
  "Target episodes": "目标片段数",
  "episodes": "片段",
  "Summaries": "摘要",
  "Live summaries": "实时摘要",
  "Episode cadence": "片段摘要节奏",
  "events": "事件",
  "Idle delay": "静默延迟",
  "seconds": "秒",
  "Brief interval": "摘要间隔",
  "minutes": "分钟",
  "Summary length": "摘要长度",
  "Concise": "简洁",
  "Standard": "标准",
  "Detailed": "详细",
  "Summary model": "摘要模型",
  "Current chat model": "当前聊天模型",
  "Economy model · not configured": "经济模型 · 未配置",
  "Economy model becomes available after it is configured.": "配置经济模型后即可使用。",
  "Open Models": "打开模型设置",
  "Update on turn end": "回合结束时更新",
  "Update on approval or error": "审批或错误时更新",
  "Evidence and pins": "证据与固定项",
  "Evidence ledger": "证据台账",
  "Open items": "待处理项",
  "Max pinned items": "最大固定项",
  "items": "项",
  "Advanced": "高级",
  "Chapter detection": "章节检测",
  "AI": "AI",
  "Turns": "回合",
  "Summary token budget": "摘要 token 预算",
  "tokens": "tokens",
  "Reset Journey settings": "重置 Journey 设置",
  "Reset to defaults": "恢复默认值",
  "Restore every Journey option to its default. This does not delete trajectory data.": "将所有 Journey 选项恢复为默认值，不会删除轨迹数据。",
  "How the AI summarizes long runs and when the map appears.": "AI 如何总结长任务，以及何时显示地图。",
  "These settings control how much the AI summarizes and when the map appears. The current build uses a rule-based brief; the AI summarizer will use these values when it is enabled.": "这些设置控制 AI 的总结程度和地图显示时机。当前版本使用规则摘要；启用 AI 摘要后会使用这些值。",
  "Story reads like a brief. Outline is a tree for navigating long runs.": "故事像简报一样阅读；大纲以树状结构导航长任务。",
  "Open the structural map automatically when the journey gets long.": "当 Journey 变长时自动打开结构地图。",
  "Auto opens the map at whichever threshold comes first.": "自动模式在任一阈值先达到时打开地图。",
  "Show new steps, sources, and pending approvals after a break.": "离开后回来时显示新增步骤、来源和待审批项。",
  "Keep new activity below your reading position. Jump to latest when you scroll up.": "新活动留在阅读位置下方；向上滚动后可跳转到最新。",
  "Older chapters merge after this limit.": "超过此上限后合并较早的章节。",
  "Merge completed chapters instead of hiding them.": "合并已完成章节，而不是隐藏它们。",
  "Keep only the current chapter expanded.": "只展开当前章节。",
  "Used when chapter boundaries are proposed.": "在提议章节边界时使用。",
  "Update while the agent is running. Off updates only at turn end.": "Agent 运行时也更新；关闭后仅在回合结束时更新。",
  "Summarize after this many meaningful events.": "达到这么多有效事件后生成摘要。",
  "Or after this much quiet time.": "或者经过这么长的静默时间后。",
  "Refresh the top-level brief at this interval.": "按此间隔刷新顶层摘要。",
  "Controls how much detail the brief and chapters keep.": "控制摘要和章节保留多少细节。",
  "Use the active chat model or a lower-cost model.": "使用当前聊天模型或成本更低的模型。",
  "Recompute the brief when a turn completes.": "回合结束后重新计算摘要。",
  "Recompute when an approval appears or a tool fails.": "出现审批或工具失败时重新计算。",
  "Show sources, files, artifacts, and open items.": "显示来源、文件、产物和待处理项。",
  "Show approvals and errors that still need attention.": "显示仍需处理的审批和错误。",
  "Keep key chapters and episodes at the top.": "将关键章节和片段固定在顶部。",
  "AI groups by intent. Turns group by conversation turn.": "AI 按意图分组；回合按对话轮次分组。",
  "Upper bound for one summary call.": "单次摘要调用的上限。",
  "AI summaries are the next phase. These values are saved now and will drive cadence, length, and model choice.": "AI 摘要将在下一阶段启用；这些值现在会保存，并在启用后控制节奏、长度和模型。",
  "This build groups chapters by turns. AI grouping uses this setting when the summarizer is enabled.": "当前版本按回合分组；启用摘要器后，AI 分组会使用此设置。",
  "Chapter timeline": "章节时间线",
  "This session": "本次会话",
  "Jump to latest": "跳到最新",
  "All {count}": "全部 {count}",
  "Open {count}": "待处理 {count}",
  "Pinned {count}": "已固定 {count}",
  "Pinned": "已固定",
  "Pin": "固定",
  "Pin chapter": "固定章节",
  "Unpin chapter": "取消固定章节",
  "Earlier chapters ({count})": "更早的章节（{count}）",
  "Next move": "下一步",
  "View events #1–#{count}": "查看事件 #1–#{count}",
  "updated just now": "刚刚更新",
  "Brief": "摘要",
  "Evidence": "证据",
  "from this thread": "来自此对话",
  "Sources": "来源",
  "source": "个来源",
  "file": "个文件",
  "artifact": "个产物",
  "step": "步",
  "chapter": "个章节",
  "No journey yet": "还没有 Journey",
  "Journey starts after the first research turn. It will summarize what the agent read, what it produced, and what still needs review.": "第一次研究回合后开始生成 Journey，总结 Agent 读了什么、产出了什么、还有什么需要复核。",
  "Show {count} more": "再显示 {count} 个",
  "Open map": "打开地图",
  "Click a chapter to expand. Open map for the full tree.": "点击章节展开；打开地图查看完整树状结构。",
  "Journey map": "Journey 地图",
  "Research question": "研究问题",
  "Search episodes, sources, files": "搜索片段、来源、文件",
  "Search journey": "搜索 Journey",
  "Close": "关闭",
  "Chapter": "章节",
  "Episodes": "片段",
  "Select a chapter to inspect it.": "选择一个章节查看详情。",
  "No chapters match this search.": "没有匹配的章节。",
  "Click a chapter to inspect. Hover a row to see its event range.": "点击章节查看详情；悬停行可查看事件区间。",
  "Rule-based brief": "规则摘要",
  "from {count} events": "来自 {count} 个事件",
  "Waiting for review": "等待审批",
  "Running": "运行中",
  "Needs attention": "需要处理",
  "Complete": "已完成",
  "Not started": "未开始",
  "under a minute": "不到一分钟",
  "{minutes}m": "{minutes} 分钟",
  "{hours}h {minutes}m": "{hours} 小时 {minutes} 分钟",
  "{hours}h": "{hours} 小时",
  "tool call": "次工具调用",
  "new source": "个新来源",
  "new sources": "个新来源",
  "{count} approval waiting": "{count} 个审批等待中",
  "Open in Trajectory": "在轨迹中打开",
  "No research activity yet. Start a task and the journey will take shape here.": "还没有研究活动。开始一个任务后，Journey 会在这里逐步形成。",
  "This thread has {steps} across {chapters}, with {sources} and {files} touched.": "这段对话包含 {steps}，跨 {chapters}，涉及 {sources} 和 {files}。",
  "It is waiting for review on {kind} before it can continue.": "它正在等待审批：{kind}，批准后才能继续。",
  "The agent is working through the current chapter.": "Agent 正在处理当前章节。",
  "Latest response: {answer}": "最新回复：{answer}",
  "Some steps need attention before the chapter can be considered closed.": "有些步骤需要处理，章节才能算完成。",
  "a file write": "一次文件写入",
  "a command": "一条命令",
  "file write": "文件写入",
  "command": "命令",
  "Review the pending {kind}, then continue.": "查看待处理的{kind}，然后继续。",
  "Let the agent finish the current chapter, then audit the result.": "让 Agent 完成当前章节，然后检查结果。",
  "Resolve the failed step before continuing.": "先处理失败的步骤，再继续。",
  "Start a research task to build a journey.": "开始一个研究任务来生成 Journey。",
  "Audit the event range or continue with a follow-up question.": "检查事件区间，或继续提出后续问题。",
  "active": "进行中",
  "waiting": "等待中",
  "error": "错误",
  "open": "未闭合",
  "done": "已完成",
  "Open trajectory": "打开轨迹",
  "Review approval": "查看审批",
  "Dismiss": "关闭",
  "Appearance": "外观",
  "Interface theme": "界面主题",
  "Theme and fonts": "主题与字体",
  "Theme": "主题",
  "Charcoal": "炭黑",
  "System": "系统",
  "Paper": "纸张",
  "Light": "浅色",
  "Dark": "深色",
  "Follow system appearance": "跟随系统外观",
  "Use charcoal theme": "使用炭黑主题",
  "Use paper theme": "使用纸张主题",
  "Interface font": "界面字体",
  "Code font": "代码字体",
  "Geist Sans": "Geist Sans",
  "Geist Mono": "Geist Mono",
  "System mono": "系统等宽字体",
  "Geist fonts are bundled locally.": "Geist 字体已本地打包。",
  "Models": "模型",
  "Default model and providers": "默认模型与提供商",
  "Web search": "网页搜索",
  "Search provider and API keys": "搜索提供商与 API 密钥",
  "Shell, font, and external terminal": "Shell、字体与外部终端",
  "Workspace": "工作区",
  "Current folder and access": "当前文件夹与访问权限",
  "About": "关于",
  "Build information": "版本信息",
  "Version": "版本",
  "Local-first AI for research.": "本地优先的研究 AI。",
  "Current workspace": "当前工作区",
  "Change folder": "更换文件夹",
  "Open folder": "打开文件夹",
  "Workspace access is managed by the desktop app.": "工作区访问由桌面应用管理。",
  "Settings sections": "设置分区",
  "Close settings": "关闭设置",
  "Models are configured in the Models section.": "模型在“模型”分区中配置。",
  "Web search is configured in the Web search section.": "网页搜索在“网页搜索”分区中配置。",
  "Terminal preferences are configured in the Terminal section.": "终端偏好设置在“终端”分区中配置。",
  "Loading terminal settings…": "正在加载终端设置…",

  // Library and paper reader
  "Library": "文献库",
  "Original paper": "原始论文",
  "Review": "评述",
  "Coming soon": "即将推出",
  "Highlights & notes": "高亮与笔记",
  "Page {page}": "第 {page} 页",
  "Delete this highlight or note": "删除这条高亮或笔记",
  "No highlights or notes yet.": "还没有高亮或笔记。",
  "Paper chat": "论文对话",
  "Page {page} {kind}": "第 {page} 页{kind}",
  "Table": "表格",
  "Equation": "公式",
  "Image": "图片",
  "This region will be sent to AI as a high-resolution image.": "该区域将作为高清图片发送给 AI。",
  "Highlight": "高亮",
  "Translate": "翻译",
  "Comment": "评论",
  "Ask AI": "向 AI 提问",
  "Delete highlight": "删除高亮",
  "Translation": "译文",
  "Translating…": "正在翻译…",
  "Close translation": "关闭译文",
  "Highlight color": "高亮颜色",
  "Yellow": "黄色",
  "Red": "红色",
  "Blue": "蓝色",
  "Green": "绿色",
  "p. {page} selection": "第 {page} 页所选内容",
  "Rendering original PDF…": "正在渲染原始 PDF…",
  "Verify method": "核验方法",
  "Core contribution": "核心贡献",
  "Verify experiments": "核验实验",
  "Explain method": "讲解方法",
  "Gap analysis": "缺口分析",
  "View experiments": "查看实验",
  "Reproduction path": "复现路径",
  "Analyze limitations": "分析局限",
  "Ask about the selected code…": "询问所选代码…",
  "Ask about the paper…": "询问这篇论文…",
  "Remove code attachment": "移除代码附件",
  "Remove {path} code attachment": "移除 {path} 代码附件",
  "Send": "发送",
  "Stop": "停止",
  "Stopping": "正在停止",

  // Model and web settings panels
  "Loading configuration": "正在加载配置",
  "Base URL": "Base URL",
  "API key": "API key",
  "Model": "模型",
  "Model identifier": "模型标识",
  "Show available models": "显示可用模型",
  "Refresh live catalog": "刷新在线模型目录",
  "Refresh": "刷新",
  "{count} models · live catalog merged": "{count} 个模型 · 已合并在线目录",
  "{count} supported models": "{count} 个支持的模型",
  "Showing the recommended list below.": "下面显示推荐列表。",
  "No matching model. Keep typing to use a custom identifier.": "没有匹配的模型。继续输入可使用自定义标识。",
  "The API key is stored in Electron user data and never returned to the page.": "API key 存储在 Electron 用户数据中，不会返回给页面。",
  "Saved securely · enter a new key to replace": "已安全保存 · 输入新 key 可替换",
  "Enter API key": "输入 API key",
  "Test connection": "测试连接",
  "Save model": "保存模型",
  "Saved locally · enter a new key to replace": "已保存在本地 · 输入新 key 可替换",
  "Enter {provider} API key": "输入 {provider} API key",
  "Keys are stored in Electron user data and never included in Agent messages. Search queries are sent directly to the selected provider.": "密钥存储在 Electron 用户数据中，不会包含在 Agent 消息里。搜索查询会直接发送给所选提供商。",
  "Get a {provider} API key": "获取 {provider} API key",
  "{provider} key saved": "{provider} key 已保存",
  "Add a key to activate this provider": "添加 key 以启用此提供商",
  "Use {provider}": "使用 {provider}",
  "{provider} is ready for new Agent turns.": "{provider} 已可用于新的 Agent 轮次。",
  "Independent web and news index": "独立的网页与新闻索引",
  "Search optimized for research agents": "面向研究 Agent 优化的搜索",
  "Semantic search with page highlights": "带页面高亮的语义搜索",
  "Search and structured page discovery": "搜索与结构化页面发现",

  // Terminal settings
  "First terminal": "首次终端设置",
  "Workspace terminal": "工作区终端",
  "Choose your terminal": "选择终端",
  "Pick the shell Archimedes should use for new terminals. You can change this later in Terminal settings.": "选择 Archimedes 为新终端使用的 shell。之后可在终端设置中更改。",
  "Shell profile": "Shell 配置",
  "Recommended for {platform}: {shell}. Detected: {detected}": "推荐用于 {platform}：{shell}。已检测：{detected}",
  "Custom shell": "自定义 shell",
  "Font family": "字体",
  "Font size": "字号",
  "Scrollback": "回滚行数",
  "External terminal": "外部终端",
  "5,000 lines": "5,000 行",
  "10,000 lines": "10,000 行",
  "25,000 lines": "25,000 行",
  "Open the active workspace in {terminal}.": "在 {terminal} 中打开当前工作区。",
  "Opening…": "正在打开…",
  "Open external": "打开外部终端",
  "Restore recommended": "恢复推荐设置",
  "Not now": "稍后",
  "Saving…": "正在保存…",
  "Continue": "继续",
  "Auto · recommended": "自动 · 推荐",
  "Auto · login shell": "自动 · 登录 shell",
  "Custom executable": "自定义可执行文件",
  "Windows Terminal · recommended": "Windows Terminal · 推荐",
  "WezTerm": "WezTerm",
  "Ghostty · recommended": "Ghostty · 推荐",
  "Terminal.app": "Terminal.app",
  "Do not open external terminal": "不打开外部终端",
  "Explain this equation": "解释这个公式",
  "Explain this table": "解释这个表格",
  "Explain this image": "解释这张图片",
  "Open source": "打开来源",
  "Star paper": "收藏论文",
  "Unstar paper": "取消收藏",
  "Ask Archimedes": "询问 Archimedes",
  "Find in paper": "在论文中查找",
  "Find": "查找",
  "Prepare PDF": "准备 PDF",
  "Preparing…": "正在准备…",
  "Attach PDF": "附加 PDF",
  "Open the original paper": "打开原始论文",
  "The public PDF can be cached locally and opened in the reader.": "公开 PDF 可以缓存到本地，并在阅读器中打开。",
  "Attach a local PDF to open the original paper here.": "附加本地 PDF 以在此打开原始论文。",
  "Close AI panel": "关闭 AI 面板",
  "Read the full paper again": "重新通读全文",
  "Paper briefing": "论文简报",
  "Code audit": "代码核验",
  "Paper + full codebase": "论文 + 完整代码库",
  "Paper + curated repository snapshot": "论文 + 精选仓库快照",
  "Open this paper's linked project": "打开这篇论文关联的项目",
  "Open the local code audit workspace": "打开本地代码核验工作区",
  "Explain the selected passage": "解释所选段落",
  "Write a comment…": "写下评论…",
  "Save": "保存",
  "Search paper": "搜索论文",
  "Clear paper search": "清除论文搜索",
  "Previous page": "上一页",
  "Next page": "下一页",
  "Zoom out 10%": "缩小 10%",
  "Zoom in 10%": "放大 10%",
  "Reset zoom to 100%": "重置为 100%",
  "PDF zoom": "PDF 缩放",
  "Remove figure attachment": "移除图片附件",

  // Welcome
  "Start a research workflow": "开始研究工作流",
  "Choose your path": "选择你的路径",
  "Turn curiosity into questions worth testing, and evidence into answers worth trusting.": "把好奇变成值得验证的问题，把证据变成值得信任的答案。",
  "Discover ideas": "发现想法",
  "Find a research question in evidence, contradictions, and open gaps.": "从证据、矛盾与空白中寻找研究问题。",
  "Research literature": "研究文献",
  "Search papers, trace citations, and verify the evidence at the source.": "搜索论文、追踪引用，并在源头核验证据。",
  "Reproduce a paper": "复现论文",
  "Set up a faithful baseline.": "搭建忠实的基线。",
  "Generate figures": "生成图表",
  "Prepare figures with visual rigor.": "以严谨的视觉标准准备图表。",
  "Chat verbosity": "聊天详细程度",
  "Controls how much agent activity appears inline in chat.": "控制聊天区显示多少 Agent 活动细节。",
  "Low": "低",
  "Medium": "中",
  "High": "高",
  "Summary only": "仅摘要",
  "Grouped steps": "分组步骤",
  "Full detail": "完整细节",
  "Agent activity": "Agent 活动",
  "Working": "运行中",
  "Stopping task": "正在停止任务",
  "Completed": "已完成",
  "Read": "读取",
  "Search": "搜索",
  "Run": "运行",
  "Edit": "编辑",
  "Show less": "收起",
  "{count} step": "{count} 个步骤",
  "{count} steps": "{count} 个步骤",
  "{count} sources": "{count} 个来源",
};

type UISettings = {
  language: Language;
  setLanguage: (language: Language) => void;
  textSize: TextSize;
  setTextSize: (size: TextSize) => void;
  interfaceFont: InterfaceFont;
  setInterfaceFont: (font: InterfaceFont) => void;
  monoFont: MonoFont;
  setMonoFont: (font: MonoFont) => void;
  chatVerbosity: ChatVerbosity;
  setChatVerbosity: (verbosity: ChatVerbosity) => void;
  t: (key: string, values?: Record<string, string | number>) => string;
};

const UISettingsContext = createContext<UISettings | null>(null);

function readLanguage(): Language {
  if (typeof window === "undefined") return "en";
  return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) === "zh" ? "zh" : "en";
}

function readTextSize(): TextSize {
  if (typeof window === "undefined") return "default";
  const stored = window.localStorage.getItem(TEXT_SIZE_STORAGE_KEY);
  return stored === "smaller" || stored === "small" || stored === "large" || stored === "larger" ? stored : "default";
}

function readInterfaceFont(): InterfaceFont {
  if (typeof window === "undefined") return "geist";
  return window.localStorage.getItem(INTERFACE_FONT_STORAGE_KEY) === "system" ? "system" : "geist";
}

function readMonoFont(): MonoFont {
  if (typeof window === "undefined") return "geist-mono";
  return window.localStorage.getItem(MONO_FONT_STORAGE_KEY) === "system" ? "system" : "geist-mono";
}

function readChatVerbosity(): ChatVerbosity {
  if (typeof window === "undefined") return "medium";
  const stored = window.localStorage.getItem(CHAT_VERBOSITY_STORAGE_KEY);
  return stored === "low" || stored === "high" ? stored : "medium";
}

export function UISettingsProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(readLanguage);
  const [textSize, setTextSize] = useState<TextSize>(readTextSize);
  const [interfaceFont, setInterfaceFont] = useState<InterfaceFont>(readInterfaceFont);
  const [monoFont, setMonoFont] = useState<MonoFont>(readMonoFont);
  const [chatVerbosity, setChatVerbosity] = useState<ChatVerbosity>(readChatVerbosity);

  useEffect(() => {
    window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  useEffect(() => {
    window.localStorage.setItem(TEXT_SIZE_STORAGE_KEY, textSize);
    const root = document.documentElement;
    root.dataset.textSize = textSize;
    if (typeof window.researchDesk?.setUiZoom === "function") {
      root.dataset.uiZoom = "native";
      void window.researchDesk.setUiZoom(TEXT_SCALE[textSize]).catch(() => {
        root.dataset.uiZoom = "css";
      });
    } else {
      root.dataset.uiZoom = "css";
    }
  }, [textSize]);

  useEffect(() => {
    window.localStorage.setItem(INTERFACE_FONT_STORAGE_KEY, interfaceFont);
    document.documentElement.dataset.interfaceFont = interfaceFont;
  }, [interfaceFont]);

  useEffect(() => {
    window.localStorage.setItem(MONO_FONT_STORAGE_KEY, monoFont);
    document.documentElement.dataset.monoFont = monoFont;
  }, [monoFont]);

  useEffect(() => {
    window.localStorage.setItem(CHAT_VERBOSITY_STORAGE_KEY, chatVerbosity);
    document.documentElement.dataset.chatVerbosity = chatVerbosity;
  }, [chatVerbosity]);

  const t = useCallback((key: string, values?: Record<string, string | number>) => {
    const template = language === "zh" ? translations[key] ?? key : key;
    if (!values) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) => values[name] === undefined ? match : String(values[name]));
  }, [language]);

  const value = useMemo(() => ({
    language, setLanguage, textSize, setTextSize,
    interfaceFont, setInterfaceFont, monoFont, setMonoFont,
    chatVerbosity, setChatVerbosity, t,
  }), [chatVerbosity, interfaceFont, language, monoFont, t, textSize]);

  return <UISettingsContext.Provider value={value}>{children}</UISettingsContext.Provider>;
}

export function useUISettings() {
  const context = useContext(UISettingsContext);
  if (!context) throw new Error("useUISettings must be used inside UISettingsProvider.");
  return context;
}
