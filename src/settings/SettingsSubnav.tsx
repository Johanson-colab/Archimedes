import { useRef, type KeyboardEvent } from "react";
import { useUISettings } from "../i18n";
import type { SettingsSubview } from "./registry";

export default function SettingsSubnav({ items, value, onChange, label }: {
  items: SettingsSubview[];
  value: string;
  onChange: (value: string) => void;
  label: string;
}) {
  const { t } = useUISettings();
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const activeIndex = items.findIndex((item) => item.id === value);

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const current = Math.max(0, activeIndex);
    let next = -1;
    if (event.key === "ArrowRight") next = current >= items.length - 1 ? 0 : current + 1;
    else if (event.key === "ArrowLeft") next = current <= 0 ? items.length - 1 : current - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = items.length - 1;
    if (next < 0) return;
    event.preventDefault();
    buttons.current[next]?.focus();
    onChange(items[next].id);
  }

  return <div className="settings-subnav" role="tablist" aria-label={label} onKeyDown={onKeyDown}>
    {items.map((item, index) => <button
      key={item.id}
      ref={(element) => { buttons.current[index] = element; }}
      type="button"
      role="tab"
      aria-selected={item.id === value}
      tabIndex={item.id === value || (activeIndex === -1 && index === 0) ? 0 : -1}
      className={item.id === value ? "active" : ""}
      onClick={() => onChange(item.id)}
    >{t(item.label)}</button>)}
  </div>;
}
