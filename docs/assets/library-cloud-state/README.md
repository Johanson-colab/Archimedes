# Cloud import comparison

The same SQLite fixture ran against upstream `ae8c18d` and the fix at `8f7dd3d`. A library contains a paper with a local DOI and saved personal state. The cloud import supplies the same DOI with a different canonical key, an older state timestamp, and empty notes and tags. Each result came from reading the destination collection after the import.

| Output | Before | After |
| --- | --- | --- |
| Reused the local paper ID | Yes | Yes |
| Notes | Empty | Keep this field note |
| Reading status | Unread | Read |
| Starred | No | Yes |
| Tags | None | methods |

The import still adds the same paper to the cloud collection. The sync service receives its existing local timestamp and can reconcile the two versions of the personal state.
