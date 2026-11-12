# Archimedes logo exports

Faithful SVG exports of the seven-block logo designed in Paper. Original block
positions, sizes, drawing order, and 3px corner radii are preserved. The shadow
design is translated to the same coordinates as the flat design.

| File | Background | Blocks | Shadow |
| --- | --- | --- | --- |
| `archimedes-logo.svg` | White | Black | None |
| `archimedes-logo-shadow.svg` | White | Black | Black, 20% opacity |
| `archimedes-logo-dark.svg` | Black | White | None |
| `archimedes-logo-dark-shadow.svg` | Black | White | Black, 20% opacity |

All files have a 264 × 234 viewBox with explicit backgrounds and margins, since
the source JSX did not specify canvas dimensions. These are standalone assets,
not an automatic theme-switching implementation.

The shadow preserves the original CSS settings: 4px horizontal and vertical
offset, 3px blur radius (SVG standard deviation 1.5), and `#00000033` color.
On pure black, this black shadow is intentionally invisible; it has not been
changed into a white glow.

Source: https://app.paper.design/file/01M70B4DMNVNJZJEN4AM1RFDEP/01K4GP58P8JRM8PGBP0586VKYV/1LM-0

These standalone exports preserve the original backgrounds. In-app branding now
uses the shared shadowed `src/brand/ArchimedesMark.tsx` component, with the original
geometry in `shared/brand-logo.json` and a theme-adaptive foreground. See
`docs/app-icons.md` for desktop/web formats and packaging limitations.
