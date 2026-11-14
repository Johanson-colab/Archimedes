import type { ReactNode } from "react";
import { FolderOpen, Globe2, LayoutPanelTop, Orbit, Palette, Puzzle, Server, SlidersHorizontal, Sparkle, UserRound } from "lucide-react";

export type SettingsSectionId =
  | "general"
  | "appearance"
  | "account"
  | "workbench"
  | "research-aids"
  | "models"
  | "plugins"
  | "workspace"
  | "web"
  | "ssh";

/** Legacy ids remain valid entry points so existing deep links keep working. */
export type SettingsSectionAlias = "journey" | "terminal" | "proactive" | "members" | "about";

export type SettingsSection = SettingsSectionId | SettingsSectionAlias;

export type SettingsGroupId = "personal" | "research" | "connections";

export type SettingsSubview = {
  id: string;
  label: string;
};

export type SettingsSectionDefinition = {
  id: SettingsSectionId;
  label: string;
  description: string;
  group: SettingsGroupId;
  icon: ReactNode;
  /** Modules with more than one panel get an in-page tab strip. */
  subviews?: SettingsSubview[];
};

export const SETTINGS_GROUPS: Array<{ id: SettingsGroupId; label: string }> = [
  { id: "personal", label: "Personal" },
  { id: "research", label: "Research" },
  { id: "connections", label: "Connections" },
];

export const SETTINGS_SECTIONS: SettingsSectionDefinition[] = [
  {
    id: "general",
    label: "General",
    description: "Interface, conversation, and build information",
    group: "personal",
    icon: <SlidersHorizontal size={15} />,
  },
  {
    id: "appearance",
    label: "Appearance",
    description: "Theme, typography, and component styles",
    group: "personal",
    icon: <Palette size={15} />,
  },
  {
    id: "account",
    label: "Account",
    description: "Local identity and cloud account",
    group: "personal",
    icon: <UserRound size={15} />,
  },
  {
    id: "workbench",
    label: "Workbench",
    description: "Tabs, terminal, and research path",
    group: "research",
    icon: <LayoutPanelTop size={15} />,
    subviews: [
      { id: "layout", label: "Layout" },
      { id: "terminal", label: "Terminal" },
      { id: "research-path", label: "Research path" },
    ],
  },
  {
    id: "research-aids",
    label: "Research aids",
    description: "Proactive suggestions and conversation tools",
    group: "research",
    icon: <Sparkle size={15} />,
    subviews: [
      { id: "proactive", label: "Proactive agent" },
      { id: "comments", label: "Comments" },
      { id: "snapshots", label: "Snapshots" },
    ],
  },
  {
    id: "models",
    label: "Models",
    description: "API providers and local harnesses",
    group: "research",
    icon: <Orbit size={15} />,
  },
  {
    id: "plugins",
    label: "Research Apps",
    description: "Manage research apps by category and choose which ones appear in your sidebar.",
    group: "research",
    icon: <Puzzle size={15} />,
  },
  {
    id: "workspace",
    label: "Workspace",
    description: "Folder, access, and project members",
    group: "research",
    icon: <FolderOpen size={15} />,
    subviews: [
      { id: "folder", label: "Folder" },
      { id: "members", label: "Members" },
    ],
  },
  {
    id: "web",
    label: "Web search",
    description: "Search provider and API keys",
    group: "connections",
    icon: <Globe2 size={15} />,
  },
  {
    id: "ssh",
    label: "SSH servers",
    description: "Machines a reproduction can run on",
    group: "connections",
    icon: <Server size={15} />,
  },
];

const SECTION_IDS = new Set<string>(SETTINGS_SECTIONS.map((section) => section.id));

const ALIASES: Record<SettingsSectionAlias, { section: SettingsSectionId; subview?: string }> = {
  journey: { section: "workbench", subview: "research-path" },
  terminal: { section: "workbench", subview: "terminal" },
  proactive: { section: "research-aids", subview: "proactive" },
  members: { section: "workspace", subview: "members" },
  about: { section: "general" },
};

export function isSettingsSectionId(value: unknown): value is SettingsSectionId {
  return typeof value === "string" && SECTION_IDS.has(value);
}

/** Resolve a legacy deep link to its current module and subview. */
export function resolveSettingsLocation(section: SettingsSection): { section: SettingsSectionId; subview?: string } {
  if (isSettingsSectionId(section)) return { section };
  return ALIASES[section as SettingsSectionAlias] ?? { section: "general" };
}

export function settingsSectionDefinition(section: SettingsSectionId): SettingsSectionDefinition {
  return SETTINGS_SECTIONS.find((item) => item.id === section) ?? SETTINGS_SECTIONS[0];
}

export function defaultSettingsSubview(section: SettingsSectionId): string | undefined {
  return settingsSectionDefinition(section).subviews?.[0]?.id;
}

export function settingsNavGroups(): Array<{ id: SettingsGroupId; label: string; sections: SettingsSectionDefinition[] }> {
  return SETTINGS_GROUPS
    .map((group) => ({ ...group, sections: SETTINGS_SECTIONS.filter((section) => section.group === group.id) }))
    .filter((group) => group.sections.length > 0);
}
