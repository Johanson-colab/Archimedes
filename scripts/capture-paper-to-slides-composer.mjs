// Captures whether an attachment added during Paper to Slides startup remains in the accepted thread.
// Build first, then run the printed Electron runner to release the build heap.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build, transformWithOxc } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage = process.argv[2];
if (!["before", "after"].includes(stage)) throw Error("Choose before or after.");
const baselineCommit = "3cd9e25a";
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-slides-composer-"));
const output = path.join(root, "docs/assets/paper-to-slides-composer-send");
fs.mkdirSync(output, { recursive: true });
const source = stage === "before"
  ? execFileSync("git", ["show", `${baselineCommit}:src/App.tsx`], { cwd: root, encoding: "utf8" })
  : fs.readFileSync(path.join(root, "src/App.tsx"), "utf8");

function extractFunction(name, nextName) {
  const start = source.indexOf(`  function ${name}(`);
  const end = source.indexOf(`\n  ${nextName}`, start);
  if (start < 0 || end < start) throw Error(`Could not extract ${name}.`);
  return source.slice(start, end);
}

function extractHandler() {
  const marker = '"paper-to-slides": <PaperToSlidesView';
  const start = source.indexOf("onStart={async ", source.indexOf(marker));
  const end = source.indexOf("\n    }} />", start);
  if (start < 0 || end < start) throw Error("Could not extract Paper to Slides onStart.");
  return `const onStart = ${source.slice(start + "onStart={".length, end)}\n    };`;
}

async function evaluate(fragment, bindings, returned) {
  const { code } = await transformWithOxc(fragment, "composer-capture.tsx", { jsx: { runtime: "classic" } });
  return new Function(...Object.keys(bindings), `${code}\nreturn ${returned};`)(...Object.values(bindings));
}

function ownerKey(dataRoot, threadId, draftKey) {
  return threadId ? JSON.stringify([dataRoot, "thread", threadId]) : JSON.stringify([dataRoot, "draft", draftKey]);
}

const workspace = "/fixture/workspace";
const projectId = "project-fixture";
const workspaceId = "workspace-fixture";
const draftKey = `new:${projectId}:${workspace}`;
const previousOwner = ownerKey(workspace, "previous-thread", "previous-thread");
const targetOwner = ownerKey(workspace, null, draftKey);
const threadOwner = ownerKey(workspace, "slides-thread");
const previousSlot = { id: "previous-composer", session: { context: [{ id: "submitted", type: "file", name: "paper.pdf" }], queued: [], paused: false } };
const composerSlots = { current: new Map([[previousOwner, previousSlot]]) };
const pendingComposerSend = { current: null };
const currentComposerSlot = { current: previousSlot };
const noop = () => {};
let resolveSubmission;
const submissions = [];
const updateComposer = (slot, update) => { slot.session = update(slot.session); };
const bindings = {
  workspace,
  executionWorkspace: workspace,
  activeProjectId: projectId,
  activeWorkspaceId: workspaceId,
  activeThreadId: "previous-thread",
  agentBusy: false,
  workspaceOpeningRef: { current: false },
  workspaces: [{ id: workspaceId, project_id: projectId, root: workspace, is_default: true }],
  projects: [],
  composerOwner: previousOwner,
  composerDraftKey: "previous-thread",
  composerSlot: previousSlot,
  composerSlots,
  pendingComposerSend,
  currentComposerSlot,
  composerOwnerKey: ownerKey,
  readComposerDraft: () => null,
  writeComposerDraft: noop,
  clearPendingAssistantDeltas: noop,
  initialMessages: [],
  threadOpenRequestRef: { current: 0 },
  activeThreadIdRef: { current: "previous-thread" },
  setRemoteServerId: noop,
  setMainSection: noop,
  setChatViewNonce: noop,
  setActiveProjectId: noop,
  setActiveWorkspaceId: noop,
  setActiveThreadId: noop,
  setBoundHarness: noop,
  setThreadVisibility: noop,
  setMessages: noop,
  setTrajectoryEvents: noop,
  setPendingAction: noop,
  setChangeSets: noop,
  updateComposer,
  setContextItems: update => updateComposer(previousSlot, session => ({ ...session, context: update(session.context) })),
  desktopBridge: { stagePaperToSlidesPdf: async () => `${workspace}/.archimedes/paper-to-slides/input.pdf` },
  reasoningEffort: "high",
  contextLength: "standard",
  submitPrompt: (...args) => {
    submissions.push(args);
    return new Promise(resolve => { resolveSubmission = resolve; });
  },
  crypto: { randomUUID: () => "capture-composer" },
};
const startNewTask = await evaluate(extractFunction("startNewTask", "async function runConversationCommand"), bindings, "startNewTask");
const acceptComposerSend = await evaluate(extractFunction("acceptComposerSend", "const executionWorkspaceRef"), bindings, "acceptComposerSend");
const onStart = await evaluate(extractHandler(), { ...bindings, startNewTask }, "onStart");
const starting = onStart({ pdfPath: "/fixture/paper.pdf", backend: "codex", language: "English", length: "12", instructions: "" });
await new Promise(resolve => setImmediate(resolve));
const submission = submissions[0];
const send = submission[9];
const draftSlot = composerSlots.current.get(targetOwner) ?? { id: "rendered-composer", session: { context: [], queued: [], paused: false } };
composerSlots.current.set(targetOwner, draftSlot);
const activeItems = [{ id: "attachment-during-start", type: "file", name: "method-notes.txt", detail: "/fixture/method-notes.txt", size: 2048 }];
draftSlot.session.context.push(...activeItems);
currentComposerSlot.current = draftSlot;
if (send) acceptComposerSend(send, "slides-thread");
const retained = Boolean(send && composerSlots.current.get(threadOwner)?.session.context.length);
const geometry = {
  stage,
  viewport: [900, 300],
  submittedAttachments: submission[4].length,
  retained,
  activeItems: retained ? activeItems : [],
};
resolveSubmission(true);
await starting;

const sourcePath = name => JSON.stringify(path.join(root, "src", name));
fs.writeFileSync(path.join(temporary, "index.html"), '<div id="root"></div><script type="module" src="./entry.tsx"></script>');
fs.writeFileSync(path.join(temporary, "entry.tsx"), `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {UISettingsProvider} from ${sourcePath("i18n.tsx")};
import {ContextChips} from ${sourcePath("ContextPicker.tsx")};
import ${sourcePath("tokens.css")}; import ${sourcePath("styles.css")}; import ${sourcePath("typography.css")};
localStorage.setItem('archimedes-language','en');
const still=document.createElement('style'); still.textContent='*,*::before,*::after{animation:none!important;transition:none!important}body{margin:0;background:#fff!important;color:#222!important}.codex-shell{background:#fff!important;color:#222!important}.slides-capture{padding:22px!important;font:13px system-ui!important}.slides-capture h1{font:600 18px system-ui!important;margin:0 0 6px!important}.slides-capture p{font:13px system-ui!important;margin:0 0 18px!important;color:#5c625d!important}.slides-composer{border:1px solid #d9e2dc!important;border-radius:8px!important;background:#fff!important;padding:12px!important}.slides-composer textarea{display:block;width:100%;height:54px;resize:none;border:0;outline:0;font:13px system-ui!important;color:#222!important;background:transparent!important}.slides-capture .attached-context-chip{font-size:12px!important;height:30px!important}.slides-result{margin-top:12px!important;font-size:12px!important;color:${retained ? "#35745d" : "#9a7629"}!important}'; document.head.append(still);
const items = ${JSON.stringify(geometry.activeItems)};
createRoot(document.getElementById('root')).render(<UISettingsProvider><main className="codex-shell theme-paper slides-capture">
 <h1>Paper to Slides</h1><p>Attachment added while the presentation agent is starting</p>
 <section className="slides-composer"><ContextChips items={items} onRemove={()=>{}} /><textarea readOnly value="" placeholder="Add a follow-up for the presentation…" /></section>
 <div className="slides-result">${retained ? "Attachment retained in the accepted thread" : "Attachment missing from the accepted thread"}</div>
</main></UISettingsProvider>);
`);
await build({
  root: temporary,
  configFile: false,
  base: "./",
  resolve: { dedupe: ["react", "react-dom"], alias: { react: path.join(root, "node_modules/react"), "react-dom": path.join(root, "node_modules/react-dom"), "lucide-react": path.join(root, "node_modules/lucide-react") } },
  build: { outDir: path.join(temporary, "dist"), minify: false, chunkSizeWarningLimit: 3000 },
});

function capture({ temporary, output, stage, geometry }) {
  const { app, BrowserWindow } = require("electron");
  const fs = require("node:fs"), path = require("node:path");
  app.commandLine.appendSwitch("disable-gpu");
  app.setPath("userData", path.join(temporary, "profile"));
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 900, height: 300, show: false, webPreferences: { contextIsolation: true, backgroundThrottling: false } });
    await win.loadFile(path.join(temporary, "dist/index.html"));
    await new Promise(resolve => setTimeout(resolve, 200));
    const observed = await win.webContents.executeJavaScript(`({ chips: [...document.querySelectorAll('.attached-context-chip')].map(node => node.textContent), result: document.querySelector('.slides-result')?.textContent })`);
    fs.writeFileSync(path.join(output, `${stage}.png`), (await win.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(output, `${stage}-geometry.json`), JSON.stringify({ ...geometry, observed }, null, 2) + "\n");
    console.log(JSON.stringify({ ...geometry, observed }));
    const passed = stage === "before" ? !geometry.retained && observed.chips.length === 0 : geometry.retained && observed.chips.length === 1;
    win.destroy();
    fs.rmSync(temporary, { recursive: true, force: true });
    app.exit(passed ? 0 : 1);
  }).catch(error => { console.error(error.message); fs.rmSync(temporary, { recursive: true, force: true }); app.exit(1); });
}
const runner = path.join(temporary, "capture.cjs");
fs.writeFileSync(runner, "(" + capture.toString() + ")(" + JSON.stringify({ temporary, output, stage, geometry }) + ");");
console.log(JSON.stringify({ runner }));
