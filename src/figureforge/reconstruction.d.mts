export type FigureScene = { canvas: { width: number; height: number }; nodes: Array<Record<string, unknown>> };
export function normalizeReconstruction(raw: { width: number; height: number; nodes: unknown[] }, cropImage: (rect: { x: number; y: number; w: number; h: number }) => Promise<string>): Promise<FigureScene>;
export function sceneToSvg(scene: FigureScene): string;
