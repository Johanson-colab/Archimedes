/// <reference types="vite/client" />

interface Window {
  researchDesk: {
    chooseWorkspace: () => Promise<string | null>;
    openWorkspace: (workspacePath?: string) => Promise<WorkspaceSnapshot>;
    saveTask: (task: { prompt: string; response: string; status?: string }) => Promise<SavedTask>;
    runTerminal: (input: { command: string; cwd?: string }) => Promise<{ sessionId: string; commandRunId: string; workspace: string }>;
    stopTerminal: (sessionId: string) => Promise<void>;
    onTerminalData: (callback: (payload: { sessionId: string; data: string }) => void) => () => void;
  };
}

interface SavedTask {
  id: string;
  prompt: string;
  response: string;
  status: string;
  created_at: string;
}

interface WorkspaceSnapshot {
  workspace: string;
  tasks: SavedTask[];
  commands: Array<{
    id: string;
    command: string;
    cwd: string;
    status: string;
    output: string;
    exit_code: number | null;
    created_at: string;
    completed_at: string | null;
  }>;
}
