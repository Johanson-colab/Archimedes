import { useState } from "react";
import { formatFileTextShortcut, shortcutFromEvent } from "./file-text-size";
import { useUISettings } from "./i18n";

export default function ShortcutRecorder({
  value,
  label,
  onChange,
}: {
  value: string;
  label: string;
  onChange: (shortcut: string) => void;
}) {
  const { t } = useUISettings();
  const [recording, setRecording] = useState(false);
  const isMac = typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);
  return <button
    type="button"
    className={recording ? "shortcut-recorder recording" : "shortcut-recorder"}
    aria-label={label}
    title={label}
    onClick={() => setRecording(true)}
    onBlur={() => setRecording(false)}
    onKeyDown={(event) => {
      if (!recording) return;
      event.preventDefault();
      event.stopPropagation();
      if (event.key === "Escape") {
        setRecording(false);
        return;
      }
      const shortcut = shortcutFromEvent(event);
      if (!shortcut) return;
      onChange(shortcut);
      setRecording(false);
    }}
  >
    {recording ? <span className="shortcut-recorder-hint">{t("Press keys…")}</span> : formatFileTextShortcut(value, isMac)}
  </button>;
}
