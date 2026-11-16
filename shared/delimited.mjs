/** RFC-style delimited text, including quoted newlines and escaped quotes. */
export function parseDelimited(text, delimiter) {
  const input = text.replace(/^\uFEFF/, "");
  const records = [];
  let row = [], cell = "", quoted = false, closed = false;
  for (let i = 0; i < input.length; i++) {
    const char = input[i];
    if (quoted) {
      if (char === '"' && input[i + 1] === '"') { cell += '"'; i++; }
      else if (char === '"') { quoted = false; closed = true; }
      else cell += char;
    } else if (char === '"' && cell === "" && !closed) quoted = true;
    else if (char === delimiter) { row.push(cell); if (row.length >= 200) throw new Error("Dataset is too large"); cell = ""; closed = false; }
    else if (char === "\n" || char === "\r") {
      row.push(cell); records.push(row); row = []; cell = ""; closed = false;
      if (records.length > 100001) throw new Error("Dataset is too large");
      if (char === "\r" && input[i + 1] === "\n") i++;
    } else if (closed || char === '"') throw new Error("Malformed quoted field");
    else cell += char;
  }
  if (quoted) throw new Error("Unclosed quoted field");
  if (cell !== "" || row.length || closed) { row.push(cell); records.push(row); }
  if (!records.length) throw new Error("Empty file");
  const headers = records.shift().map((name, i) => name.trim() || `Column ${i + 1}`);
  if (headers.length > 200 || records.length > 100000) throw new Error("Dataset is too large");
  if (records.some((record) => record.length !== headers.length)) throw new Error("Inconsistent column count");
  if (!records.length) throw new Error("No data rows");
  return { headers, rows: records };
}
