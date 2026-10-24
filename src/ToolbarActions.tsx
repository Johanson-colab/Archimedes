import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Renders module-specific actions into the shared main toolbar. Only one
 * knowledge module is active at a time, so the toolbar stays unambiguous.
 */
export default function ToolbarActions({ active = true, children }: { active?: boolean; children: ReactNode }) {
  const [slot, setSlot] = useState<HTMLElement | null>(null);

  useEffect(() => {
    setSlot(document.getElementById("module-toolbar-actions"));
  }, []);

  if (!active || !slot) return null;
  return createPortal(children, slot);
}
