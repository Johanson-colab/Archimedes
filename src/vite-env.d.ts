/// <reference types="vite/client" />

interface Window {
  researchDesk: {
    chooseWorkspace: () => Promise<string | null>;
    runTerminal: (input: { command: string; cwd?: string }) => Promise<{ sessionId: string }>;
    stopTerminal: (sessionId: string) => Promise<void>;
    onTerminalData: (callback: (payload: { sessionId: string; data: string }) => void) => () => void;
  };
}
