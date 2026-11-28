// Captures the review error shown when a manuscript handoff refresh rejects.
// Build first, then run the printed Electron runner to release the build heap.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage = process.argv[2];
if (!["before", "after"].includes(stage)) throw Error("Choose before or after.");
const baselineCommit = "a03baa6a";
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-review-refresh-error-"));
const output = path.join(root, "docs/assets/review-refresh-error");
fs.mkdirSync(output, { recursive: true });

const source = stage === "before"
  ? execFileSync("git", ["show", `${baselineCommit}:src/PaperReviewView.tsx`], { cwd: root, encoding: "utf8" })
  : fs.readFileSync(path.join(root, "src/PaperReviewView.tsx"), "utf8");
const marker = "async function startReview() {";
const begin = source.indexOf(marker) + marker.length;
const end = source.indexOf("\n  async function cancelReview()", begin);
if (begin < 0 || end < begin) throw Error("Could not extract startReview.");
const body = source.slice(begin, end).replace(/\n  }\s*$/, "").replace("const source: PaperReviewSource", "const source");
const startReview = new Function("running", "setError", "setNotice", "setProgress", "manuscript", "sourceKind", "paperId", "arxivInput", "pdfPath", "bridge", "confirm", "venueId", "workspace", "projectId", "t", "activeRunRef", "runningRef", "setRunning", "setTab", "refreshRuns", "emitProactiveSignal", `return (async () => {${body}})();`);
let error = "", unhandled = false;
try {
  await startReview(
    false,
    value => { error = value; },
    () => {},
    () => {},
    { origin: { workspaceId: "workspace-1", manifestPath: ".archimedes/manifest.json" }, destination: {} },
    "library",
    "paper-1",
    "",
    "",
    { prepareManuscriptReview: async () => { throw new Error("The manuscript changed on disk. Compile again before reviewing."); } },
    async () => true,
    "venue-1",
    "/fixture",
    "project-1",
    value => value,
    { current: "" },
    { current: false },
    () => {},
    () => {},
    async () => {},
    () => {},
  );
} catch {
  unhandled = true;
}
const geometry = { stage, viewport: [900, 220], unhandled, error };
fs.writeFileSync(path.join(output, `${stage}-geometry.json`), JSON.stringify(geometry, null, 2) + "\n");

const sourcePath = name => JSON.stringify(path.join(root, "src", name));
fs.writeFileSync(path.join(temporary, "index.html"), '<div id="root"></div><script type="module" src="./entry.tsx"></script>');
fs.writeFileSync(path.join(temporary, "entry.tsx"), `
import React from 'react'; import {createRoot} from 'react-dom/client';
import ${sourcePath("tokens.css")}; import ${sourcePath("styles.css")}; import ${sourcePath("typography.css")};
const still=document.createElement('style'); still.textContent='*,*::before,*::after{animation:none!important;transition:none!important}body{margin:0;background:#fff}.pra-compose{width:860px!important;padding:16px!important;background:#fff!important;color:#222!important}'; document.head.append(still);
createRoot(document.getElementById('root')).render(<main className="codex-shell theme-paper"><section className="pra-compose">
 <div className="pra-compose-row"><strong>Current compiled manuscript</strong><button type="button" className="primary-button">Run simulated review</button></div>
 <div className={${JSON.stringify(error)} ? "pra-notice error" : "pra-muted"}>{${JSON.stringify(error || "No error message")}}</div>
</section></main>);
`);
await build({ root: temporary, configFile: false, base: "./", resolve: { dedupe: ["react", "react-dom"], alias: { react: path.join(root, "node_modules/react"), "react-dom": path.join(root, "node_modules/react-dom") } }, build: { outDir: path.join(temporary, "dist"), minify: false, chunkSizeWarningLimit: 3000 } });

function capture({ temporary, output, stage, geometry }) {
  const { app, BrowserWindow } = require("electron");
  const fs = require("node:fs"), path = require("node:path");
  app.commandLine.appendSwitch("disable-gpu");
  app.setPath("userData", path.join(temporary, "profile"));
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 900, height: 220, show: false, webPreferences: { contextIsolation: true } });
    await win.loadFile(path.join(temporary, "dist/index.html"));
    await new Promise(resolve => setTimeout(resolve, 200));
    const text = await win.webContents.executeJavaScript("document.querySelector('.pra-notice')?.textContent || document.querySelector('.pra-muted')?.textContent || ''");
    fs.writeFileSync(path.join(output, `${stage}.png`), (await win.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(output, `${stage}-geometry.json`), JSON.stringify({ ...geometry, rendered: text }, null, 2) + "\n");
    console.log(JSON.stringify({ ...geometry, rendered: text }));
    const passed = stage === "before" ? geometry.unhandled && !geometry.error : !geometry.unhandled && text.includes("changed on disk");
    win.destroy();
    fs.rmSync(temporary, { recursive: true, force: true });
    app.exit(passed ? 0 : 1);
  }).catch(error => { console.error(error.message); fs.rmSync(temporary, { recursive: true, force: true }); app.exit(1); });
}
const runner = path.join(temporary, "capture.cjs");
fs.writeFileSync(runner, "(" + capture.toString() + ")(" + JSON.stringify({ temporary, output, stage, geometry }) + ");");
console.log(JSON.stringify({ runner }));
