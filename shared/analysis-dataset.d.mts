export function isMissing(value: string): boolean;
export function parseDelimited(text: string, delimiter: string): { headers: string[]; rows: string[][] };
export function numericValue(value: string): number | null;
export function summarizeColumn(rows: string[][], index: number): {
  missing: number; invalid: number; count: number; min: number | null; max: number | null; mean: number | null; median: number | null;
};
