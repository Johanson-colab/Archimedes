export type Dataset = { headers: string[]; rows: string[][] };

/** RFC-style delimited text, including quoted newlines and escaped quotes. */
export function parseDelimited(text: string, delimiter: string): Dataset {
  const input = text.replace(/^\uFEFF/, "");
  const records: string[][] = [];
  let row: string[] = [], cell = "", quoted = false, closed = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === '"' && cell === "" && !closed) quoted = true;
    else if (char === delimiter) { row.push(cell); cell = ""; closed = false; }
    else if (char === "\n" || char === "\r") {
      row.push(cell); records.push(row); row = []; cell = ""; closed = false;
      if (char === "\r" && input[i + 1] === "\n") i++;
    } else if (closed || char === '"') throw new Error("Malformed quoted field");
    else cell += char;
  }
  if (quoted) throw new Error("Unclosed quoted field");
  if (cell !== "" || row.length || closed) { row.push(cell); records.push(row); }
  if (!records.length) throw new Error("Empty file");
  const headers = records.shift()!.map((name, i) => name.trim() || `Column ${i + 1}`);
  if (headers.length > 200 || records.length > 100000) throw new Error("Dataset is too large");
  if (records.some((record) => record.length !== headers.length)) throw new Error("Inconsistent column count");
  if (!records.length) throw new Error("No data rows");
  return { headers, rows: records };
}

export function numericValue(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed || !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(trimmed)) return null;
  const number = Number(trimmed);
  return Number.isFinite(number) ? number : null;
}

export function summarizeColumn(rows: string[][], index: number) {
  let missing = 0, invalid = 0;
  const values: number[] = [];
  for (const row of rows) {
    const value = row[index] ?? "";
    if (!value.trim()) missing++;
    else { const number = numericValue(value); if (number === null) invalid++; else values.push(number); }
  }
  values.sort((a, b) => a - b);
  const middle = Math.floor(values.length / 2);
  const median = values.length ? values.length % 2 ? values[middle] : values[middle - 1] / 2 + values[middle] / 2 : null;
  const mean = values.length ? values.reduce((total, value) => total + value / values.length, 0) : null;
  return { missing, invalid, count: values.length, min: values[0] ?? null, max: values.at(-1) ?? null, mean, median };
}
