import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Language = "en" | "zh";
export type TextSize = "small" | "default" | "large";
export type InterfaceFont = "system" | "geist";
export type MonoFont = "system" | "geist-mono";

const LANGUAGE_STORAGE_KEY = "archimedes-language";
const TEXT_SIZE_STORAGE_KEY = "archimedes-text-size";
const INTERFACE_FONT_STORAGE_KEY = "archimedes-interface-font";
const MONO_FONT_STORAGE_KEY = "archimedes-mono-font";
const TEXT_SCALE: Record<TextSize, number> = { small: .9, default: 1, large: 1.1 };

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

export function UISettingsProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(readLanguage);
  const [textSize, setTextSize] = useState<TextSize>(readTextSize);
  const [interfaceFont, setInterfaceFont] = useState<InterfaceFont>(readInterfaceFont);
  const [monoFont, setMonoFont] = useState<MonoFont>(readMonoFont);

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

  const t = useCallback((key: string, values?: Record<string, string | number>) => {
    const template = language === "zh" ? translations[key] ?? key : key;
    if (!values) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) => values[name] === undefined ? match : String(values[name]));
  }, [language]);

  const value = useMemo(() => ({
    language, setLanguage, textSize, setTextSize,
    interfaceFont, setInterfaceFont, monoFont, setMonoFont, t,
  }), [interfaceFont, language, monoFont, t, textSize]);

  return <UISettingsContext.Provider value={value}>{children}</UISettingsContext.Provider>;
}

export function useUISettings() {
  const context = useContext(UISettingsContext);
  if (!context) throw new Error("useUISettings must be used inside UISettingsProvider.");
  return context;
}
