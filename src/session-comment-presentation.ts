/** Keep the summary rail proportional to the conversation pane, not the window. */
export function sessionCommentSummaryWidth(paneWidth: number) {
  return Math.max(64, Math.min(220, Math.floor(paneWidth * .22)));
}

/** CSS ellipsis chooses the visible character count using actual glyph widths. */
export function sessionCommentSummary(body: string) {
  return body.replace(/\s+/g, " ").trim();
}

export function sessionCommentPopoverPoint(point: { x: number; y: number }, bounds: { left: number; right: number; top: number; bottom: number }, width: number, height = 184, anchorHeight = 0) {
  const gap = 8;
  const x = Math.max(bounds.left + gap, Math.min(point.x + gap, bounds.right - width - gap));
  const below = point.y + anchorHeight + gap;
  const y = below + height <= bounds.bottom - gap ? below : point.y - height - gap;
  return { x, y: Math.max(bounds.top + gap, Math.min(y, bounds.bottom - height - gap)) };
}
