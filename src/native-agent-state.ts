// Native snapshots are bounded and keyed by item ID, never by display title.
export function mergeNativeEvent(events: ResearchEvent[], event: AgentEvent): ResearchEvent[] {
  const key = `${event.turnId}:${event.type}:${event.activity?.id ?? "latest"}`;
  const payload = { activity: event.activity, usage: event.usage, plan: event.plan, diff: event.diff };
  const next: ResearchEvent = { id: key, turn_id: event.turnId || "", sequence: events.length + 1, type: event.type, payload, created_at: new Date().toISOString() };
  return [...events.filter((item) => item.id !== key), next].slice(-256);
}

export function nativeTurnEvents(events: ResearchEvent[]): ResearchEvent[] {
  const turnId = events.at(-1)?.turn_id;
  return events.filter((event) => event.turn_id === turnId && event.type.startsWith("native_"));
}

export function nativeUsage(events: ResearchEvent[]): NativeAgentUsage | null {
  const event = [...events].reverse().find((item) => item.type === "native_usage");
  const usage = (event?.payload as { usage?: NativeAgentUsage | null } | undefined)?.usage;
  if (!usage || !Number.isFinite(usage.totalTokens) || usage.totalTokens < 0) return null;
  return usage;
}

export function updateNativeQuestions(current: Array<{ threadId: string; question: NativeAgentQuestion }>, event: AgentEvent): Array<{ threadId: string; question: NativeAgentQuestion }> {
  if (event.type === "native_question" && event.question && event.threadId) return [...current.filter((item) => item.question.id !== event.question!.id), { threadId: event.threadId, question: event.question }].slice(-20);
  if (event.type === "native_question_resolved") return current.filter((item) => item.question.id !== event.questionId);
  return current;
}
