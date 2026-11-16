# Development and release validation

The supported source toolchain is Node `^22.18.0 || >=24.0.0` and npm `^10.9.0 || ^11.0.0`. The dependency lock needs newer Node than the former Node20 instructions; the test suite also uses Node's default TypeScript stripping, enabled in Node22.18 ([Node documentation](https://nodejs.org/api/typescript.html)). `.node-version` and `packageManager` record the reproduction combination, Node26.13.0/npm11.20.0. A declared range is not a claim that every version/platform has been run.

Run `node scripts/check-toolchain.cjs` before installation, then `npm ci`. Project engine checks reject incompatible versions before dependency installation; the preinstall message also points to the reproduction versions. Dependency versions and lock resolutions are retained.

## Explicit desktop preparation

`npm run prepare:desktop` prepares the pinned Electron binary with a bounded installer lifetime (180 seconds by default, up to 600 seconds with `ARCHIMEDES_DESKTOP_PREPARE_TIMEOUT_MS`). `npm run check:desktop`, startup checks and test preflight read the executable path directly; they never evaluate Electron's auto-downloading Node entry.

`npm run test:core` runs non-desktop files for iteration. `npm run test:desktop` runs both real Chromium geometry regressions. **`npm test` includes every core test and both desktop regressions**, explicitly enables the formerly opt-in PDF root check, then checks theme tokens. A missing runtime or Linux display fails clearly; it is not silently skipped. Use `xvfb-run npm test` on headless Linux.

Before a PR, run `npm run lint`, `npm test`, and `npm run package:desktop`. The test command includes theme checks; desktop packaging includes TypeScript checking and the renderer build, so those steps do not need to be repeated separately. All standard tests must have zero failures. Preserve original business assertions when a fixture needs a new dependency. A separate core-only run cannot satisfy this gate.

## Build identity and packaging

`npm run build` records `.archimedes/build-info.json`; the packaging hook refreshes it and keeps the existing verified managed-TeX preparation. Only that metadata file is included from `.archimedes`, not research databases. The main process adds actual runtime platform, architecture and Electron version. Settings/About exposes the commit, channel, dirty flag, source fingerprint and source feature policy. The source fingerprint covers application code/configuration, not a signature of every installed byte. `ARCHIMEDES_BUILD_CHANNEL` can explicitly label a build; otherwise a tag/release branch is distinguished from development. This does not change either branch's cloud or app policy.

FigureForge semantic search uses its compiled browser worker and ONNX WASM. The unused `onnxruntime-node` dependency is excluded from the **desktop package**, while the locked source dependency remains for upstream compatibility. This does not make `npm ci` smaller. `node scripts/measure-package-runtime.cjs` measures the real builder dependency matcher against installed bytes; that number is not a final compressed installer saving.

For a final local, unpublished `npm run package:desktop`, test the actual resulting `app.asar`:

```sh
node scripts/prepare-semantic-worker-audit.cjs --asar /absolute/path/to/app.asar --out /tmp/archimedes-resource-audit
node scripts/run-semantic-worker-audit.cjs /tmp/archimedes-resource-audit
```

The second command runs the emitted `entry.cjs` with the prepared Electron executable and an isolated profile. It imports the unmodified bundled semantic worker, loads/compiles its packaged WASM and imports its ORT module from ASAR, with HTTP(S) blocked. Record `result.json`, then remove that audit directory. The fast mode without `--asar` uses current dist bytes in a resource fixture and does not substitute for the actual-package gate. This proves resource loading, **not CLIP inference**. In the actual packaged app, also verify that keyword search returns candidates when semantic loading is unavailable. Do not remove model weights, WASM or fallback to obtain a smaller package.

## Conditional integrations and resources

| Check | Resource it actually needs | Local, no-fee route / limit |
| --- | --- | --- |
| PDF root geometry | Prepared Electron and a display | Full `npm test` enables it; Linux can use Xvfb. |
| Built-in template compilation | `latexmk` and its TeX packages | Provide latexmk and the required packages, or record the specific missing resource. A Tectonic run does not make a latexmk-specific test pass. |
| Managed compiler live test | `ARCHIMEDES_TEX_TEST_BUNDLE`, a real flat Tectonic bundle and SHA256SUM | Serve a temporary local fixture and verify warm/offline recompile. A fake compiler tests orchestration only. |
| MemT PDF equations | `MEMT_PDF` local paper fixture | Use the specified publicly available paper in a temporary directory; report exact fixture/hash. |
| Kimi PPTD checker/converter | `KIMI_PPTD_TEST_PYZ` official local test tool | Generated fixtures cover export structure; they do not substitute for the official checker. |
| Supabase sharing / Realtime | Two authorized test accounts and `SUPABASE_LIVE_TESTS=1` | Local server/roles and fake SDK tests validate application behavior without accounts; they do not validate hosted Auth/Realtime. Use authorized test resources for hosted acceptance. |
| Docker reproduction | A running local Docker daemon and an available image | Use task-owned containers with explicit CPU/memory limits and remove them afterwards. Never touch unrelated containers. |
| SSH reproduction | SSH client, an isolated localhost sshd, ephemeral host/user keys | Use an unprivileged localhost port and temporary config/keys; do not change system SSH settings or connect to real research servers. |

Required affected integrations should run locally where possible. Record which remaining conditional cases could not run and why; a skip is not a pass. Installer/platform acceptance is separate: record source commit, package hash, platform/architecture, a new profile, local files/PDF/terminal and managed-compiler behavior. Validate each target platform/architecture separately. Publishing a release is a separate action from submitting a pull request.
