export type ChapterMergeBatch = { start: number; end: number };

// Auto-merge keeps the recent chapters readable and groups the rest into
// several batches instead of flattening every early chunk into one giant
// chapter. The total stays at or below `maxChapters`.
export function planChapterMerges(count: number, maxChapters: number): { keepFrom: number; batches: ChapterMergeBatch[] } {
  if (count <= 0) return { keepFrom: 0, batches: [] };
  const limit = Math.max(1, Math.floor(maxChapters) || 1);
  if (count <= limit) return { keepFrom: count, batches: [] };
  if (limit === 1) return { keepFrom: count, batches: [{ start: 0, end: count }] };
  const keep = Math.min(5, limit - 1);
  const batchSlots = Math.max(1, limit - keep);
  const early = count - keep;
  const size = Math.max(1, Math.ceil(early / batchSlots));
  const batches: ChapterMergeBatch[] = [];
  for (let start = 0; start < early; start += size) {
    batches.push({ start, end: Math.min(early, start + size) });
  }
  return { keepFrom: early, batches };
}
