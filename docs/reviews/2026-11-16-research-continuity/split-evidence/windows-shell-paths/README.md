# windows-shell-paths

Windows PowerShell discovery uses Windows path joining even when a Windows target is evaluated on another host. Keep existing preference/fallback behavior and cover Microsoft Store installs and alternate drives.

The [before output](before.txt) and [after output](after.txt) are excerpts of actual focused runs against upstream main and this isolated change. Original business assertions are retained. This is a nonvisual correction; screenshots would not demonstrate the directory identity, target path semantics, or source-order behavior.
