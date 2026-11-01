import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { app as appStrings } from "./i18n/translations/app";
import { library as libraryStrings } from "./i18n/translations/library";
import { gallery as galleryStrings } from "./i18n/translations/gallery";
import { figureforge as figureforgeStrings } from "./i18n/translations/figureforge";
import { canvas as canvasStrings } from "./i18n/translations/canvas";
import { composer as composerStrings } from "./i18n/translations/composer";
import { agent as agentStrings } from "./i18n/translations/agent";
import { journey as journeyStrings } from "./i18n/translations/journey";
import { settings as settingsStrings } from "./i18n/translations/settings";
import { collab as collabStrings } from "./i18n/translations/collab";
import { reproduce as reproduceStrings } from "./i18n/translations/reproduce";
import { writing as writingStrings } from "./i18n/translations/writing";
import { misc as miscStrings } from "./i18n/translations/misc";

export type Language = "en" | "zh";
export type TextSize = "smaller" | "small" | "default" | "large" | "larger";
export type InterfaceFont = "system" | "geist";
export type MonoFont = "system" | "geist-mono";
export type FileIconStyle = "city-lights" | "material" | "seti" | "monochrome";
export type ChatVerbosity = "low" | "medium" | "high";

const LANGUAGE_STORAGE_KEY = "archimedes-language";
const TEXT_SIZE_STORAGE_KEY = "archimedes-text-size";
const INTERFACE_FONT_STORAGE_KEY = "archimedes-interface-font";
const MONO_FONT_STORAGE_KEY = "archimedes-mono-font";
const FILE_ICON_STYLE_STORAGE_KEY = "archimedes-file-icon-style";
const CHAT_VERBOSITY_STORAGE_KEY = "archimedes-chat-verbosity";
export const TEXT_SIZE_SCALE: Record<TextSize, number> = { smaller: 0.8, small: 0.9, default: 1, large: 1.1, larger: 1.2 };

const translations: Record<string, string> = {
  ...appStrings,
  ...libraryStrings,
  ...galleryStrings,
  ...figureforgeStrings,
  ...canvasStrings,
  ...composerStrings,
  ...agentStrings,
  ...journeyStrings,
  ...settingsStrings,
  ...collabStrings,
  ...reproduceStrings,
  ...writingStrings,
  ...miscStrings,
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

function readFileIconStyle(): FileIconStyle {
  if (typeof window === "undefined") return "city-lights";
  const stored = window.localStorage.getItem(FILE_ICON_STYLE_STORAGE_KEY);
  return stored === "monochrome" || stored === "material" || stored === "seti" ? stored : "city-lights";
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
  const [fileIconStyle, setFileIconStyle] = useState<FileIconStyle>(readFileIconStyle);
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
      void window.researchDesk.setUiZoom(TEXT_SIZE_SCALE[textSize]).catch(() => {
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
    window.localStorage.setItem(FILE_ICON_STYLE_STORAGE_KEY, fileIconStyle);
    document.documentElement.dataset.fileIcons = fileIconStyle;
  }, [fileIconStyle]);

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
    fileIconStyle, setFileIconStyle,
    chatVerbosity, setChatVerbosity, t,
  }), [chatVerbosity, fileIconStyle, interfaceFont, language, monoFont, t, textSize]);

  return <UISettingsContext.Provider value={value}>{children}</UISettingsContext.Provider>;
}

export function useUISettings() {
  const context = useContext(UISettingsContext);
  if (!context) throw new Error("useUISettings must be used inside UISettingsProvider.");
  return context;
}
