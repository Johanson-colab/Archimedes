import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { AlertTriangle, X } from "lucide-react";
import DialogPortal from "./DialogPortal";
import { useDialogFocus } from "./useDialogFocus";

export interface ConfirmOptions {
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
}

interface ConfirmRequest extends ConfirmOptions {
  resolve: (value: boolean) => void;
}

const ConfirmContext = createContext<((options: ConfirmOptions) => Promise<boolean>) | null>(null);

function ConfirmDialog({ request, onClose }: { request: ConfirmRequest; onClose: (value: boolean) => void }) {
  const dialogRef = useDialogFocus<HTMLElement>(true, () => onClose(false));
  return <DialogPortal>
    <div className="dialog-overlay app-dialog-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(false); }}>
      <section ref={dialogRef} tabIndex={-1} className="app-dialog app-dialog-sm confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby={request.description ? "confirm-dialog-description" : undefined} onMouseDown={(event) => event.stopPropagation()}>
        <header className="app-dialog-header">
          <div>
            <h2 id="confirm-dialog-title">{request.destructive && <AlertTriangle size={17} />}{request.title}</h2>
            {request.description && <p id="confirm-dialog-description">{request.description}</p>}
          </div>
          <button className="app-dialog-close" onClick={() => onClose(false)} aria-label="Close"><X size={17} /></button>
        </header>
        <footer className="app-dialog-footer">
          <button className="secondary-button" onClick={() => onClose(false)}>{request.cancelLabel || "Cancel"}</button>
          <button className={request.destructive ? "danger-button" : "primary-button"} onClick={() => onClose(true)}>{request.confirmLabel || "Confirm"}</button>
        </footer>
      </section>
    </div>
  </DialogPortal>;
}

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [request, setRequest] = useState<ConfirmRequest | null>(null);
  const requestRef = useRef<ConfirmRequest | null>(null);

  const confirm = useCallback((options: ConfirmOptions) => new Promise<boolean>((resolve) => {
    const next = { ...options, resolve };
    requestRef.current = next;
    setRequest(next);
  }), []);

  const close = useCallback((value: boolean) => {
    const current = requestRef.current;
    requestRef.current = null;
    setRequest(null);
    current?.resolve(value);
  }, []);

  const value = useMemo(() => confirm, [confirm]);
  return <ConfirmContext.Provider value={value}>
    {children}
    {request && <ConfirmDialog request={request} onClose={close} />}
  </ConfirmContext.Provider>;
}

export function useConfirm() {
  const confirm = useContext(ConfirmContext);
  if (!confirm) throw new Error("useConfirm must be used inside ConfirmProvider.");
  return confirm;
}
