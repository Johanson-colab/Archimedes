# canonical-workspace

Directory aliases such as macOS /var and /private/var refer to the same Git workspace. Resolve both the selected folder and Git top-level folder before comparing them. Malformed nested .git entries still remain suspicious.

The [before output](before.txt) and [after output](after.txt) are excerpts of actual focused runs against upstream main and this isolated change. Original business assertions are retained. This is a nonvisual correction; screenshots would not demonstrate the directory identity, target path semantics, or source-order behavior.
