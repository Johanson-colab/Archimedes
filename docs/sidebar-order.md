# Sidebar order

Drag rows to reorder Research Apps, Projects, archived Projects, and workspaces
within each Project. Drop placement uses the row's upper/lower half. Dragging
does not activate an app, open a workspace, or expand/collapse a Project.

Keyboard alternative: focus an app, Project, archived Project, or workspace row,
then use **Alt+Arrow Up / Alt+Arrow Down**. Focus remains on the item and its
new position is announced.

Ordering is a renderer-local preference at `archimedes-sidebar-order-v1`.
It is intentionally separate from project/workspace database and cloud data.
New IDs append in the normal registry/API order; stale IDs are pruned. Workspace
orders are keyed by parent Project, so items cannot be moved between projects.
