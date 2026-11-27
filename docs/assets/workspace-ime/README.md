# Workspace naming with an IME

Both captures use the Chinese interface, Paper theme and a 1280 × 850 Electron content viewport. They follow the same Enter key event while the input method editor (IME) is composing the name 论文.

![Composition Enter closes the dialog and creates a workspace on the baseline](before.png)
![Composition Enter leaves the workspace name in the open dialog](after.png)

In the baseline, Escape during composition closed the dialog. After reopening it, Enter during composition persisted a second workspace named 论文. With the fix, both keys were left to the IME and the workspace count remained one. After composition ended, ordinary Enter created 论文 and the workspace count became two.

The desktop fixture dispatched composition and keyboard events to the Electron renderer in an isolated profile. The component regression also checks browser key code 229, ordinary button Enter behavior and dismissal by ordinary Escape or an outside click.

```sh
node --test electron/ui-audit-dialog.test.cjs
```
