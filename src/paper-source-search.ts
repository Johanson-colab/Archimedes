export type SourceMatch = { start: number; end: number };
export type SourceMark = SourceMatch & { index: number };

// Keep offsets in the original source: lowercasing the whole document can change
// Unicode string lengths and select the wrong text in the textarea.
export function findSourceMatches(source: string, query: string): SourceMatch[] {
  if (!query) return [];
  const literal = query.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return Array.from(source.matchAll(new RegExp(literal, "giu")), (match) => ({
    start: match.index,
    end: match.index + match[0].length,
  }));
}

// Split matches at line breaks so highlights share the syntax layer's exact
// whitespace and line height, including a selection spanning multiple lines.
export function sourceMarksByLine(source: string, matches: SourceMatch[]): Map<number, SourceMark[]> {
  const result = new Map<number, SourceMark[]>();
  let line = 0;
  let start = 0;
  let end = source.indexOf("\n");
  if (end < 0) end = source.length;
  for (const [index, match] of matches.entries()) {
    while (match.start > end) {
      line += 1;
      start = end + 1;
      const next = source.indexOf("\n", start);
      end = next < 0 ? source.length : next;
    }
    let markStart = match.start;
    while (markStart < match.end) {
      if (markStart < end) {
        const marks = result.get(line) ?? [];
        marks.push({ start: markStart - start, end: Math.min(match.end, end) - start, index });
        result.set(line, marks);
      }
      if (match.end <= end) break;
      line += 1;
      start = end + 1;
      const next = source.indexOf("\n", start);
      end = next < 0 ? source.length : next;
      markStart = start;
    }
  }
  return result;
}
