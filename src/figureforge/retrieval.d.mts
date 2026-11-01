export type RetrievalFigure = { id: string; title: string; image: string; venue: string; year: number; pattern: string; paper: string; authors: string[]; tier?: string; award?: string };
export type RetrievalIndex = {
  data: { figs: RetrievalFigure[]; ids: string[]; IE: Float32Array | null; TE: Float32Array | null };
  index: unknown;
  version: string;
  loadEmbeddings(): Promise<void>;
};
export function loadRetrievalIndex(options?: { fetchImpl?: typeof fetch; root?: string; signal?: AbortSignal }): Promise<RetrievalIndex>;
export function searchRetrievalIndex(index: RetrievalIndex, query: string, candidates?: number[] | null, vector?: number[] | Float32Array | null): Array<{ figure: RetrievalFigure; score: number | null; reason?: string }>;
export function prepareSemanticQuery(index: RetrievalIndex, query: string): string;
