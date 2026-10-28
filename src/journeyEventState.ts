function payloadRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
}

// `sequence` restarts at 1 for every turn. Journey ranges, summary coverage,
// and seen markers need one stable order across the whole thread.
export function eventOrdinal(event: ResearchEvent, index = 0): number {
  return typeof event.ordinal === "number" && event.ordinal > 0 ? event.ordinal : index + 1;
}

export function eventHasError(event: ResearchEvent): boolean {
  const payload = payloadRecord(event.payload);
  if (event.type.toLowerCase().includes("error")) return true;
  if (typeof payload.error === "string" && payload.error.trim().length > 0) return true;
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
