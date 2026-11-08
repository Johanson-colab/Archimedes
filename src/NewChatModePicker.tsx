import { useRef, useState } from "react";
import { ChevronDown, FlaskConical, MessageCircle, Puzzle } from "lucide-react";
import { MenuItem, MenuSurface } from "./Menu";
import { useUISettings } from "./i18n";
import "./new-chat-mode-picker.css";

export type NewChatMode = "standard" | "research" | "create";

export const RESEARCH_EXAMPLE = "I want to investigate the bottlenecks of recursive self-improvement (RSI) in AutoResearch. Propose a specific question that can be tested on a single GPU with a small budget—for example, whether a coding agent that repeatedly modifies a training script based on validation results can overfit the validation set and perform worse on the test set. Define the control group, evaluation metrics, and stopping conditions.";

export function draftForNewChatMode(current: string, next: NewChatMode): string {
  if (next === "research" && !current.trim()) return RESEARCH_EXAMPLE;
  if (next !== "research" && current === RESEARCH_EXAMPLE) return "";
  return current;
}

export default function NewChatModePicker({ value, onChange }: { value: NewChatMode; onChange: (mode: NewChatMode) => void }) {
  const { t } = useUISettings();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const modes = [
    { id: "standard" as const, label: t("Standard"), description: t("Ask questions and work with your research context."), icon: <MessageCircle size={15} /> },
    { id: "research" as const, label: t("Research"), description: t("Explore a research question and plan experiments."), icon: <FlaskConical size={15} /> },
    { id: "create" as const, label: t("Create"), description: t("Describe a Research App you want to create."), icon: <Puzzle size={15} /> },
  ];
  const selected = modes.find((mode) => mode.id === value) ?? modes[0];
  return <div className="new-chat-mode-picker">
    <button ref={trigger} type="button" className="new-chat-mode-trigger" aria-label={`${t("Conversation mode")}: ${selected.label}`} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((current) => !current)}>
      {selected.icon}<span>{selected.label}</span><ChevronDown size={14} />
    </button>
    <MenuSurface open={open} onClose={() => setOpen(false)} anchorRef={trigger} placement="top-start" width={340} maxWidth="calc(100vw - 24px)" className="new-chat-mode-menu" ariaLabel={t("Conversation mode")}>
      {modes.map((mode) => <MenuItem key={mode.id} checked={mode.id === value} icon={mode.icon} className="new-chat-mode-item" onClick={() => { onChange(mode.id); setOpen(false); }}>
        <strong>{mode.label}</strong><small>{mode.description}</small>
      </MenuItem>)}
    </MenuSurface>
  </div>;
}
