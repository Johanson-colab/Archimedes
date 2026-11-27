// Captures the source-range highlight produced when an evidence link opens a CRLF file.
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
const baselineCommit = "3b358265";
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-crlf-reveal-"));
const output = path.join(root, "docs/assets/crlf-evidence-reveal");
fs.mkdirSync(output, { recursive: true });

const source = stage === "before"
  ? execFileSync("git", ["show", `${baselineCommit}:src/PaperWritingView.tsx`], { cwd: root, encoding: "utf8" })
  : fs.readFileSync(path.join(root, "src/PaperWritingView.tsx"), "utf8");
const lineStartSource = /function lineStart\(content: string, line: number\) \{[\s\S]*?\n\}/.exec(source)?.[0].replace(/: string|: number/g, "");
const marker = "onOpenSource={(source) => {";
const begin = source.indexOf(marker) + marker.length;
const end = source.indexOf("\n      }}", begin);
if (!lineStartSource || begin < 0 || end < begin) throw Error("Could not extract the evidence source-open handler.");
const lineStart = new Function(`${lineStartSource}\nreturn lineStart;`)();
const handler = new Function("source", "setEvidenceDialog", "file", "openFile", "requestAnimationFrame", "owner", "lineStart", "editorRef", "revealSearchMatch", "Promise", source.slice(begin, end));

const raw = "Intro\r\n\\section{Methods}\r\nValue is 71\\%.\r\n\\end{document}\r\n";
const normalized = raw.replace(/\r\n?/g, "\n");
const target = "71";
const targetOffset = normalized.indexOf(target);
const line = normalized.slice(0, targetOffset).split("\n").length;
const column = targetOffset - normalized.lastIndexOf("\n", targetOffset - 1);
let observed;
handler(
  { sourcePath: "paper/main.tex", line, column, text: target },
  () => {},
  { path: "other.tex" },
  async () => {},
  callback => callback(),
  { documents: new Map([["paper/main.tex", { draft: raw }]]) },
  lineStart,
  { current: { focus() {}, setSelectionRange() {} } },
  (start, finish, content) => { observed = { start, finish, content }; },
  Promise,
);
await new Promise(resolve => setImmediate(resolve));
if (!observed) throw Error("The handler did not reveal a range.");
const geometry = { stage, viewport: [900, 260], expected: [targetOffset, targetOffset + target.length], observed: [observed.start, observed.finish] };
fs.writeFileSync(path.join(output, `${stage}-geometry.json`), JSON.stringify(geometry, null, 2) + "\n");

const sourcePath = name => JSON.stringify(path.join(root, "src", name));
fs.writeFileSync(path.join(temporary, "index.html"), '<div id="root"></div><script type="module" src="./entry.tsx"></script>');
fs.writeFileSync(path.join(temporary, "entry.tsx"), `
import React from 'react'; import {createRoot} from 'react-dom/client';
import ${sourcePath("tokens.css")}; import ${sourcePath("styles.css")}; import ${sourcePath("typography.css")};
const still=document.createElement('style'); still.textContent='*,*::before,*::after{animation:none!important;transition:none!important}body{margin:0}.latex-editor-pane{display:block!important;width:860px!important;height:220px!important}.latex-editor-body{display:grid!important;width:860px!important;height:220px!important;grid-template-columns:44px minmax(0,1fr)!important;background:#fbfbfa!important}.latex-line-numbers{padding:8px 8px 0 0!important;color:#6b706b!important;background:#f3f3f0!important}.latex-highlight,.latex-editor-textarea{padding:8px 12px!important;font:13px/1.6 monospace!important;color:#222!important}.latex-highlight{background:#fbfbfa!important}.latex-editor-textarea{color:transparent!important;background:transparent!important}'; document.head.append(still);
const content=${JSON.stringify(normalized)}, start=${observed.start}, finish=${observed.finish}, lines=content.split('\\n');
let offset=0;
const body=lines.map((line,index)=>{
  const from=offset, to=from+line.length; offset=to+1;
  if(start>=to||finish<=from) return <span className="latex-highlight-line" key={index}>{line||' '}</span>;
  const a=Math.max(0,start-from), b=Math.min(line.length,finish-from);
  return <span className="latex-highlight-line" key={index}>{line.slice(0,a)}<mark className="latex-search-match active">{line.slice(a,b)}</mark>{line.slice(b)}</span>;
});
createRoot(document.getElementById('root')).render(<main className="codex-shell theme-paper" style={{padding:'12px',background:'var(--bg-app)'}}>
 <section className="latex-editor-pane"><div className="latex-editor-body"><div className="latex-line-numbers">{lines.map((_,i)=><span key={i}>{i+1}</span>)}</div>
 <div className="latex-editor-layer"><pre className="latex-highlight">{body}</pre><textarea className="latex-editor-textarea" value={content} readOnly aria-label="Source" /></div></div></section></main>);
`);
await build({ root: temporary, configFile: false, base: "./", resolve: { dedupe: ["react", "react-dom"], alias: { react: path.join(root, "node_modules/react"), "react-dom": path.join(root, "node_modules/react-dom") } }, build: { outDir: path.join(temporary, "dist"), minify: false, chunkSizeWarningLimit: 3000 } });

function capture({ temporary, output, stage, geometry }) {
  const { app, BrowserWindow } = require("electron");
  const fs = require("node:fs"), path = require("node:path");
  app.commandLine.appendSwitch("disable-gpu");
  app.setPath("userData", path.join(temporary, "profile"));
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 900, height: 260, show: false, webPreferences: { contextIsolation: true, backgroundThrottling: false } });
    await win.loadFile(path.join(temporary, "dist/index.html"));
    await new Promise(resolve => setTimeout(resolve, 250));
    const text = await win.webContents.executeJavaScript("document.querySelector('.latex-search-match')?.textContent || ''");
    fs.writeFileSync(path.join(output, `${stage}.png`), (await win.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(output, `${stage}-geometry.json`), JSON.stringify({ ...geometry, highlighted: text }, null, 2) + "\n");
    console.log(JSON.stringify({ ...geometry, highlighted: text }));
    const passed = stage === "before" ? text === "\\%" : text === "71";
    win.destroy();
    fs.rmSync(temporary, { recursive: true, force: true });
    app.exit(passed ? 0 : 1);
  }).catch(error => { console.error(error.message); fs.rmSync(temporary, { recursive: true, force: true }); app.exit(1); });
}
const runner = path.join(temporary, "capture.cjs");
fs.writeFileSync(runner, "(" + capture.toString() + ")(" + JSON.stringify({ temporary, output, stage, geometry }) + ");");
console.log(JSON.stringify({ runner }));
