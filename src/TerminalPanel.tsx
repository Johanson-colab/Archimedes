import { useCallback, useEffect, useRef, useState } from "react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import { Plus, SquareTerminal, X } from "lucide-react";
import "@xterm/xterm/css/xterm.css";

type TerminalTab = TerminalSessionInfo & {
  title: string;
  status: "running" | "exited";
};

type TerminalPanelProps = {
  bridge: ResearchDeskBridge;
  open: boolean;
  workspace: string;
  height: number;
  onHeightChange: (height: number) => void;
  onClose: () => void;
};

export default function TerminalPanel({ bridge, open, workspace, height, onHeightChange, onClose }: TerminalPanelProps) {
  const [tabs, setTabs] = useState<TerminalTab[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const creatingRef = useRef(false);
  const tabsRef = useRef<TerminalTab[]>([]);

  useEffect(() => {
    tabsRef.current = tabs;
  }, [tabs]);

  useEffect(() => () => {
    for (const tab of tabsRef.current) void bridge.closeTerminal(tab.sessionId).catch(() => undefined);
  }, [bridge]);

  const createTerminal = useCallback(async () => {
    if (creatingRef.current) return;
    creatingRef.current = true;
    try {
      const info = await bridge.createTerminal({ cwd: workspace, cols: 100, rows: 24 });
      const tab: TerminalTab = { ...info, title: info.shell, status: "running" };
      setTabs((current) => [...current, tab]);
      setActiveSessionId(info.sessionId);
    } finally {
      creatingRef.current = false;
    }
  }, [bridge, workspace]);

  useEffect(() => {
    if (open && tabs.length === 0) void createTerminal();
  }, [createTerminal, open, tabs.length]);

  async function closeTab(sessionId: string) {
    const currentIndex = tabs.findIndex((tab) => tab.sessionId === sessionId);
    const nextTabs = tabs.filter((tab) => tab.sessionId !== sessionId);
    setTabs(nextTabs);
    await bridge.closeTerminal(sessionId).catch(() => undefined);

    if (activeSessionId === sessionId) {
      const nextActive = nextTabs[Math.min(currentIndex, nextTabs.length - 1)];
      setActiveSessionId(nextActive?.sessionId ?? null);
    }
    if (nextTabs.length === 0) onClose();
  }

  function startResize(event: React.PointerEvent<HTMLDivElement>) {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = height;
    const onPointerMove = (pointerEvent: PointerEvent) => {
      const maximum = Math.max(220, window.innerHeight - 190);
      onHeightChange(Math.max(160, Math.min(maximum, startHeight + startY - pointerEvent.clientY)));
    };
    const onPointerUp = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      document.body.classList.remove("terminal-resizing");
    };
    document.body.classList.add("terminal-resizing");
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
  }

  return <section className={open ? "smart-terminal open" : "smart-terminal"} aria-label="Terminal panel">
    <div className="terminal-resize-handle" onPointerDown={startResize} title="Drag to resize terminal"><span /></div>
    <div className="smart-terminal-tabs">
      <div className="terminal-tab-list" role="tablist" aria-label="Terminal sessions">
        {tabs.map((tab, index) => <div className={activeSessionId === tab.sessionId ? "terminal-tab active" : "terminal-tab"} key={tab.sessionId}>
          <button className="terminal-tab-select" onClick={() => setActiveSessionId(tab.sessionId)} role="tab" aria-selected={activeSessionId === tab.sessionId} title={tab.workspace}>
            <SquareTerminal size={13} />
            <span>{tab.title || `Terminal ${index + 1}`}</span>
            {tab.status === "exited" && <i>exited</i>}
          </button>
          <button className="terminal-tab-close" onClick={() => void closeTab(tab.sessionId)} title={`Close ${tab.title}`}><X size={12} /></button>
        </div>)}
      </div>
      <button className="new-terminal-button" onClick={() => void createTerminal()} title="New terminal"><Plus size={15} /></button>
      <span className="terminal-workspace-label">{workspace.split("/").filter(Boolean).at(-1) || "Workspace"}</span>
      <button className="close-terminal-panel" onClick={onClose} title="Close bottom panel"><X size={15} /></button>
    </div>
    <div className="terminal-surfaces">
      {tabs.map((tab) => <TerminalSurface
        key={tab.sessionId}
        bridge={bridge}
        session={tab}
        active={tab.sessionId === activeSessionId}
        panelOpen={open}
        onTitle={(title) => setTabs((current) => current.map((candidate) => candidate.sessionId === tab.sessionId ? { ...candidate, title } : candidate))}
        onExit={() => setTabs((current) => current.map((candidate) => candidate.sessionId === tab.sessionId ? { ...candidate, status: "exited" } : candidate))}
      />)}
    </div>
  </section>;
}

function TerminalSurface({ bridge, session, active, panelOpen, onTitle, onExit }: {
  bridge: ResearchDeskBridge;
  session: TerminalTab;
  active: boolean;
  panelOpen: boolean;
  onTitle: (title: string) => void;
  onExit: () => void;
}) {
  const hostRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const activeRef = useRef(active);
  const panelOpenRef = useRef(panelOpen);
  const onTitleRef = useRef(onTitle);
  const onExitRef = useRef(onExit);

  useEffect(() => { activeRef.current = active; }, [active]);
  useEffect(() => { panelOpenRef.current = panelOpen; }, [panelOpen]);
  useEffect(() => { onTitleRef.current = onTitle; }, [onTitle]);
  useEffect(() => { onExitRef.current = onExit; }, [onExit]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const terminal = new Terminal({
      allowProposedApi: false,
      cursorBlink: true,
      cursorStyle: "bar",
      fontFamily: '"SFMono-Regular", "SF Mono", Menlo, Monaco, Consolas, monospace',
      fontSize: 12,
      fontWeight: "400",
      lineHeight: 1.22,
      macOptionIsMeta: true,
      scrollback: 5000,
      theme: {
        background: "#f8f8f6",
        foreground: "#30302d",
        cursor: "#24755a",
        cursorAccent: "#f8f8f6",
        selectionBackground: "#cfe2da",
        black: "#343430",
        red: "#b84d4d",
        green: "#267357",
        yellow: "#977025",
        blue: "#356fa3",
        magenta: "#8055a6",
        cyan: "#267885",
        white: "#d9d9d4",
        brightBlack: "#7a7a74",
        brightRed: "#d05a56",
        brightGreen: "#318b68",
        brightYellow: "#b8872d",
        brightBlue: "#4786bd",
        brightMagenta: "#9869bd",
        brightCyan: "#3594a0",
        brightWhite: "#ffffff",
      },
    });
    const fitAddon = new FitAddon();
    terminal.loadAddon(fitAddon);
    terminal.open(host);
    terminalRef.current = terminal;
    fitAddonRef.current = fitAddon;

    const fit = () => {
      if (!activeRef.current || !panelOpenRef.current || host.clientWidth === 0 || host.clientHeight === 0) return;
      try {
        fitAddon.fit();
        bridge.resizeTerminal(session.sessionId, terminal.cols, terminal.rows);
      } catch {
        // Geometry can briefly be zero while switching or closing tabs.
      }
    };
    const inputDisposable = terminal.onData((data) => bridge.writeTerminal(session.sessionId, data));
    const titleDisposable = terminal.onTitleChange((title) => {
      const normalized = title.trim();
      if (normalized) onTitleRef.current(normalized.length > 42 ? `${normalized.slice(0, 39)}...` : normalized);
    });
    const unsubscribeData = bridge.onPtyData(({ sessionId, data }) => {
      if (sessionId === session.sessionId) terminal.write(data);
    });
    const unsubscribeExit = bridge.onPtyExit(({ sessionId, exitCode }) => {
      if (sessionId !== session.sessionId) return;
      terminal.write(`\r\n\x1b[90m[Process exited with code ${exitCode}]\x1b[0m\r\n`);
      onExitRef.current();
    });
    const resizeObserver = new ResizeObserver(() => fit());
    resizeObserver.observe(host);

    window.requestAnimationFrame(() => {
      fit();
      void bridge.readyTerminal(session.sessionId);
      if (activeRef.current && panelOpenRef.current) terminal.focus();
    });

    return () => {
      resizeObserver.disconnect();
      unsubscribeData();
      unsubscribeExit();
      inputDisposable.dispose();
      titleDisposable.dispose();
      terminal.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [bridge, session.sessionId]);

  useEffect(() => {
    if (!active || !panelOpen) return;
    window.requestAnimationFrame(() => {
      try {
        fitAddonRef.current?.fit();
        const terminal = terminalRef.current;
        if (terminal) {
          bridge.resizeTerminal(session.sessionId, terminal.cols, terminal.rows);
          terminal.focus();
        }
      } catch {
        // The panel may still be finishing its layout transition.
      }
    });
  }, [active, bridge, panelOpen, session.sessionId]);

  return <div className={active ? "terminal-surface active" : "terminal-surface"} ref={hostRef} />;
}
