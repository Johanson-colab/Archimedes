# Independent integration review

Reviewed on 2026-11-16 against the uncommitted `codex/research-continuity` implementation. This is a local process record, not a PR artifact. I read the applicable global and repository instructions, feature code, focused tests, public usage documentation, and the responsible agents' logs. I did not rerun the integrated suite, build another Electron instance, or operate the native UI.

## Result

One actual integration defect was found and fixed by the integration owner: opening a reproduction or recorded run whose execution folder differs from the current project workspace wrote its selection under the historical execution-root key, while the rendered Reproduce surface reads the current workspace key. This left the requested reproduction unselected. A narrow probe executing the actual `openResearchIndexItem` function produced:

```json
{
  "selectedExecutionRoot": "/old",
  "writtenSelectionKeys": ["[\"/data\",\"p\",\"w\",\"/old\"]"],
  "rendererReadKey": "[\"/data\",\"p\",\"w\",\"/new\"]",
  "rendererSelectedId": null
}
```

The owner changed the setter to use the same `newTaskSelection` projection as the Reproduce renderer. I reviewed that hunk and the revised navigation assertion, which now models the renderer's read key and explicitly proves that it differs from the historical task root. The author's targeted navigation/actual Reproduce checks pass 4/4, and lint passes after the correction (`historical-run-navigation-after.log`, `integrated-lint.log`).

No other actionable defect was found in the reviewed feature contracts:

- N01 handoff extraction retains the previous App preparation, owner matching, pending-request sharing, attachment identity and revision receipt content. App still owns composer updates and visible navigation. Existing component/handoff assertions execute the extracted service rather than silently bypassing it.
- N02 bibliography updates retain a matched manuscript key, manual fields, other entries and directives. Metadata corrections remain tied to the same library paper; collision handling is covered. The writing component uses the existing owner save queues and the current bibliography draft. The documentation states literal BibTeX scope and explicit bibliography inclusion/recompilation requirements accurately.
- N03 versions capture the actual manuscript directory, including section files, bibliography and image bytes. Comparison handles added/removed/modified files and binary assets; restore checks the compared source identity, retains the current content as a return version, reloads the editor and clears its PDF receipt. Component tests exercise unsaved drafts through the owner queues. The durable owner index and command recovery support a named manuscript without a thread after its default folder changes.
- N04 index entries remain locators to existing objects. The real-store tests cover note edits/reopen, project separation, deleted evidence, ID/root remapping and named-version transfer without current source files. The corrected navigation uses concrete object IDs. Library, review and Reproduce adapters consume the requested source rather than substituting another object.

The public feature documents match these contracts and do not claim automatic scientific validation. The local review README's stale assertion that #336 was open was reported to the owner and corrected to closed/not merged.

## Verification ownership and current evidence

- The integration owner's `integrated-test.log` records 1466 tests: 1460 passed, 0 failed, 6 conditional skips, with theme checks passing. Its restored-and-continued manuscript TeX acceptance subtest ran and passed; it was not skipped.
- The same owner's initial `package:desktop` exited 0, including type checks and the renderer build, and produced the local unsigned macOS arm64 app (`integrated-package.log`). These integrated results precede the one-line historical-run correction. The targeted 4/4 checks and lint above cover that correction. The owner is rebuilding the final package; do not call the earlier package the final corrected artifact.
- The writing owner remains the sole native operator. At this review handoff, native after checks are still in progress. `project-after.png` displays the new index and editable notes clearly, but screenshots alone do not establish source reopening or restore behavior. The initial project pair had differing viewport widths; this was reported for the owner to normalize in the final capture set. No completed native acceptance claim is made here.

No code files were edited by this reviewer; no commit, push or PR was made.
