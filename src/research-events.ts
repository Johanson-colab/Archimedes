// Events are append-only. A poll that returns the same tail does not need a
// new array or a timeline re-render.
export function sameResearchEventList(left: ResearchEvent[], right: ResearchEvent[]) {
  if (left === right) return true;
  if (left.length !== right.length) return false;
  if (!left.length) return true;
  const current = left[left.length - 1];
  const next = right[right.length - 1];
  return current.id === next.id && current.sequence === next.sequence && current.created_at === next.created_at;
}
