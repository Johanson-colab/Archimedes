function payloadRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload) ? payload as Record<string, unknown> : {};
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

export function latestAnswerSequence(events: ResearchEvent[]): number {
  let latest = 0;
  for (const event of events) {
    if (event.type !== "assistant_message" || event.sequence <= latest) continue;
    const status = payloadRecord(event.payload).status;
    if (status === undefined || status === "completed") latest = event.sequence;
  }
  return latest;
}

export function isUnresolvedError(event: ResearchEvent, latestAnswer: number): boolean {
  return eventHasError(event) && event.sequence >= latestAnswer;
}
