export type SessionCommentAnchor = {
  type: "session-position";
  version: 1;
  y: number;
  messageId?: string;
  offset?: number;
  fraction?: number;
};
export type MessagePosition = { id: string; top: number; height: number };

export function readSessionCommentAnchor(raw: unknown): SessionCommentAnchor | null {
  const value = raw && typeof raw === "object" && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  if (value.type !== "session-position" || value.version !== 1 || typeof value.y !== "number" || !Number.isFinite(value.y) || value.y < 0) return null;
  return {
    type: "session-position", version: 1, y: Math.min(value.y, 10_000_000),
    messageId: typeof value.messageId === "string" ? value.messageId : undefined,
    offset: typeof value.offset === "number" && Number.isFinite(value.offset) ? Math.max(0, value.offset) : undefined,
    fraction: typeof value.fraction === "number" && Number.isFinite(value.fraction) ? Math.min(1, Math.max(0, value.fraction)) : undefined,
  };
}

export function captureSessionCommentAnchor(y: number, messages: MessagePosition[]): SessionCommentAnchor {
  const safeY = Math.max(0, Math.min(10_000_000, Number.isFinite(y) ? y : 0));
  const message = messages.find((entry) => safeY >= entry.top && safeY <= entry.top + entry.height)
    ?? [...messages].reverse().find((entry) => entry.top <= safeY);
  const offset = message ? safeY - message.top : undefined;
  return {
    type: "session-position", version: 1, y: safeY,
    messageId: message?.id, offset,
    fraction: message && offset !== undefined && offset <= message.height && message.height > 0 ? offset / message.height : undefined,
  };
}

export function sessionCommentY(anchor: SessionCommentAnchor, messages: MessagePosition[], height: number, historyComplete = false): number | null {
  const message = anchor.messageId ? messages.find((entry) => entry.id === anchor.messageId) : undefined;
  // A missing message may be in paginated history: do not pin it to an unrelated message.
  if (anchor.messageId && !message && !historyComplete) return null;
  const y = message ? message.top + (anchor.fraction !== undefined ? anchor.fraction * message.height : anchor.offset ?? 0) : anchor.y;
  return Math.max(0, Math.min(y, Math.max(0, height - 24)));
}
