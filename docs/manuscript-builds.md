# Manuscript build receipts

Each compilation retains its own output directory under
`.archimedes/latex-build/<document-key>/<build-id>/`. A later compilation does
not reuse or replace an earlier PDF or log. The managed compiler still runs
one build at a time, including requests from different workspaces, to protect
its shared TeX dependency cache.

Before queuing a request, Archimedes hashes the regular files in the selected
main document's directory and its descendants. This covers section files,
bibliographies and images, rather than only the main `.tex` file. Identical
waiting requests share work; requests with different source versions do not.
If inputs change while waiting, the old request returns a stale receipt
without invoking TeX. Changes observed during compilation also make the
receipt stale. A stale compilation returns no current `pdf_path`, even when
its historical output was successfully produced and retained.

`LatexCompileResult.source_snapshot` records the requested source manifest,
source version, build ID, status, and the actual PDF and bounded compiler
output log with their byte sizes and SHA-256 hashes. The manifest is saved
beside the artifacts as `source-snapshot.json`. It records hashes and paths;
it does not copy historical source contents or provide a source backup.

Before sending a PDF to review or slides, call
`readManuscriptSnapshot(workspace, manifest_path)`. This reads the saved
receipt and compares current source bytes and the retained PDF bytes.
`current === true` is the condition for presenting the build as the current
manuscript version. A false result requires recompiling or explicitly
working with a historical artifact; checking only the main file's hash or
reusing a previous success flag is insufficient. The workspace recorded in
the manifest must match the workspace making this request.

The source coverage is explicitly `manuscript-directory`. It excludes
`.archimedes`, `.git`, `node_modules`, `dist`, `build`, `.next`, `.venv`,
`venv`, `__pycache__` and `.cache` directories. These include generated build
output and common environment caches, so a build does not invalidate itself
by writing its own output. Symbolic links are listed as untracked inputs;
their targets are not followed, and such a successful build has an
`unverified` receipt rather than `current`. Preview remains available.
Inputs outside the manuscript directory, excluded folders, installed TeX
packages and the machine environment are outside this source coverage. Keep
manuscript assets in the dedicated paper directory for meaningful checks.

Source capture is limited to 10,000 regular files and 500 MiB; larger source
trees need a dedicated paper folder. Hashing streams each file through a
64 KiB buffer. Requests and completed builds incur source reads; the receipt
does not establish that large workspaces have negligible latency.

After each build, Archimedes keeps the five most recent completed previews for
that main document. Directories without a completed receipt are left alone,
including ongoing builds. `preview_cleanup` reports removed directories and any
cleanup errors; a failure to remove an old preview does not invalidate an
otherwise successful compile. The shared runtime `tex-cache` and `xdg-cache`
contain downloaded TeX dependencies separately from manuscript output. Preview
cleanup does not clear those caches.

The preview quota keeps the five most recent PDF-bearing builds. Up to five additional log-only receipts are kept for failed or stale attempts, so retries cannot evict the last PDF. A linked main document is verified against its resolved target as well as the files in its manuscript directory.
