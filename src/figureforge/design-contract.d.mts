export type DesignContractPanel = { name: string; role: string; x: number; y: number; w: number; h: number };

export type DesignContract = {
  version: number;
  layout: string;
  panels: DesignContractPanel[];
  elements: string;
  palette: { background: string; primary: string; accent: string; neutral: string; others: string[] };
  typography: { title: number; panelHeader: number; label: number; note: number };
  strokes: { box: number; arrow: number; connector: number };
  density: { panels: number; modulesPerPanel: number; connectors: number };
  hierarchy: string;
  caveats: string;
};

export const CONTRACT_VERSION: number;
export function emptyDesignContract(): DesignContract;
export function normalizeDesignContract(raw: unknown): DesignContract;
export function contractIsUsable(contract: DesignContract | null | undefined): boolean;
export function renderDesignContract(contract: DesignContract | null | undefined): string;
export function renderImageGuide(contract: DesignContract | null | undefined): string;
