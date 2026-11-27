# V03: compiler input and artifact identity

## Reproduced before changing behavior

`v03-compiler-probe.cjs` uses the real orchestration and temporary disk with a
controlled compiler, not a TeX executable. The saved before output shows:

1. Successive builds returned the same PDF path, and the second build changed
   the bytes at the first build's returned path.
2. While another root compiled, two waiting requests for the same main file
   shared a promise even after its section and bibliography changed.

`v03-compiler-before.log` retains that result. Running the same probe with
`--assert-fixed` now verifies distinct stable artifact paths and distinct
changed-input requests (`v03-compiler-after.log`). The original global
compiler serialization is retained.

## Implemented contract and focused verification

The implementation is in `electron/manuscript-snapshot.cjs`,
`electron/latex-workspace.cjs`, and `electron/managed-latex-engine.cjs`.
`src/manuscript-snapshot.ts` describes the result. Backend integration adds
the `paper:build-snapshot` handler, preload method, and optional bridge/result
types. The compiler snapshots the selected main document's directory tree,
not only `main.tex`; each build retains a UUID directory with actual PDF/log
hashes and a persisted receipt. Stale requests return no current PDF.

```sh
node --test electron/manuscript-snapshot.test.cjs electron/latex-workspace.test.cjs electron/managed-latex-engine.test.cjs
node --test electron/paper-source-search.test.cjs
node docs/reviews/2026-11-16-system-review/implementation-evidence/v03-compiler-probe.cjs --assert-fixed
node docs/reviews/2026-11-16-system-review/implementation-evidence/v03-snapshot-cost.cjs
```

Focused result: **31 tests, 30 passed, 0 failed, 1 skipped**. The skip is the
existing real `latexmk` template test; this host has no latexmk. Snapshot
tests cover section/bib/image versions, exclusion of generated/cache output,
stable PDF/log bytes and their actual SHA-256 hashes, source changes/removal
during compilation, untracked symlink inputs, cross-root manifest identity,
and queued same/changed inputs across two roots. A real-directory retention
test compiles seven more previews, checks five unused previews plus a pinned
run input, preserves an incomplete active directory, refuses a stale new
pin, and releases only a failed-creation reference. The fresh-handoff test
executes the actual preload and main handler boundary against the real
snapshot reader and disk; it does not start Electron or prove all window
authorization behavior. Compiler children in these focused tests are
controlled fixtures. Logs are `v03-focused-final.log` and
`v03-source-search-adjacent.log`.

The local synthetic 16 MiB / 66-file measurement took 11.5–23.2 ms per
capture across five runs on macOS arm64 / Node26.13.0, with a 9,012-byte source
manifest. This is a warm-filesystem fixture measurement, not an application
performance improvement claim. Each source read uses a 64 KiB buffer and no
historical source copies are stored. The compiler reads source at request,
start and completion, so large manuscripts incur real additional I/O.

## W06 handoff and retention boundaries

Call `readManuscriptSnapshot(workspace, source_snapshot.manifest_path)` just
before review/slides. Require `current === true` for a current-version
handoff; the read rechecks all covered source bytes and actual PDF bytes.
Renderer-owned unsaved drafts/save queues also need to be checked: this
disk-based receipt cannot observe in-memory edits. Frontend owns that UI
integration and native acceptance; these tests do not certify it.

Coverage is explicitly the selected main document's directory, excluding
generated/cache folders. Symbolic links are listed but not followed and yield
`unverified`, even when preview succeeds. External TeX inputs and the full
machine/package environment are outside this source manifest. It is a hash
receipt, not a historical source backup or a general dependency build graph.

There was no prior build-history cleanup mechanism. The new policy retains
five completed, unreferenced preview directories per main document. A
fresh-verified pin records the actual review/slides run ID; those PDF/log/
manifest inputs survive preview cleanup. Incomplete/active directories are
never selected. Failed run creation rolls back its pin; a real created run's
failure/cancellation preserves its historical input. The existing slides PDF
copy is unchanged. Backend/frontend own the final run-creation integration;
module tests alone do not certify that UI journey. Cleanup errors are
returned as `preview_cleanup.errors` without failing a valid compile. The
downloaded TeX cache is separate. See `docs/manuscript-builds.md`.

## Real TeX

The first isolated-cache attempt used the real Homebrew Tectonic0.17.0 and
the configured `default_bundle_v33.tar`. At 90 seconds it was still
downloading/generating the LaTeX format and hit the explicitly selected total
deadline. It produced no PDF, returned a failed receipt and retained a
3,831-byte hashed output log. The temporary fixture was removed; this is
**not a passing real compile** (`v03-real-tex-90s.log`). The longer initially
empty-cache attempt hit its selected 360-second deadline while still fetching
multilingual hyphenation resources (`v03-real-tex.log`). Its downloaded cache
was checkpointed before cleanup and reused, rather than downloaded again.

With that retained task cache, the same real executable/configured bundle
completed the article, section and BibTeX bibliography in **149,629 ms**.
After changing both section and bibliography, a real `--only-cached` compile
completed in **306 ms**. This flag disallows dependency downloads. Both
receipts were current; the prior PDF bytes were unchanged, its source check
became stale, and the newer build passed the fresh source/PDF check.
`v03-real-tex-resumed.log` records actual PDF/log hashes and sizes. The PDFs
were 9,177 and 9,572 bytes; bounded output logs 18,725 and 2,288 bytes;
manifests 2,320 and 2,319 bytes. These are a small one-page fixture's actual
costs, not a general manuscript size or speed claim. The fresh fixture was
removed. The completed downloaded bundle cache is retained temporarily for
the next managed-engine fixture acceptance, not committed to the repository.

The Homebrew executable's SHA-256 differs from the published managed-engine
SHA-256. Executing it cannot satisfy verification of the official managed
archive, even though both report Tectonic0.17.0. The existing optional managed
live test additionally needs a real flat bundle fixture and must be reported
separately from controlled tests and from this system executable run. No
claim that its default skip has passed is made here.
