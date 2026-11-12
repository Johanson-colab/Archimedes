import { useId } from "react";
import logo from "../../shared/brand-logo.json";

type Props = {
  size?: number;
  variant?: "primary" | "small";
  className?: string;
  title?: string;
  decorative?: boolean;
};

/** Shared Paper geometry; transparent foreground follows the active theme. */
export default function ArchimedesMark({ size = 24, className, title = "Archimedes", decorative = false }: Props) {
  const shadowId = `archimedes-shadow-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="20 25 232 188"
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : title}
      aria-hidden={decorative || undefined}
      fill="currentColor"
      focusable="false"
    >
      <defs>
        <filter id={shadowId} filterUnits="userSpaceOnUse" x="16" y="20" width="240" height="200" colorInterpolationFilters="sRGB">
          <feDropShadow dx={logo.shadow.dx} dy={logo.shadow.dy} stdDeviation={logo.shadow.blur / 2} floodColor="black" floodOpacity={logo.shadow.opacity} />
        </filter>
      </defs>
      {logo.blocks.map(([x, y, width, height], index) => (
        <rect key={index} x={x} y={y} width={width} height={height} rx={logo.cornerRadius} filter={`url(#${shadowId})`} />
      ))}
    </svg>
  );
}
