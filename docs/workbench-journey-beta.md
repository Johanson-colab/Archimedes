# Journey as an opt-in workbench tab

Journey is a beta workbench tab. It is no longer added to a fresh workbench
automatically.

## Behavior

- New installs and **Reset to defaults** hide Journey; Trajectory remains the
  active tab.
- Existing preferences are preserved. A user who already has Journey visible
  keeps it after upgrading.
- Journey stays available from the workbench overflow menu, the command
  palette, and **Settings → Workbench → Layout**.
- The Layout list marks Journey with a **Beta** badge so its experimental
  status is visible before a user enables it.
- Opening Journey from the command palette or overflow menu enables and focuses
  the tab, matching every other optional workbench tab.

## Preference migration

Workbench preferences move to version 5. The migration keeps the existing rule
that old data only hides newly optional tabs and never removes a tab the user
already has visible. Fresh defaults include `journey` in the optional set, so
`DEFAULT_WORKBENCH_PREFERENCES` and `electron/workbench-settings.cjs` agree.

## Evidence

Before and after captures live in `docs/assets/workbench-journey-beta/`:

- `before-workbench-tabs.png` / `after-workbench-tabs.png`
- `before-settings-workbench.png` / `after-settings-workbench.png`

Viewport 1560×900, Paper theme, signed-out local state.
