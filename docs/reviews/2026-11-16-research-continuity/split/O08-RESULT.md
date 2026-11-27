# O08 publication review

- Branch `codex/structured-checkout-paths`, head `944d32a22d0768e939f837ad9379ebc1b4740290`; worktree `Archimedes-pr-splits/structured-checkout-paths`; independent main base `1f4b375`.
- Production: `reproduction/structured-paths.cjs` and only `docker.cjs`/`remote.cjs` structured file methods. SSH constructor adds a spawn seam for executing its actual scripts locally. Existing lifecycle, provisioning, output logs and run ownership are untouched.
- 6 files, 158 insertions / 47 deletions. SSH size bound is checked on target before `cat`, avoiding a dependency on the later bounded process-output feature.
- Actual main Docker before probe returned external `ORIGINAL`, then changed it to `OVERWRITTEN`. New focused tests preserve external bytes and ordinary UTF-8/apostrophe paths, reject linked operations, and exercise actual SSH scripts via local Bash. `O08-focused.log`: 12/12.
- `O08-npm-test.log`: 1272 = 1258 pass / same 7 inherited failures / 7 skips; lint/build/theme logs passed.
- Previously completed integrated localhost SSH evidence (`real-localhost-ssh.log`) also has `structuredFile:true, symlinkWriteRejected:true`; the exact shared path helper was reused. Its broader service/lifecycle success is supplementary and is not claimed as a new branch-specific live run. No extra services were started.
- Public nonvisual before/after evidence and contract committed. Body `O08-PR.md`; Published after root review as https://github.com/Johanson-colab/Archimedes/pull/353; exact base/head verified, OPEN/non-draft/MERGEABLE.

Review follow-up pushed: `fd09fe8948a48a7556c966723cc3bef09f68110a`, two files 22+/8-, root-approved. Pilot no longer falls back after a nonmissing read error. Real Docker filesystem + runPilot read/edit regression and existing pilot/path/SSH checks 43/43 (`O08-review-focused.log`); original full-suite record remains initial-head evidence.
