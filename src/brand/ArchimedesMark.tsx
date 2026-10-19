type MarkVariant = "primary" | "small";

type Props = {
  size?: number;
  variant?: MarkVariant;
  className?: string;
  title?: string;
};

const PRIMARY = "M52.67 52.94 57.75 54.46V55.50H36.28V54.46L42.03 53.00L26.36 17.14L27.80 16.62L13.75 52.93L19.76 54.48V55.50H6.25V54.48L11.23 52.83L28.73 8.50H32.97ZM17.85 38.68V36.40Q29.34 31.19 40.83 36.40V38.68Q29.34 33.47 17.85 38.68Z";
const SMALL = "M19.11 39.22V35.26H42.40V39.22ZM52.46 51.79 57.76 53.68V55.50H38.11V53.68L44.01 51.88L28.66 14.78H30.57L16.20 51.87L21.81 53.68V55.50H6.24V53.68L11.58 51.88L29.16 8.50H34.16Z";

/**
 * The Archimedes monogram. The primary cut carries the shallow arch in the
 * A's crossbar; the small cut drops it so the letter survives at 16–24 px.
 */
export default function ArchimedesMark({
  size = 24,
  variant = "primary",
  className,
  title = "Archimedes",
}: Props) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 64 64"
      role="img"
      aria-label={title}
      fill="currentColor"
      focusable="false"
    >
      <path d={variant === "primary" ? PRIMARY : SMALL} />
    </svg>
  );
}
