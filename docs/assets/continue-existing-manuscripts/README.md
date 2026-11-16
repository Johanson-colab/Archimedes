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
