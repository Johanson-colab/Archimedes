# Files ownership behavior

The Files controls and layout are unchanged. The change concerns delayed saves,
reads, conflicts and drafts while switching execution directories; a static
screenshot does not show which directory receives a callback.

Before, the actual `saveFile` callback from upstream `1f4b375` was run against two
temporary directories, each containing `notes.md`. After submitting A's edit,
the active editor switched to an independently edited B before A's write returned:

```text
A disk: "Submitted A\n"
B disk: "Original B\n"
Current B buffer savedContent: "Submitted A\n"
Expected B buffer savedContent: "Original B\n"
```

On this branch the actual callbacks are exercised with the same two-directory
save journey in `electron/file-editor-owner.test.cjs`:

```text
PASS actual save writes its captured directory and preserves the other root's current editor
PASS an actual external conflict can retain the local edit, then save and reopen cleanly
```

Those checks verify real file contents, the visible selected-file record, the
unchanged B draft object, returning to A, and an ordinary conflict/save/reopen
journey. Existing draft and directory-link checks cover later keystrokes and
stale path requests without changing the filesystem boundary.
