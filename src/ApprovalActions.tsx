import { useEffect, useRef, useState } from "react";
import { startApprovalCountdown } from "./approval-countdown.mjs";
import { useUISettings } from "./i18n";

export type ApprovalAction = AgentAction & { ownerThreadId?: string | null };

export function ApprovalActions({ action, agentBusy, onApprove, onReject }: {
  action: ApprovalAction;
  agentBusy: boolean;
  onApprove: (id: string) => void;
  onReject: (id: string) => void;
}) {
  const { t } = useUISettings();
  const [seconds, setSeconds] = useState<number | null>(null);
  const approveRef = useRef(onApprove);
  const cancelRef = useRef<(() => void) | null>(null);
  approveRef.current = onApprove;
  const autoRunId = action.kind === "command" && (action.payload.managedByAgent || (agentBusy && action.ownerThreadId && action.payload.remoteOperation === "ssh_remote_exec")) ? action.id : null;
  useEffect(() => {
    if (!autoRunId) { setSeconds(null); return; }
    const cancel = startApprovalCountdown(setSeconds, () => approveRef.current(autoRunId));
    cancelRef.current = cancel;
    return () => { cancel(); if (cancelRef.current === cancel) cancelRef.current = null; };
  }, [autoRunId]);
  const decide = (callback: (id: string) => void) => {
    cancelRef.current?.();
    cancelRef.current = null;
    setSeconds(null);
    callback(action.id);
  };
  return <div className="approval-actions">
    {autoRunId && seconds !== null && <span className="approval-countdown">{t("Auto-run in {seconds}s", { seconds })}</span>}
    <button className="approval-dismiss" onClick={() => decide(onReject)}>Dismiss</button>
    <button className="approval-apply" onClick={() => decide(onApprove)}>{action.kind === "write" ? "Apply" : "Run"}</button>
  </div>;
}
