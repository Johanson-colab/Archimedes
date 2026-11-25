# Local Research App lifecycle

Tracks #256 and PR #428. Implementation approved by the project owner's instruction to continue the host-runtime, embedded-preview and sidebar-installation increment.

## Supported Apps

This increment supports static pages and local Python HTTP applications. Their creator may be the API harness, Codex, Claude Code or OpenCode; the runtime does not depend on the conversation that generated the files. Apps can optionally declare Agent backends, skill instructions and Environment key names. Python dependencies can be set up after approval. Arbitrary shell launch commands and Node package installation are not supported.

An App lives in the active workspace:

```text
research-apps/my-app/
├── research-app.json
├── app.py                    # Python HTTP case
├── requirements.txt          # installed explicitly into the App's .venv
├── .venv/                    # not shipped in portable source
├── .capabilities/            # optional pinned skill resources
└── public/index.html         # static case
```

Example manifest (see `shared/research-app.schema.json`):

```json
{
  "schemaVersion": 1,
  "id": "my-app",
  "name": "My Research App",
  "description": "A small workspace tool",
  "version": "0.1.0",
  "category": "analysis",
  "runtime": { "kind": "python-http", "entry": "app.py" }
}
```

Static pages use `{"kind":"static","entry":"public/index.html"}`. Only the public directory is served, with bounded assets, no hidden files or symlinks, a restrictive Content Security Policy, and no directory listing.

Python HTTP applications must:

1. Use their own `.venv/bin/python`, or `.venv/Scripts/python.exe` on Windows. The host does not silently use an unrelated system interpreter or install packages.
2. Bind to `127.0.0.1`, using the integer in `PORT` supplied by the host.
3. Serve the page at `/`; successful GET `/` responses must include `X-Archimedes-App-Token` with the value in `ARCHIMEDES_APP_TOKEN`. The host uses this ephemeral identity to reject readiness responses from unrelated processes. Do not log this value.
4. Use relative frontend fetches. Keep file/network accesses consistent with the app's stated purpose and keep output datasets separate from its source directory.

For the existing molecule-workbench example, the adaptation is a manifest plus the response header:

```python
self.send_header('X-Archimedes-App-Token', os.environ.get('ARCHIMEDES_APP_TOKEN', ''))
```

Its existing server already reads `PORT`; its RDKit business logic is unchanged.

## User workflow

1. Create saves the App source and manifest, then the completed turn refreshes the App list. The user can also refresh manually.
2. Open **Preview Research Apps** from Create, or **Settings → Research Apps → Created Research Apps → Open apps**.
3. Open a draft and choose **Start preview**. New or changed code requires a native approval dialog.
4. Inspect the page and logs; use **Stop app** or **Reload preview** as needed.
5. **Install and pin** records the reviewed source fingerprint and adds a workspace-scoped sidebar entry. Installing does not execute code automatically. Opening a pinned installed App starts it on demand.
6. Stop/reopen or restart Archimedes: installation and pinning persist; processes themselves do not survive quitting the host. Opening the App starts a new managed process with a new port.
7. Unpinning hides the entry while retaining installation. Uninstalling stops its process and removes the registration, preserving source, skill resources and data.

Each workspace stores its own installation records in `.archimedes/research-apps.json`. The main-process IPC handler verifies the request belongs to the window's active workspace. Generated code cannot register itself by calling a host bridge; the preview has no such bridge. Editing approved source requires a new approval at the next start/install.

## Execution and isolation boundaries

- Electron owns local service processes independently of native Agent sessions. Runtime URLs are only exposed after bounded readiness checks. Start errors and premature exits return a failed state with logs, not a purported working URL.
- Health checks run only for active Apps, with one bounded log buffer per App and at most four simultaneous runtimes. Start/stop are serialized per App. Host exit and last-window closure clean up owned processes and timers.
- Python receives a small OS/runtime environment allowlist, the selected port and the ephemeral readiness identity. Only manifest-declared Environment keys are read from the vault and injected after the App code and key names are approved. Other vault entries are not injected. Logs are suppressed for Apps receiving keys to avoid leaking secret values.
- Pages run in an iframe on a different loopback origin from the host, with scripts, same-origin API calls, forms and downloads enabled; top-level navigation, popups, camera, microphone and geolocation are excluded. They do not execute as trusted same-context sidebar plugins.
- This is page isolation, **not an OS sandbox for Python**. Local App code runs with the user's filesystem/network permissions. Installation/start approval states this explicitly; source review and dependency provenance remain important.
- Unchanged installed source retains approval. Dependency environments are intentionally excluded from the source fingerprint, so this is not a complete software supply-chain attestation. Updating installed packages requires its own existing approval workflow.

## Validation

Runtime behavior tests cover static preview, installation/pinning persistence, restart, stop/uninstall without data deletion, unsafe paths, isolated workspaces, changed-source approval, declined approval and missing Python environments. A real Python HTTP child verifies assigned ports, readiness identity and environment credential exclusion. Renderer tests cover draft discovery without execution, the start/stop/install controls, iframe restrictions, one on-demand start for a pinned App, and installation without implicit execution. Cancellation tests ensure an older approval cannot stop a replacement runtime. macOS native UI verification uses the existing RDKit molecule App and synthetic sample data. Windows process cleanup is implemented but was not manually tested on Windows.

## Remaining work

Streaming and resumable App Agent sessions; package update/repair, Node and non-Python dependency setup; editing/version migration; a dedicated live code editor and isolated build/repair sandbox. The current Creator can generate files through its normal tools, but those larger workflows must not be presented as already implemented.

## Optional App capabilities

Add only what the App needs to its manifest: `"environment": ["OPENALEX_API_KEY"]`, `"agents": ["codex", "claude"]`, and `"skills": ["paper-lookup"]`. Skills must be present at `.capabilities/<id>/SKILL.md`; export them during creation. Static pages cannot receive Environment keys. The native start/install dialog displays requested key names; the values stay out of renderer IPC and are passed to the approved Python process at start. App code has the user's permissions and can use or transmit keys, so approval must be limited to reviewed code. Key values are not included in the source fingerprint; updating a value does not require reapproval.

For Python dependencies, provide `requirements.txt` with one exact `package==version` per line. **Set up dependencies** asks the user before creating `.venv` and installing from PyPI. It does not replace an existing environment. If setup fails, the incomplete environment remains for review and must be removed before retrying. Only direct packages are pinned; transitive dependencies are not locked. Python itself must already be available on PATH.

An embedded page can request a declared Agent using `parent.postMessage({type: "archimedes:agent-request", requestId: "unique-id", backend: "codex", prompt: "..."}, "*")`. Listen for `archimedes:agent-result` from `parent` and match `requestId`; the message contains `result` or `error`. Requests from other windows or origins are ignored. The native host displays the full prompt for approval and asks separately for each tool operation. Codex runs in a temporary session and read-only mode; Claude Code and OpenCode use one-shot native sessions with their normal approval adapters. All declared skill files are identified in the prompt. Responses are final text only; no streaming, resumable session or native question card is provided. Shared Environment-vault entries are not injected into these Agent processes by this App integration, although native CLIs still inherit the host's normal process environment and native configuration. Stopping the App cancels its active Agent request.
