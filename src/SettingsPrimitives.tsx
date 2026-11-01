import { useRef, type KeyboardEvent, type ReactNode } from "react";

export function SettingsSection({ title, children, className = "" }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return <section className={`settings-section ${className}`.trim()}>
    {title !== undefined && <h3 className="settings-section-title">{title}</h3>}
    {children}
  </section>;
}

export function SettingsGroup({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`settings-group ${className}`.trim()}>{children}</div>;
}

export function SettingsRow({
  title,
  description,
  hint,
  icon,
  leading,
  footer,
  children,
  className = "",
  controlClassName = "",
  stacked = false,
}: {
  title?: ReactNode;
  description?: ReactNode;
  hint?: ReactNode;
  icon?: ReactNode;
  leading?: ReactNode;
  footer?: ReactNode;
  children?: ReactNode;
  className?: string;
  controlClassName?: string;
  stacked?: boolean;
}) {
  const hasCopy = title !== undefined || description !== undefined || hint !== undefined;
  return <div className={["settings-row", stacked ? "settings-row-stacked" : "", className].filter(Boolean).join(" ")}>
    {leading}
    {hasCopy && <div className="settings-row-copy">
      {title !== undefined && <span className="settings-row-title">{icon}{title}</span>}
      {description !== undefined && <p className="settings-row-description">{description}</p>}
      {hint !== undefined && <span className="settings-row-hint">{hint}</span>}
    </div>}
    {children !== undefined && children !== null && <div className={`settings-row-control ${controlClassName}`.trim()}>{children}</div>}
    {footer}
  </div>;
}

export function SettingsSwitch({
  checked,
  label,
  onChange,
  disabled = false,
  title,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  title?: string;
}) {
  return <button
    type="button"
    className={checked ? "settings-toggle on" : "settings-toggle"}
    role="switch"
    aria-checked={checked}
    aria-label={label}
    title={title}
    disabled={disabled}
    onClick={() => onChange(!checked)}
  ><span /></button>;
}

export type SettingsChoiceOption<T extends string> = {
  value: T;
  label: ReactNode;
  icon?: ReactNode;
  disabled?: boolean;
};

export function SettingsChoiceGroup<T extends string>({
  value,
  options,
  label,
  onChange,
  className = "",
}: {
  value: T;
  options: Array<SettingsChoiceOption<T>>;
  label: string;
  onChange: (value: T) => void;
  className?: string;
}) {
  const buttons = useRef<Array<HTMLButtonElement | null>>([]);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const focusOption = (index: number) => {
    const option = options[index];
    if (!option || option.disabled) return;
    buttons.current[index]?.focus();
    onChange(option.value);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      event.preventDefault();
      focusOption((index + 1) % options.length);
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      event.preventDefault();
      focusOption((index - 1 + options.length) % options.length);
    } else if (event.key === "Home") {
      event.preventDefault();
      focusOption(0);
    } else if (event.key === "End") {
      event.preventDefault();
      focusOption(options.length - 1);
    }
  };

  return <div className={`settings-choice ${className}`.trim()} role="radiogroup" aria-label={label}>
    {options.map((option, index) => <button
      key={option.value}
      ref={(element) => { buttons.current[index] = element; }}
      type="button"
      role="radio"
      aria-checked={option.value === value}
      aria-label={typeof option.label === "string" ? option.label : undefined}
      tabIndex={option.value === value || (selectedIndex === -1 && index === 0) ? 0 : -1}
      className={option.value === value ? "active" : ""}
      disabled={option.disabled}
      onClick={() => onChange(option.value)}
      onKeyDown={(event) => onKeyDown(event, index)}
    >{option.icon}{option.label}</button>)}
  </div>;
}
