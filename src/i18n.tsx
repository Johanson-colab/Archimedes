import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Language = "en" | "zh";
export type TextSize = "small" | "default" | "large";
export type InterfaceFont = "system" | "geist";
export type MonoFont = "system" | "geist-mono";
export type ChatVerbosity = "low" | "medium" | "high";

const LANGUAGE_STORAGE_KEY = "archimedes-language";
const TEXT_SIZE_STORAGE_KEY = "archimedes-text-size";
const INTERFACE_FONT_STORAGE_KEY = "archimedes-interface-font";
const MONO_FONT_STORAGE_KEY = "archimedes-mono-font";
const CHAT_VERBOSITY_STORAGE_KEY = "archimedes-chat-verbosity";
const TEXT_SCALE: Record<TextSize, number> = { small: 1, default: 1.1, large: 1.2 };

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

  // Agent journey and trajectory
  "User request": "用户请求",
  "Answer": "回答",
  "Agent step": "Agent 步骤",
  "Tool call": "工具调用",
  "Tool result": "工具结果",
  "Source evidence": "来源证据",
  "Context compacted": "上下文已压缩",
  "Request": "请求",
  "Frame the task and success criteria": "明确任务与成功标准",
  "Context": "上下文",
  "Read files, sources, and workspace state": "读取文件、来源与工作区状态",
  "Tools": "工具",
  "Run reads, edits, searches, and commands": "执行读取、编辑、搜索与命令",
  "Synthesis": "综合",
  "Assemble evidence into a response": "将证据组织成回答",
  "Return the result with traceable steps": "返回带有可追溯步骤的结果",
  "Needs attention": "需要关注",
  "On track": "进展正常",
  "Current goal": "当前目标",
  "A concise, derived view of what the agent has done and what comes next.": "简要呈现 Agent 已完成的工作和接下来的步骤。",
  "{percent}% derived progress": "推算进度 {percent}%",
  "{count} raw events": "{count} 个原始事件",
  "Phase map": "阶段图",
  "Signals": "指标",
  "Raw events": "原始事件",
  "Tool calls": "工具调用",
  "Files touched": "涉及文件",
  "Turns": "轮次",
  "Recent milestones": "近期里程碑",
  "View raw": "查看原始记录",
  "from trajectory event #{sequence}": "来自轨迹事件 #{sequence}",
  "No milestones yet": "暂无里程碑",
  "Open risk": "待处理风险",
  "{count} errors recorded in the raw trajectory.": "原始轨迹中记录了 {count} 个错误。",
  "No errors recorded in the current trajectory.": "当前轨迹中没有记录错误。",
  "Derived from {count} raw events": "由 {count} 个原始事件推导",
  "Open trajectory": "打开轨迹",
  "Session": "会话",
  "Session ID": "会话 ID",
  "Mode": "模式",
  "Status": "状态",
  "Messages": "消息",
  "Events": "事件",
  "Provider": "供应商",
  "Created": "创建时间",
  "Updated": "更新时间",
  "Session summary": "会话摘要",
  "Copy all raw events": "复制全部原始事件",
  "Copied": "已复制",
  "Copy JSON": "复制 JSON",
  "Collapse all events": "收起全部事件",
  "Expand all events": "展开全部事件",
  "Collapse all": "全部收起",
  "Expand all": "全部展开",
  "turn": "轮次",
  "Copy this event": "复制此事件",
  "Full payload includes {count} top-level fields.": "完整载荷包含 {count} 个顶层字段。",
  "No raw events yet": "暂无原始事件",
  "Run a research turn to inspect the complete agent trajectory.": "运行一次研究对话后即可查看完整 Agent 轨迹。",
  "Open Journey": "打开历程",
  "running": "运行中",

  // Provider settings
  "Agent runtime": "Agent 运行环境",
  "Model providers": "模型供应商",
  "Choose the model Archimedes uses for new research turns.": "选择 Archimedes 在新研究对话中使用的模型。",
  "Close model settings": "关闭模型设置",
  "Model settings": "模型设置",
  "Agent tools": "Agent 工具",
  "Web data": "网页数据",
  "Choose the search service Archimedes uses. Your own API key stays on this device.": "选择 Archimedes 使用的搜索服务。你的 API key 仅保存在本设备。",
  "Close web data settings": "关闭网页数据设置",
  "Web data providers": "网页数据供应商",
  "Web search settings": "网页搜索设置",

  // Literature library
  "Knowledge base": "知识库",
  "Curated research directions with searchable, reusable paper records.": "按研究方向整理可搜索、可复用的论文记录。",
  "New library": "新建文献库",
  "papers": "篇论文",
  "All libraries": "全部文献库",
  "Edit library": "编辑文献库",
  "Delete library": "删除文献库",
  "Import paper": "导入论文",
  "Search title, author, abstract, or venue": "搜索标题、作者、摘要或会议期刊",
  "No matching papers": "没有匹配的论文",
  "Import a paper or change the search query.": "请导入论文或修改搜索条件。",
  "Select a paper to inspect its record.": "选择一篇论文以查看其记录。",
  "Research paper": "研究论文",
  "Year unknown": "年份未知",
  "Unstar": "取消收藏",
  "Star": "收藏",
  "Authors unavailable": "暂无作者信息",
  "New literature library": "新建文献库",
  "Library name": "文献库名称",
  "Description": "描述",
  "What belongs in this research direction?": "这个研究方向应收录哪些内容？",
  "Library color": "文献库颜色",
  "Create library": "创建文献库",
  "Save changes": "保存更改",
  "Import into {name}": "导入到 {name}",
  "Find academic papers": "查找学术论文",
  "Search by title, topic, DOI, arXiv URL, or arXiv ID. arXiv links are resolved directly; other queries use Semantic Scholar and OpenAlex.": "可按标题、主题、DOI、arXiv 链接或 arXiv ID 搜索。arXiv 链接会直接解析，其他查询使用 Semantic Scholar 和 OpenAlex。",
  "e.g. adaptive retrieval or 2401.18059": "例如：自适应检索或 2401.18059",
  "n.d.": "日期未知",
  "Added": "已添加",
  "Adding": "正在添加",
  "Add": "添加",
  "Delete {name}? Papers shared with other libraries are kept.": "删除{name}？与其他文献库共享的论文会保留。",
  "Remove {name} from this library?": "从此文献库移除{name}？",
  "AI Agents & Tool Use": "AI Agent 与工具使用",
  "Agent architectures, tool use, computer interfaces, and reliable environment interaction.": "Agent 架构、工具使用、计算机交互与可靠的环境操作。",
  "Reasoning & Test-Time Scaling": "推理与测试时扩展",
  "Process supervision, reasoning models, inference-time compute, and efficient deliberation.": "过程监督、推理模型、推理时计算与高效思考。",
  "RAG & Long Context": "RAG 与长上下文",
  "Retrieval-augmented generation, hierarchical indexing, adaptive retrieval, and long-context readers.": "检索增强生成、分层索引、自适应检索与长上下文阅读。",
  "Embodied AI & VLA": "具身智能与 VLA",
  "Vision-language-action models, generalist robot policies, and embodied reasoning in 3D environments.": "视觉—语言—动作模型、通用机器人策略与三维环境中的具身推理。",
  "Unclassified": "未分类",
  "Oral": "口头报告",
  "Spotlight": "亮点报告",
  "Poster": "海报",
  "Official conference record": "会议官方记录",
  "No abstract was returned by the metadata provider.": "元数据服务未返回摘要。",
  "Reading status": "阅读状态",
  "Unread": "未读",
  "Reading": "阅读中",
  "Read (status)": "已读",
  "Open reading workspace": "打开阅读工作区",
  "Notes, evidence, and paper structure": "笔记、证据与论文结构",
  "My notes": "我的笔记",
  "Why is this paper useful? What should you verify?": "这篇论文有什么价值？还需要核查什么？",
  "Remove": "移除",
  "Save notes": "保存笔记",

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
  "Small": "小",
  "Default": "默认",
  "Large": "大",
  "Text size scales the whole interface for easier reading.": "文字大小会缩放整个界面，便于阅读。",
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
  "Close": "关闭",
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
  "Project": "项目",
  "Codebase": "代码库",

  // Evidence review
  "Evidence review": "证据评述",
  "Read the paper against its own record.": "让论文接受自身证据的检验。",
  "Four independent readings are audited for evidence before one concise research memorandum is written.": "四个独立的评述 Agent 会先接受证据核验，再汇总为一份简明的研究备忘录。",
  "Run review": "开始评述",
  "Review again": "重新评述",
  "Reviewing": "正在评述",
  "Prepare the paper first": "请先准备论文",
  "The review agents need the locally indexed PDF so their findings can point back to the original pages.": "评述 Agent 需要已在本地建立索引的 PDF，才能让结论准确回溯到原始页码。",
  "Choose a workspace first": "请先选择工作区",
  "A workspace keeps this review and its supporting source reads inside Archimedes.": "工作区会将本次评述及其引用的原文读取记录保存在 Archimedes 中。",
  "Review process": "评述流程",
  "Independent readings": "独立评述",
  "Evidence audit": "证据核验",
  "Research memorandum": "研究备忘录",
  "Awaiting run": "等待开始",
  "In progress": "进行中",
  "Checking": "正在核验",
  "Pending": "等待处理",
  "Ready": "已就绪",
  "Drafting": "正在撰写",
  "Specialist readings": "专项评述",
  "Related work": "相关工作",
  "Method": "研究方法",
  "Experiments": "实验分析",
  "Limitations": "局限性",
  "Places the claimed contribution among its closest cited predecessors.": "将论文声称的贡献放回最接近的引用工作中定位。",
  "Reconstructs the mechanism, assumptions, and implementation dependencies.": "重构方法机制、前提假设与实现依赖。",
  "Tests whether the reported evidence is sufficient for each central claim.": "核验实验记录是否足以支持每一项核心主张。",
  "Locates scope boundaries, failure modes, and the next falsification test.": "识别适用边界、失败模式与下一项可证伪测试。",
  "Idle": "未开始",
  "Error": "错误",
  "Waiting for the complete PDF review to begin.": "等待开始完整 PDF 评述。",
  "Reading source pages and preparing a page-cited assessment…": "正在阅读原文并准备带页码引用的评估…",
  "Read evidence note": "查看证据笔记",
  "Read repaired evidence note": "查看修订后的证据笔记",
  "One note, with the uncertainty left in.": "一份保留不确定性的研究笔记。",
  "Run the review to collect independent readings before Archimedes writes the final memorandum.": "先运行评述并收集独立结论，Archimedes 随后会撰写最终备忘录。",
  "The evidence audit will check citations, overclaims, and disagreements before synthesis.": "证据核验会在汇总前检查引用、过度主张与意见分歧。",
  "Ready for a source-grounded review.": "已准备好进行基于原文证据的评述。",
  "Four independent readings are starting from the indexed original PDF.": "四个独立评述 Agent 正在读取已建立索引的原始 PDF。",
  "The evidence audit will begin after the independent readings finish.": "独立评述结束后将开始证据核验。",
  "Related work, method, experiments, and limitations are reading the source in parallel.": "相关工作、研究方法、实验分析和局限性 Agent 正在并行阅读原文。",
  "This reading could not be completed. Try again after checking the model connection.": "这项评述未能完成。请检查模型连接后重试。",
  "Checking the original PDF for page-cited evidence.": "正在从原始 PDF 中核查带页码引用的证据。",
  "An independent evidence note is ready.": "一份独立证据笔记已完成。",
  "Checking citations, overclaims, and conflicts before synthesis.": "正在汇总前检查引用、过度主张与结论冲突。",
  "Targeted specialist notes are being checked against the PDF again.": "正在针对原始 PDF 重新核查指定的专项笔记。",
  "Combining audited evidence while retaining uncertainty and disagreements.": "正在合并已核验的证据，同时保留不确定性与分歧。",
  "The evidence-audited review is ready to read.": "经过证据核验的评述已可阅读。",
  "The review memorandum is ready. Open any reading to inspect its evidence trail.": "评述备忘录已完成。展开任一专项评述即可检查其证据链。",
  "{reason} A targeted repair was completed for {targets}.": "{reason} 已针对{targets}完成定向修订。",
  " and ": "和",

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
  "Reading research context": "正在读取研究上下文",
  "Working": "运行中",
  "Stopping task": "正在停止任务",
  "Completed": "已完成",
  "Read": "读取",
  "Search": "搜索",
  "Run": "运行",
  "Edit": "编辑",
  "Show {count} more": "再显示 {count} 个",
  "Show less": "收起",
  "{count} step": "{count} 个步骤",
  "{count} steps": "{count} 个步骤",
  "{count} sources": "{count} 个来源",

  // Research journey and composer
  "Research progress": "研究进度",
  "Research path": "研究路径",
  "AI routed": "AI 自动编排",
  "Review checkpoint": "审核检查点",
  "Conversation": "对话",
  "Ideas": "研究想法",
  "Writing": "写作",
  "Needs revalidation": "需要重新核验",
  "Accepted": "已接受",
  "Running": "运行中",
  "Current focus": "当前阶段",
  "Planned": "计划中",
  "Next checkpoint": "下一个检查点",
  "Research brief": "研究简报",
  "Idea candidate": "候选想法",
  "Claims & evidence": "主张与证据",
  "Manuscript": "论文稿件",
  "Submission decision": "投稿决策",
  "Frame the question, constraints, evidence needs, and available resources.": "明确研究问题、约束条件、证据需求与可用资源。",
  "Ground a falsifiable idea in literature and check its closest prior work.": "基于文献形成可证伪的想法，并核查最接近的已有工作。",
  "Design, run, diagnose, and accept only the claims supported by results.": "设计、运行并诊断实验，只接受结果能够支持的主张。",
  "Turn accepted claims and evidence into a traceable paper draft.": "将已接受的主张与证据写成可追溯的论文草稿。",
  "Audit novelty, evidence, reproducibility, and presentation before release.": "发布前核验创新性、证据、可复现性与表达质量。",
  "Accept & advance": "接受并进入下一阶段",
  "Request changes": "要求修改",
  "Create branch": "创建分支",
  "Return here": "返回此阶段",
  "{checkpoint} accepted. Archimedes will route new work toward {stage}.": "已接受“{checkpoint}”。Archimedes 会将后续工作转向“{stage}”。",
  "{checkpoint} accepted. Research cycle complete.": "已接受“{checkpoint}”。本轮研究流程已完成。",
  "Revise the current {checkpoint}. Preserve the accepted evidence, explain what changed, and prepare a new checkpoint for review.": "修改当前的“{checkpoint}”。保留已接受的证据，说明修改内容，并准备新的检查点供审核。",
  "Created branch B{branch} from {stage}. The accepted branch remains available.": "已从“{stage}”创建分支 B{branch}，原已接受的分支仍会保留。",
  "Returned to {stage}. Downstream accepted work is preserved and marked stale until revalidated.": "已返回“{stage}”。下游已接受的工作会被保留，并在重新核验前标记为过期。",
  "Show {count} earlier {unit}": "显示更早的 {count} 条{unit}",
  "message": "消息",
  "messages": "消息",
  "File write requires approval": "写入文件需要批准",
  "Command requires approval": "运行命令需要批准",
  "This will write a file inside the selected workspace.": "此操作会在所选工作区内写入文件。",
  "This will run in the selected workspace and record its output.": "此操作会在所选工作区中运行命令并记录输出。",
  "Dismiss": "拒绝",
  "Apply": "应用",
  "Jump to latest message": "跳到最新消息",
  "Latest": "最新",
  "Cut": "剪切",
  "Copy": "复制",
  "Paste": "粘贴",
  "Thinking effort": "思考强度",
  "Thinking effort: {effort}": "思考强度：{effort}",
  "Thinking effort is not exposed by this model": "此模型未开放思考强度设置",
  "Unavailable": "不可用",
  "Context length": "上下文长度",
  "Standard": "标准",
  "Extra Long": "超长",
  "No workspace": "未选择工作区",
  "Estimated context usage: {percent}%": "预计上下文用量：{percent}%",
  "Archimedes can make mistakes. Review sources and workspace changes.": "Archimedes 可能会出错，请核查来源和工作区变更。",
  "You": "你",
  "Sources read by Archimedes": "Archimedes 读取的来源",
  "Ask anything or start a conversation...": "输入问题或开始对话…",
  "Describe a topic, observation, or open question...": "描述一个主题、观察或开放问题…",
  "Describe the hypothesis or experiment you want to build...": "描述你想验证的假设或搭建的实验…",
  "What section or argument would you like to write?": "你想撰写哪个章节或论点？",
  "What paper or draft would you like to review?": "你想评述哪篇论文或草稿？",
  "Add context": "添加上下文",
  "Back": "返回",
  "Local file": "本地文件",
  "Attach one or more files": "附加一个或多个文件",
  "Local folder": "本地文件夹",
  "Give Archimedes access to a folder": "允许 Archimedes 访问一个文件夹",
  "Add papers from your collections": "从你的文献收藏中添加论文",
  "Plugins": "插件",
  "Attach an installed plugin": "附加已安装的插件",
  "Attach research instructions": "附加研究指令",
  "Loading...": "正在加载…",
  "Papers": "论文",
  "{count} papers": "{count} 篇论文",
  "No literature libraries yet.": "还没有文献库。",
  "Search saved papers": "搜索已保存的论文",
  "Saved paper": "已保存的论文",
  "No matching papers.": "没有匹配的论文。",
  "Search {type}": "搜索{type}",
  "No matching {type} found.": "没有找到匹配的{type}。",
  "Attached context": "已附加的上下文",
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
  return stored === "small" || stored === "large" ? stored : "default";
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
