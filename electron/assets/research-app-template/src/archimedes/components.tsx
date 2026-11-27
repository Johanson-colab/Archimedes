import type { ButtonHTMLAttributes, ReactNode } from "react";
export { Tabs, Tab, FilterGroup, FilterButton } from "./Tabs";
export { Dialog } from "./Dialog";
export { StateView } from "./StateView";

export function Button({ variant = "primary", className = "", ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" | "quiet" }) {
  return <button {...props} className={`app-button app-button-${variant} ${className}`} />;
}
export function Field({ label, htmlFor, children, hint }: { label: string; htmlFor: string; children: ReactNode; hint?: string }) {
  return <div className="app-field"><label htmlFor={htmlFor}>{label}</label>{children}{hint && <small>{hint}</small>}</div>;
}
export function Panel({ children, className = "", label }: { children: ReactNode; className?: string; label?: string }) {
  return <section aria-label={label} className={`app-panel ${className}`}>{children}</section>;
}
