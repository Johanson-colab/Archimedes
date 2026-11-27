# Continue an existing manuscript

Paper writing opens an **Existing manuscripts** chooser before the template
library. Choose the main `.tex` file in the current execution folder. Source
files stay in place; opening and reading them does not require a compiler.
**New manuscript** still offers the existing create/import workflow.

The writing view remembers the selected main/source file for each execution
folder and research project. Projects sharing a physical execution folder
remember their own main/source selection; documents in that same folder share
their existing per-file drafts and serialized save queues. Moving to another file or folder saves pending edits to
their original owner, and a late read or save cannot replace newer typing.
An unsuccessful save leaves the draft visible with its error for retry.

Compiling the main document drains pending saves for all open source files,
including section and bibliography buffers. If typing changes a buffer during
that save barrier, compilation stops with a request to compile again rather
than using an older set of edits. Progress and results are matched by execution
folder, main file and request ID. The existing two-argument compile bridge
remains supported for other callers.
