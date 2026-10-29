function payloadRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
}

// `sequence` restarts at 1 for every turn. Journey ranges, summary coverage,
// and seen markers need one stable order across the whole thread.
export function eventOrdinal(event: ResearchEvent, index = 0): number {
  return typeof event.ordinal === "number" && event.ordinal > 0 ? event.ordinal : index + 1;
}

// A turn can fail without an `error` field: `finishResearchTurn` stores the
// failure text in an `assistant_message` with `status: "failed"`.
export function eventFailedAnswer(event: ResearchEvent): boolean {
  if (event.type !== "assistant_message") return false;
  const payload = payloadRecord(event.payload);
  const status = typeof payload.status === "string" ? payload.status.toLowerCase() : "";
  if (status === "failed" || status === "error") return true;
  return typeof payload.error === "string" && payload.error.trim().length > 0;
}

export function eventHasError(event: ResearchEvent): boolean {
  const payload = payloadRecord(event.payload);
  if (event.type.toLowerCase().includes("error")) return true;
  if (typeof payload.error === "string" && payload.error.trim().length > 0) return true;
  if (eventFailedAnswer(event)) return true;
  if (event.type === "tool_result" || event.type === "tool.result") {
    const content = payload.content;
    if (typeof content === "string") {
      try {
        const parsed = JSON.parse(content);
        if (parsed && typeof parsed === "object" && typeof parsed.error === "string" && parsed.error.trim()) return true;
      } catch { /* plain text tool output */ }
    }
  }
  return false;
}

export function latestAnswerOrdinal(events: ResearchEvent[]): number {
  let latest = 0;
  events.forEach((event, index) => {
    const order = eventOrdinal(event, index);
    if (event.type !== "assistant_message" || order <= latest) return;
    const status = payloadRecord(event.payload).status;
    if (status === undefined || status === "completed") latest = order;
  });
  return latest;
}

export function isUnresolvedError(event: ResearchEvent, latestAnswer: number, index = 0): boolean {
  return eventHasError(event) && eventOrdinal(event, index) >= latestAnswer;
}

// Journey slices a long turn into fixed-size chunks. Only the final chunk can
// be waiting for the turn's answer, and a failed answer fails that chunk
// instead of silently completing it.
export function chapterChunkStatus({ hasAnswer, hasFailure, lastInTurn, turnFailed }: {
  hasAnswer: boolean;
  hasFailure: boolean;
  lastInTurn: boolean;
  turnFailed: boolean;
}): "done" | "open" | "error" {
  if (hasFailure || (turnFailed && lastInTurn)) return "error";
  if (!lastInTurn) return "done";
  return hasAnswer ? "done" : "open";
}
