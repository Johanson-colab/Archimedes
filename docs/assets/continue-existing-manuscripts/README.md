# Existing manuscript entry

The two captures use the same 1,440 × 1,000 renderer viewport and Charcoal theme.
They are direct browser content screenshots without browser chrome. Both point at the same synthetic execution
folder containing `paper/main.tex`, a section file and `references.bib`.
The renderer mounts the branch's actual `PaperWritingView`; its local desktop
bridge reads the fixture through the existing filesystem helpers.

- **Before:** upstream main `1f4b375` initially opens the template library.
- **After:** this branch initially offers the existing manuscript in place,
  with the template workflow available through **New manuscript**.

The entry state is deliberately shown before selecting a manuscript. Opening
the listed row was also checked and loaded the main file with its section
folder and bibliography. No compiler is needed for opening the manuscript.

![Before](before.png)

![After](after.png)

## LaTeX suggestions across projects

The desktop captures use the real Electron renderer and preload at 1,180 × 900
with the Charcoal theme. Two disposable projects contained a `paper/main.tex`.
A controlled compiler failure went through the normal LaTeX build IPC in the
Optics project. After switching to the Materials chat, both runs clicked
**Ask AI to fix** on the Optics suggestion.

- **Before (`8b88f64`)** places the Optics repair draft in the Materials chat.
- **After (`abf11c4`)** leaves the Materials composer empty and prompts the user
  to return to the source conversation. The suggestion remains available.

A second run held the compiler result until Materials was active. Before the
fix, Materials received one LaTeX suggestion. After the fix, it received zero.
Returning to Optics displayed the original diagnostics in both runs.

![Optics repair draft staged in the Materials chat](scope-before.png)

![Materials composer stays empty and the notice points to the source conversation](scope-after.png)

## Reopening a source during manuscript discovery

Both Electron captures use the Charcoal theme at 1,440 × 1,000. In a disposable workspace, Writing opened `paper/main.tex` and the user selected `paper/results.tex`. After the renderer reloaded, Writing began reopening the main file. The user switched to Library and back while that read was paused, and the manuscript list refreshed.

Before (`4fbe6d9`), the editor stayed on the main file and remembered it as the last source.

![Before, main.tex is active after returning to Writing](restore-before.png)

After (`7043554`), the editor reopened and remembered `paper/results.tex`. The main document stayed `paper/main.tex`.

![After, results.tex is active while main.tex remains the main document](restore-after.png)

## Open a source edited outside Writing

Both production Electron builds used the same 1,180 × 900 Charcoal viewport
and a temporary manuscript. Open `results.tex`, open `main.tex`, then update
`results.tex` on disk. Return to `results.tex` while its read is delayed.

| Before (`85648a0`) | After (`db9f857`) |
| --- | --- |
| ![Cached results are already editable](clean-source-read-before.png) | ![Writing waits for the source read before enabling editing](clean-source-read-after.png) |

Typing ahead of the read overwrote the disk update in the earlier build. In
the updated build, the read completes before the newly selected file is
editable. Subsequent typing preserved the disk update in the saved file.
