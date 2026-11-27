Opening another project while a reply, save or build was in flight could write into the newly selected workspace. Research results also lost their source context between analysis, writing and later review. This change captures the project/session owner through those operations and saves the files and receipts needed to continue the work.

The main changes are:

- Keep editor drafts, attachments, agent activity and delayed results with their original data workspace, project and session. Recover interrupted local work with its partial output.
- Save CSV analysis and figure packages with the original files and editable configuration. Continue in the associated conversation, insert figures into an existing manuscript, and retain source links.
- Compile the full manuscript version into stable PDF/log receipts. Pass that version to review/slides and open selected feedback in the correct revision conversation.
- Add local project export/restore with record/file manifests and new local identities. Keep restored reading notes/PDFs when the same paper is collected or imported again.
- Add user-confirmed CSV/JSON numerical comparisons with exact decimal tolerances and source/run hashes, separate from run checkpoint status.
- Preserve cloud sync updates, deletion ordering and comment retries; make app availability/configuration explicit. Align source installation, desktop preparation and build diagnostics. Exclude unused ONNX Node binaries from the desktop package while retaining browser WASM and keyword search.

Validation on macOS arm64 with Node26.13.0/npm11.20.0:

- `npm test`: **1441 passed, 0 failed, 4 conditional skips** (1445 tests), including both real Electron layout checks, official managed-TeX cold/offline compilation, MemT PDF equations and theme checks.
- The final numerical-panel styling/copy change then passed its existing component/i18n tests **7/7** and `npm run lint`.
- `npm run package:desktop`: passed, including TypeScript and the renderer build. The local unsigned macOS arm64 app started successfully; its native PTY ran a command, a saved numerical report reopened, and normal reference search returned keyword candidates when semantic resources were unavailable.
- The public audit against the actual `app.asar` imported the original semantic worker and ORT module and compiled **28,352,885 bytes of WASM**, with zero HTTP(S) requests. `onnxruntime-node` was absent from the package.
- Native workflows completed saved eight-row CSV → historical-root conversation/manuscript, PNG → existing multi-file manuscript → real managed compilation/review/revision, delayed replies across two data roots, and 17-file project export → new-project restore → numerical mapping/save/reopen. Slides source/setup handoff was checked; paid model/MinerU presentation generation was not run.

The four conditional tests need latexmk, the official local Kimi PPTD tool, or two hosted Supabase accounts (sharing and Realtime). The package is a local unpublished `.app`; Windows/macOS Intel installers were not run.

Usage: [project transfer](https://github.com/feiiiiii5/Archimedes/blob/f6b5ee37721d9e908c401f9acc8a5765654c490f/docs/project-transfer.md), [numerical comparisons](https://github.com/feiiiiii5/Archimedes/blob/f6b5ee37721d9e908c401f9acc8a5765654c490f/docs/numerical-comparisons.md), [manuscript receipts](https://github.com/feiiiiii5/Archimedes/blob/f6b5ee37721d9e908c401f9acc8a5765654c490f/docs/manuscript-builds.md), [development validation](https://github.com/feiiiiii5/Archimedes/blob/f6b5ee37721d9e908c401f9acc8a5765654c490f/docs/development-validation.md).

The Supabase adapter change includes `server/sql/0013_sync_integrity.sql`; apply it when deploying the updated adapter.

<details>
<summary>Before/after interface evidence</summary>

Paired captures share the same viewport/theme/state.

| Surface | Before | After |
| --- | --- | --- |
| Existing manuscript | <img width="420" alt="Existing manuscript before" src="https://raw.githubusercontent.com/feiiiiii5/Archimedes/f6b5ee37721d9e908c401f9acc8a5765654c490f/docs/assets/research-workflow-integrity/writing-before.jpg"> | <img width="420" alt="Existing manuscript after" src="https://raw.githubusercontent.com/feiiiiii5/Archimedes/f6b5ee37721d9e908c401f9acc8a5765654c490f/docs/assets/research-workflow-integrity/writing-after.jpg"> |
| Work modes | <img width="420" alt="Work modes before" src="https://raw.githubusercontent.com/feiiiiii5/Archimedes/f6b5ee37721d9e908c401f9acc8a5765654c490f/docs/assets/research-workflow-integrity/work-modes-before.jpg"> | <img width="420" alt="Work modes after" src="https://raw.githubusercontent.com/feiiiiii5/Archimedes/f6b5ee37721d9e908c401f9acc8a5765654c490f/docs/assets/research-workflow-integrity/work-modes-after.jpg"> |
| Navigation | <img width="420" alt="Navigation before" src="https://raw.githubusercontent.com/feiiiiii5/Archimedes/f6b5ee37721d9e908c401f9acc8a5765654c490f/docs/assets/research-workflow-integrity/navigation-before.jpg"> | <img width="420" alt="Navigation after" src="https://raw.githubusercontent.com/feiiiiii5/Archimedes/f6b5ee37721d9e908c401f9acc8a5765654c490f/docs/assets/research-workflow-integrity/navigation-after.jpg"> |
| Figure entry | <img width="420" alt="Figure entry before" src="https://raw.githubusercontent.com/feiiiiii5/Archimedes/f6b5ee37721d9e908c401f9acc8a5765654c490f/docs/assets/research-workflow-integrity/figure-entry-before.jpg"> | <img width="420" alt="Figure entry after" src="https://raw.githubusercontent.com/feiiiiii5/Archimedes/f6b5ee37721d9e908c401f9acc8a5765654c490f/docs/assets/research-workflow-integrity/figure-entry-after.jpg"> |
| Build diagnostics | <img width="420" alt="Build diagnostics before" src="https://raw.githubusercontent.com/feiiiiii5/Archimedes/f6b5ee37721d9e908c401f9acc8a5765654c490f/docs/assets/research-workflow-integrity/build-diagnostics-before.jpg"> | <img width="420" alt="Build diagnostics after" src="https://raw.githubusercontent.com/feiiiiii5/Archimedes/f6b5ee37721d9e908c401f9acc8a5765654c490f/docs/assets/research-workflow-integrity/build-diagnostics-after.jpg"> |
| Discovery | <img width="420" alt="Discovery before" src="https://raw.githubusercontent.com/feiiiiii5/Archimedes/f6b5ee37721d9e908c401f9acc8a5765654c490f/docs/assets/research-workflow-integrity/discovery-before.jpg"> | <img width="420" alt="Discovery after" src="https://raw.githubusercontent.com/feiiiiii5/Archimedes/f6b5ee37721d9e908c401f9acc8a5765654c490f/docs/assets/research-workflow-integrity/discovery-after.jpg"> |
| Bibliography | <img width="420" alt="Bibliography before" src="https://raw.githubusercontent.com/feiiiiii5/Archimedes/f6b5ee37721d9e908c401f9acc8a5765654c490f/docs/assets/research-workflow-integrity/library-import-before.jpg"> | <img width="420" alt="Bibliography after" src="https://raw.githubusercontent.com/feiiiiii5/Archimedes/f6b5ee37721d9e908c401f9acc8a5765654c490f/docs/assets/research-workflow-integrity/library-bibtex-after.jpg"> |

The new numerical panel in the actual package:

![Saved numerical comparison](https://raw.githubusercontent.com/feiiiiii5/Archimedes/f6b5ee37721d9e908c401f9acc8a5765654c490f/docs/assets/research-workflow-integrity/metric-comparison-after.jpg)

[Capture details and native workflow results](https://github.com/feiiiiii5/Archimedes/blob/f6b5ee37721d9e908c401f9acc8a5765654c490f/docs/assets/research-workflow-integrity/README.md). Later analysis/writing/discovery capture attempts returned OS window thumbnails, which are excluded.

</details>
