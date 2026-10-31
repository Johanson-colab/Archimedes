import { useEffect, useMemo, useRef, useState } from "react";
import { Search } from "lucide-react";
import { useDialogFocus } from "./useDialogFocus";
import DialogPortal from "./DialogPortal";

export type PaletteCommand = {
  id: string;
  label: string;
  detail?: string;
  group: string;
  shortcut?: string;
  icon?: React.ReactNode;
  run: () => void;
  disabled?: boolean;
};

export default function CommandPalette({ open, commands, onClose }: {
  open: boolean;
  commands: PaletteCommand[];
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useDialogFocus<HTMLElement>(open, onClose);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelected(0);
  }, [open]);

  const filtered = useMemo(() => {
    const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
    if (!terms.length) return commands.filter((command) => !command.disabled);
    const ranking = (command: PaletteCommand) => {
      const label = command.label.toLowerCase();
      if (label === terms.join(" ")) return 0;
      if (label.startsWith(terms[0])) return 1;
      if (label.split(/\s+/).some((word) => word.startsWith(terms[0]))) return 2;
      if (terms.every((term) => label.includes(term))) return 3;
      const detail = `${command.detail ?? ""} ${command.group}`.toLowerCase();
      return terms.every((term) => detail.includes(term)) ? 4 : Number.POSITIVE_INFINITY;
    };
    return commands
      .map((command, order) => ({ command, order, score: ranking(command) }))
      .filter((entry) => entry.score !== Number.POSITIVE_INFINITY)
      .sort((left, right) => left.score - right.score || left.order - right.order)
      .map((entry) => entry.command);
  }, [commands, query]);

  useEffect(() => {
    setSelected((current) => Math.min(current, Math.max(0, filtered.length - 1)));
  }, [filtered.length]);

  useEffect(() => {
    const item = listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`);
    item?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  if (!open) return null;

  function run(index: number) {
    const command = filtered[index];
    if (!command || command.disabled) return;
    onClose();
    command.run();
  }

  const groups = filtered.reduce<Array<{ name: string; items: Array<{ command: PaletteCommand; index: number }> }>>((result, command, index) => {
    const group = result.find((candidate) => candidate.name === command.group);
    if (group) group.items.push({ command, index });
    else result.push({ name: command.group, items: [{ command, index }] });
    return result;
  }, []);

  return <DialogPortal><div className="command-palette-backdrop app-dialog-overlay" role="presentation" onMouseDown={onClose}>
    <section ref={dialogRef} tabIndex={-1} className="command-palette app-dialog app-dialog-md app-dialog-palette" role="dialog" aria-modal="true" aria-label="Command palette" onMouseDown={(event) => event.stopPropagation()}>
      <div className="command-palette-search"><Search size={16} /><input autoFocus value={query} onChange={(event) => { setQuery(event.target.value); setSelected(0); }} placeholder="Search commands, pages, and panels" aria-label="Search commands" onKeyDown={(event) => {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          setSelected((current) => Math.min(current + 1, filtered.length - 1));
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          setSelected((current) => Math.max(current - 1, 0));
        }
        if (event.key === "Enter") {
          event.preventDefault();
          run(selected);
        }
      }} /></div>
      <div className="command-palette-list" ref={listRef}>
        {groups.map((group) => <div className="command-palette-group" key={group.name}>
          <div className="command-palette-group-label">{group.name}</div>
          {group.items.map(({ command, index }) => <button key={command.id} data-index={index} className={index === selected ? "command-palette-item active" : "command-palette-item"} onMouseEnter={() => setSelected(index)} onClick={() => run(index)} disabled={command.disabled}>
            {command.icon && <span className="command-palette-icon">{command.icon}</span>}
            <span className="command-palette-copy"><strong>{command.label}</strong>{command.detail && <small>{command.detail}</small>}</span>
            {command.shortcut && <kbd>{command.shortcut}</kbd>}
          </button>)}
        </div>)}
        {!filtered.length && <div className="command-palette-empty">No matching commands.</div>}
      </div>
      <footer className="command-palette-footer"><span><kbd>↑</kbd><kbd>↓</kbd> navigate</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span></footer>
    </section>
  </div></DialogPortal>;
}
