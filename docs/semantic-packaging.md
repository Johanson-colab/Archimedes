# Semantic search packaging

FigureForge semantic search runs in the renderer through the bundled `semantic-worker` and ONNX Runtime Web's JSEP WASM. Desktop packages do not need the native `onnxruntime-node` backend, so `electron-builder.config.cjs` excludes `node_modules/onnxruntime-node{,/**/*}` from the application files. The locked source dependency remains for `@huggingface/transformers` compatibility, so `npm ci` still installs it and this does not reduce install downloads.

## Dependency-byte check

After installing dependencies:

```sh
node scripts/measure-package-runtime.cjs
```

The script evaluates electron-builder's dependency matcher against the installed `onnxruntime-node` bytes and exits non-zero if the matcher keeps any of them. The reported value is dependency bytes, not compressed installer size.

## Packaged-app resource audit

After a real `app.asar` exists:

```sh
node scripts/prepare-semantic-worker-audit.cjs --asar /absolute/path/to/app.asar --out /tmp/archimedes-resource-audit
node scripts/run-semantic-worker-audit.cjs /tmp/archimedes-resource-audit
```

The audit runs the emitted `entry.cjs` with the installed Electron runtime and an isolated profile. It imports the original bundled semantic worker, fetches and compiles the packaged JSEP WASM, and imports the ORT module, with HTTP(S) blocked. It also rejects a source archive that still contains `onnxruntime-node`. Inspect `result.json`, then remove the temporary audit directory. Without `--asar`, the script checks current `dist` bytes in a fixture archive; that is a fast smoke check, not the packaged-app gate.

This verifies packaged resource loading only; CLIP inference also requires model weights. Keyword search remains the fallback: `ImageCreationView` shows lexical results before starting the semantic worker and keeps them if the worker or model is unavailable. Run the audit separately for each target platform and architecture.
