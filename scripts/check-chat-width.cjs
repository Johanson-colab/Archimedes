const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const before = process.argv.includes("--before");
const capture = process.argv.find((arg) => arg.startsWith("--capture="))?.slice(10);
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-chat-width-"));
app.setPath("userData", path.join(temporary, "profile"));
app.commandLine.appendSwitch("disable-gpu");
const css = ["tokens.css", "styles.css", "native-agent.css", "harness-picker.css"].map((name) => before && name === "styles.css"
  ? execFileSync("git", ["show", "36f4259:src/styles.css"], { cwd: root, encoding: "utf8" })
  : fs.readFileSync(path.join(root, "src", name), "utf8")).join("\n");
// A deliberately wide figure/output tests the intrinsic size contribution that
// previously widened the implicit grid column and centered the composer offscreen.
const content = `<header class="main-toolbar">Chat layout regression</header><div class="main-workspace"><div class="main-view chat-main"><div class="conversation-layout"><div class="conversation-scroll-area"><div class="conversation-scroll"><div style="width:4800px;height:1px"></div><div class="conversation-thread"><article class="conversation-message assistant"><div class="conversation-message-copy"><p>Research response with a wide figure or command output.</p><pre><code>${"long_native_output_".repeat(350)}</code></pre></div></article></div></div></div><div class="conversation-composer-wrap"><div class="conversation-composer"><textarea rows="3" placeholder="Message Archimedes"></textarea><div class="conversation-composer-footer">Codex</div></div></div></div></div></div>`;
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1400, height: 900, show: false, webPreferences: { contextIsolation: true, backgroundThrottling: false } });
  const results = [];
  for (const theme of ["paper", "charcoal"]) {
    const file = path.join(temporary, `${theme}.html`);
    fs.writeFileSync(file, `<style>${css}</style><main class="codex-shell theme-${theme}" style="height:100vh;grid-template-columns:280px minmax(0,1fr)"><aside></aside><section class="codex-main" style="grid-template-columns:minmax(0,1fr)">${content}</section></main>`);
    for (const width of [1400, 900]) {
      win.setSize(width, 900);
      await win.loadFile(file);
      const geometry = await win.webContents.executeJavaScript(`(() => {
        const host=document.querySelector('.chat-main').getBoundingClientRect();
        const scroll=document.querySelector('.conversation-scroll-area').getBoundingClientRect();
        const input=document.querySelector('.conversation-composer').getBoundingClientRect();
        return {host:host.width,scroll:scroll.width,inputLeft:input.left,inputRight:input.right,viewport:innerWidth,passed:scroll.width<=host.width+1&&input.left>=host.left&&input.right<=host.right+1};
      })()`);
      results.push({ theme, width, ...geometry });
      if (capture && width === 1400) {
        fs.mkdirSync(capture, { recursive: true });
        fs.writeFileSync(path.join(capture, `${theme}-${before ? "before" : "after"}.png`), (await win.webContents.capturePage()).toPNG());
      }
    }
  }
  console.log(JSON.stringify(results));
  win.destroy();
  fs.rmSync(temporary, { recursive: true, force: true });
  app.exit(results.every((result) => result.passed) ? 0 : 1);
}).catch((error) => { console.error(error.message); fs.rmSync(temporary, { recursive: true, force: true }); app.exit(1); });
