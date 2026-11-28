import { researchAppsRuntime as researchAppsRuntimeStrings } from "./i18n/translations/researchAppsRuntime";
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { benchmarkRadar as benchmarkRadarStrings } from "./i18n/translations/benchmarkRadar";
import { app as appStrings } from "./i18n/translations/app";
import { library as libraryStrings } from "./i18n/translations/library";
import { gallery as galleryStrings } from "./i18n/translations/gallery";
import { figureforge as figureforgeStrings } from "./i18n/translations/figureforge";
import { canvas as canvasStrings } from "./i18n/translations/canvas";
import { composer as composerStrings } from "./i18n/translations/composer";
import { conversation as conversationStrings } from "./i18n/translations/conversation";
import { agent as agentStrings } from "./i18n/translations/agent";
import { journey as journeyStrings } from "./i18n/translations/journey";
import { settings as settingsStrings } from "./i18n/translations/settings";
import { runtime as runtimeStrings } from "./i18n/translations/runtime";
import { collab as collabStrings } from "./i18n/translations/collab";
import { reproduce as reproduceStrings } from "./i18n/translations/reproduce";
import { writing as writingStrings } from "./i18n/translations/writing";
import { misc as miscStrings } from "./i18n/translations/misc";
import { native as nativeStrings } from "./i18n/translations/native";
import { news as newsStrings } from "./i18n/translations/news";
import { paperReview as paperReviewStrings } from "./i18n/translations/paperReview";
import { paperSlides as paperSlidesStrings } from "./i18n/translations/paperSlides";
import { dataAnalysis as dataAnalysisStrings } from "./i18n/translations/dataAnalysis";
import {
  DEFAULT_FILE_TEXT_SHORTCUTS,
  FILE_TEXT_SIZE_DEFAULT,
  clampFileTextSize,
  type FileTextShortcuts,
} from "./file-text-size";
import { session as sessionStrings } from "./i18n/translations/session";
import { sidebarFooter as sidebarFooterStrings } from "./i18n/translations/sidebarFooter";
import { sessionComments as sessionCommentsStrings } from "./i18n/translations/sessionComments";
import { sessionSnapshot as sessionSnapshotStrings } from "./i18n/translations/sessionSnapshot";
import { researchGraph as researchGraphStrings } from "./i18n/translations/researchGraph";

export type Language = "en" | "zh";
export type TextSize = "smaller" | "small" | "default" | "large" | "larger";
export type InterfaceFont = "system" | "geist";
export type MonoFont = "system" | "geist-mono";
export type FileIconStyle = "opencode" | "city-lights" | "material" | "seti" | "outline" | "monochrome" | "minimal";
export type ChatVerbosity = "low" | "medium" | "high";

const LANGUAGE_STORAGE_KEY = "archimedes-language";
const TEXT_SIZE_STORAGE_KEY = "archimedes-text-size";
const INTERFACE_FONT_STORAGE_KEY = "archimedes-interface-font";
const MONO_FONT_STORAGE_KEY = "archimedes-mono-font";
const FILE_ICON_STYLE_STORAGE_KEY = "archimedes-file-icon-style";
const FILE_ICON_STYLE_VERSION_KEY = "archimedes-file-icon-style-version";
const CHAT_VERBOSITY_STORAGE_KEY = "archimedes-chat-verbosity";
const FILE_TEXT_SIZE_STORAGE_KEY = "archimedes-file-text-size";
const FILE_TEXT_SHORTCUTS_STORAGE_KEY = "archimedes-file-text-shortcuts";
export const TEXT_SIZE_SCALE: Record<TextSize, number> = { smaller: 0.8, small: 0.9, default: 1, large: 1.1, larger: 1.2 };

const translations: Record<string, string> = {
  ...researchAppsRuntimeStrings,
  ...sessionCommentsStrings,
  ...sessionSnapshotStrings,
  ...researchGraphStrings,
  ...appStrings,
  ...benchmarkRadarStrings,
  ...libraryStrings,
  ...galleryStrings,
  ...figureforgeStrings,
  ...canvasStrings,
  ...composerStrings,
  ...conversationStrings,
  ...agentStrings,
  ...journeyStrings,
  ...settingsStrings,
  ...runtimeStrings,
  ...collabStrings,
  ...reproduceStrings,
  ...writingStrings,
  ...miscStrings,
  ...nativeStrings,
  ...newsStrings,
  ...paperReviewStrings,
  ...dataAnalysisStrings,
  ...paperSlidesStrings,
  ...sessionStrings,
  ...sidebarFooterStrings,
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
  fileIconStyle: FileIconStyle;
  setFileIconStyle: (style: FileIconStyle) => void;
  chatVerbosity: ChatVerbosity;
  setChatVerbosity: (verbosity: ChatVerbosity) => void;
  fileTextSize: number;
  setFileTextSize: (size: number) => void;
  increaseFileTextSize: () => void;
  decreaseFileTextSize: () => void;
  resetFileTextSize: () => void;
  fileTextShortcuts: FileTextShortcuts;
  setFileTextShortcut: (action: keyof FileTextShortcuts, shortcut: string) => void;
  resetFileTextShortcuts: () => void;
  t: (key: string, values?: Record<string, string | number>) => string;
};

const UISettingsContext = createContext<UISettings | null>(null);

// User interface preferences are optional when browser storage is blocked or full.
export const displayPreferenceStorage = {
  getItem(key: string): string | null {
    try { return window.localStorage.getItem(key); } catch { return null; }
  },
  setItem(key: string, value: string) {
    try { window.localStorage.setItem(key, value); } catch { /* Keep the in-memory preference. */ }
  },
  removeItem(key: string) {
    try { window.localStorage.removeItem(key); } catch { /* Keep the in-memory preference. */ }
  },
};

function readLanguage(): Language {
  return displayPreferenceStorage.getItem(LANGUAGE_STORAGE_KEY) === "zh" ? "zh" : "en";
}

function readTextSize(): TextSize {
  const stored = displayPreferenceStorage.getItem(TEXT_SIZE_STORAGE_KEY);
  return stored === "smaller" || stored === "small" || stored === "large" || stored === "larger" ? stored : "default";
}

function readInterfaceFont(): InterfaceFont {
  return displayPreferenceStorage.getItem(INTERFACE_FONT_STORAGE_KEY) === "system" ? "system" : "geist";
}

function readMonoFont(): MonoFont {
  return displayPreferenceStorage.getItem(MONO_FONT_STORAGE_KEY) === "system" ? "system" : "geist-mono";
}

function readFileIconStyle(): FileIconStyle {
  const stored = displayPreferenceStorage.getItem(FILE_ICON_STYLE_STORAGE_KEY);
  if (displayPreferenceStorage.getItem(FILE_ICON_STYLE_VERSION_KEY) !== "3") {
    displayPreferenceStorage.setItem(FILE_ICON_STYLE_VERSION_KEY, "3");
    if (!stored || stored === "city-lights" || stored === "badges") {
      displayPreferenceStorage.setItem(FILE_ICON_STYLE_STORAGE_KEY, "opencode");
      return "opencode";
    }
  }
  return stored === "city-lights" || stored === "monochrome" || stored === "material" || stored === "seti" || stored === "outline" || stored === "minimal" ? stored : "opencode";
}

function readChatVerbosity(): ChatVerbosity {
  const stored = displayPreferenceStorage.getItem(CHAT_VERBOSITY_STORAGE_KEY);
  return stored === "low" || stored === "high" ? stored : "medium";
}

function readFileTextSize() {
  const stored = displayPreferenceStorage.getItem(FILE_TEXT_SIZE_STORAGE_KEY);
  if (stored === null) return FILE_TEXT_SIZE_DEFAULT;
  return clampFileTextSize(Number(stored));
}

function readFileTextShortcuts(): FileTextShortcuts {
  try {
    const stored = JSON.parse(displayPreferenceStorage.getItem(FILE_TEXT_SHORTCUTS_STORAGE_KEY) ?? "null") as Partial<FileTextShortcuts> | null;
    return {
      increase: typeof stored?.increase === "string" ? stored.increase : DEFAULT_FILE_TEXT_SHORTCUTS.increase,
      decrease: typeof stored?.decrease === "string" ? stored.decrease : DEFAULT_FILE_TEXT_SHORTCUTS.decrease,
      reset: typeof stored?.reset === "string" ? stored.reset : DEFAULT_FILE_TEXT_SHORTCUTS.reset,
    };
  } catch {
    return DEFAULT_FILE_TEXT_SHORTCUTS;
  }
}

export function UISettingsProvider({ children }: { children: React.ReactNode }) {
  const [language, setLanguage] = useState<Language>(readLanguage);
  const [textSize, setTextSize] = useState<TextSize>(readTextSize);
  const [interfaceFont, setInterfaceFont] = useState<InterfaceFont>(readInterfaceFont);
  const [monoFont, setMonoFont] = useState<MonoFont>(readMonoFont);
  const [fileIconStyle, setFileIconStyle] = useState<FileIconStyle>(readFileIconStyle);
  const [chatVerbosity, setChatVerbosity] = useState<ChatVerbosity>(readChatVerbosity);
  const [fileTextSize, setFileTextSizeState] = useState(readFileTextSize);
  const [fileTextShortcuts, setFileTextShortcutsState] = useState<FileTextShortcuts>(readFileTextShortcuts);

  useEffect(() => {
    displayPreferenceStorage.setItem(LANGUAGE_STORAGE_KEY, language);
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  useEffect(() => {
    displayPreferenceStorage.setItem(TEXT_SIZE_STORAGE_KEY, textSize);
    const root = document.documentElement;
    root.dataset.textSize = textSize;
    if (typeof window.researchDesk?.setUiZoom === "function") {
      root.dataset.uiZoom = "native";
      void window.researchDesk.setUiZoom(TEXT_SIZE_SCALE[textSize]).catch(() => {
        root.dataset.uiZoom = "css";
      });
    } else {
      root.dataset.uiZoom = "css";
    }
  }, [textSize]);

  useEffect(() => {
    displayPreferenceStorage.setItem(INTERFACE_FONT_STORAGE_KEY, interfaceFont);
    document.documentElement.dataset.interfaceFont = interfaceFont;
  }, [interfaceFont]);

  useEffect(() => {
    displayPreferenceStorage.setItem(MONO_FONT_STORAGE_KEY, monoFont);
    document.documentElement.dataset.monoFont = monoFont;
  }, [monoFont]);

  useEffect(() => {
    displayPreferenceStorage.setItem(FILE_ICON_STYLE_STORAGE_KEY, fileIconStyle);
    document.documentElement.dataset.fileIcons = fileIconStyle;
  }, [fileIconStyle]);

  useEffect(() => {
    displayPreferenceStorage.setItem(CHAT_VERBOSITY_STORAGE_KEY, chatVerbosity);
    document.documentElement.dataset.chatVerbosity = chatVerbosity;
  }, [chatVerbosity]);

  useEffect(() => {
    displayPreferenceStorage.setItem(FILE_TEXT_SIZE_STORAGE_KEY, String(fileTextSize));
  }, [fileTextSize]);

  useEffect(() => {
    displayPreferenceStorage.setItem(FILE_TEXT_SHORTCUTS_STORAGE_KEY, JSON.stringify(fileTextShortcuts));
  }, [fileTextShortcuts]);

  const setFileTextSize = useCallback((size: number) => setFileTextSizeState(clampFileTextSize(size)), []);
  const increaseFileTextSize = useCallback(() => setFileTextSizeState((size) => clampFileTextSize(size + 1)), []);
  const decreaseFileTextSize = useCallback(() => setFileTextSizeState((size) => clampFileTextSize(size - 1)), []);
  const resetFileTextSize = useCallback(() => setFileTextSizeState(FILE_TEXT_SIZE_DEFAULT), []);
  const setFileTextShortcut = useCallback((action: keyof FileTextShortcuts, shortcut: string) => {
    setFileTextShortcutsState((current) => ({ ...current, [action]: shortcut }));
  }, []);
  const resetFileTextShortcuts = useCallback(() => setFileTextShortcutsState(DEFAULT_FILE_TEXT_SHORTCUTS), []);

  const t = useCallback((key: string, values?: Record<string, string | number>) => {
    const template = language === "zh" ? translations[key] ?? key : key;
    if (!values) return template;
    return template.replace(/\{(\w+)\}/g, (match, name: string) => values[name] === undefined ? match : String(values[name]));
  }, [language]);

  const value = useMemo(() => ({
    language, setLanguage, textSize, setTextSize,
    interfaceFont, setInterfaceFont, monoFont, setMonoFont,
    fileIconStyle, setFileIconStyle,
    chatVerbosity, setChatVerbosity,
    fileTextSize, setFileTextSize, increaseFileTextSize, decreaseFileTextSize, resetFileTextSize,
    fileTextShortcuts, setFileTextShortcut, resetFileTextShortcuts,
    t,
  }), [chatVerbosity, decreaseFileTextSize, fileIconStyle, fileTextShortcuts, fileTextSize, increaseFileTextSize, interfaceFont, language, monoFont, resetFileTextShortcuts, resetFileTextSize, setFileTextShortcut, setFileTextSize, t, textSize]);

  return <UISettingsContext.Provider value={value}>{children}</UISettingsContext.Provider>;
}

export function useUISettings() {
  const context = useContext(UISettingsContext);
  if (!context) throw new Error("useUISettings must be used inside UISettingsProvider.");
  return context;
}
