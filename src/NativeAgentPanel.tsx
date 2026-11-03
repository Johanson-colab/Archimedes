import { useState } from "react";
import { ChevronDown, Terminal, Wrench } from "lucide-react";
import { useUISettings } from "./i18n";
import { nativeTurnEvents } from "./native-agent-state";
import "./native-agent.css";

export default function NativeAgentPanel({ events, busy }: { events: ResearchEvent[]; busy: boolean }) {
  const { t } = useUISettings();
  const snapshots = nativeTurnEvents(events);
  const activities = new Map<string, NativeAgentActivity>();
  let plan: NativeAgentPlan | undefined;
  let diff: string | undefined;
  for (const event of snapshots) {
    const payload = event.payload as { activity?: NativeAgentActivity; plan?: NativeAgentPlan; diff?: string };
    if (payload.activity) activities.set(payload.activity.id, payload.activity);
    if (payload.plan) plan = payload.plan;
    if (typeof payload.diff === "string") diff = payload.diff;
  }
  if (!activities.size && !plan && !diff) return null;
  return <section className="native-agent-panel" aria-label={t("Codex activity")}>
    <details open className="native-activity-card">
      <summary><Wrench size={13} /><strong>{t("Codex activity")}</strong><span>{activities.size} {t("steps")}</span><ChevronDown size={13} /></summary>
      <div className="native-activity-list">{[...activities.values()].map((activity) => <details key={activity.id} className={`native-activity-item ${activity.status}`}>
        <summary><Terminal size={13} /><span className="native-activity-title">{activity.title}</span><span className="native-activity-detail">{activity.detail}</span><small>{t(activity.status === "running" && !busy ? "Interrupted" : activity.status === "running" ? "Running" : activity.status === "failed" ? "Failed" : activity.status === "interrupted" ? "Interrupted" : "Completed")}</small></summary>
        <pre>{activity.output || activity.detail}</pre>
      </details>)}</div>
    </details>
    {plan && <details className="native-activity-card" open><summary><strong>{t("Codex plan")}</strong></summary><p>{plan.explanation}</p><ol>{plan.steps.map((step, index) => <li key={index}><span>{step.step}</span><small>{t(step.status === "completed" ? "Completed" : step.status === "inProgress" || step.status === "in_progress" ? "Running" : "Pending")}</small></li>)}</ol></details>}
    {diff && <details className="native-activity-card"><summary><strong>{t("Codex changes")}</strong></summary><pre>{diff}</pre></details>}
  </section>;
}

export function NativeQuestionCard({ question, onAnswer }: { question: NativeAgentQuestion; onAnswer: (id: string, answers: Record<string, string[]>) => Promise<unknown> }) {
  const { t } = useUISettings();
  const [answers, setAnswers] = useState<Map<string, string>>(() => new Map());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  return <form className="native-question-card" onSubmit={(event) => {
    event.preventDefault();
    if (busy || question.questions.some((item) => !answers.get(item.id)?.trim())) return;
    setBusy(true); setError("");
    void onAnswer(question.id, Object.fromEntries(question.questions.map((item) => [item.id, [answers.get(item.id)!.trim()]]))).catch((reason) => setError(String(reason))).finally(() => setBusy(false));
  }}>
    <strong>{t("Codex needs your input")}</strong>
    {question.questions.map((item) => <fieldset key={item.id} disabled={busy}>
      <legend>{item.header}</legend><label htmlFor={`native-question-${item.id}`}>{item.question}</label>
      {item.options?.map((option) => <button type="button" key={option.label} aria-pressed={answers.get(item.id) === option.label} onClick={() => setAnswers((current) => new Map(current).set(item.id, option.label))}><strong>{option.label}</strong><span>{option.description}</span></button>)}
      <input id={`native-question-${item.id}`} type={item.isSecret ? "password" : "text"} autoComplete="off" value={answers.get(item.id) || ""} maxLength={10000} onChange={(event) => setAnswers((current) => new Map(current).set(item.id, event.target.value))} />
    </fieldset>)}
    {error && <p role="alert">{error}</p>}
    <button type="submit" className="secondary-button" disabled={busy || question.questions.some((item) => !answers.get(item.id)?.trim())}>{t(busy ? "Sending" : "Send answer")}</button>
  </form>;
}

export function NativeContextUsage({ usage }: { usage: NativeAgentUsage | null }) {
  const { t } = useUISettings();
  const window = usage?.modelContextWindow;
  const percent = usage && window && window > 0 ? Math.min(100, Math.round(usage.totalTokens / window * 100)) : null;
  return <details className="native-context-usage">
    <summary aria-label={t("Codex context usage")}>Codex · {percent === null ? t("Unknown") : `${percent}%`}</summary>
    <div className="native-context-popover">
      <strong>{t("Codex context usage")}</strong>
      {usage ? <><p>{t("Last reported context")}: {usage.totalTokens.toLocaleString()} {t("tokens")}{window ? ` / ${window.toLocaleString()}` : ""}</p><p>{t("Input")}: {usage.inputTokens.toLocaleString()} · {t("Cached")}: {usage.cachedInputTokens.toLocaleString()} · {t("Output")}: {usage.outputTokens.toLocaleString()}</p></> : <p>{t("Waiting for Codex to report token usage.")}</p>}
      <small>{t("Codex manages context and automatic compaction. Usage reflects its latest report, not a character estimate.")}</small>
    </div>
  </details>;
}
