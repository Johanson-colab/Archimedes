# Codex native settings

The screenshots render the actual settings components in an isolated Electron fixture (1100 × 1050, Paper theme). The fixture uses a fixed native model catalog with six reasoning efforts so before/after captures are repeatable. No live conversation or personal workspace is used.

- `before.png`: previous settings with the legacy read-only configuration.
- `after.png`: updated settings before saving a permission choice.
- `effort-options.png`: native effort menu after the user opens it and the catalog resolves.

The installed Codex CLI (0.161.0) was also checked without starting a turn. Its effective model advertised `low`, `medium`, `high`, `xhigh`, `max`, and `ultra`.

Permission mappings are tested on both `thread/start` and `turn/start`: user review with workspace sandbox; native `auto_review` with workspace sandbox; and full access with `danger-full-access`/`dangerFullAccess` plus `never` approval policy. Legacy stored sandbox settings remain executable until explicitly replaced through Save.
