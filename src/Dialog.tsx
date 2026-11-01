import { type FormEventHandler, type ReactNode, type Ref } from "react";
import DialogPortal from "./DialogPortal";
import { useDialogFocus } from "./useDialogFocus";

export type DialogSize = "sm" | "md" | "lg" | "gallery" | "preview" | "settings" | "full" | "palette" | "lightbox";

export function Dialog({
  open,
  onClose,
  children,
  role = "dialog",
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
  size,
  className = "",
  overlayClassName = "modal-backdrop app-dialog-overlay",
  as = "section",
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
  role?: "dialog" | "alertdialog";
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  size?: DialogSize;
  className?: string;
  overlayClassName?: string;
  as?: "section" | "form";
  onSubmit?: FormEventHandler<HTMLFormElement>;
}) {
  const dialogRef = useDialogFocus<HTMLElement>(open, onClose);
  if (!open) return null;

  const dialogClassName = ["app-dialog", size ? `app-dialog-${size}` : "", className].filter(Boolean).join(" ");
  const shared = {
    ref: dialogRef as Ref<HTMLElement>,
    tabIndex: -1,
    className: dialogClassName,
    role,
    "aria-modal": true,
    "aria-label": ariaLabel,
    "aria-labelledby": ariaLabelledBy,
    "aria-describedby": ariaDescribedBy,
  };

  return <DialogPortal>
    <div
      className={overlayClassName}
      role="presentation"
      onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}
    >
      {as === "form"
        ? <form {...shared} ref={dialogRef as unknown as Ref<HTMLFormElement>} onSubmit={onSubmit}>{children}</form>
        : <section {...shared}>{children}</section>}
    </div>
  </DialogPortal>;
}
