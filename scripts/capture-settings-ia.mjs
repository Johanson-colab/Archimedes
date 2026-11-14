// Credential-free SettingsModal fixture rendered by the real Electron shell.
// Build first, then run the printed runner separately to release the build heap.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { build } from "vite";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const stage = process.argv[2];
if (!["before", "after"].includes(stage)) throw new Error("Choose before or after.");
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-settings-ia-"));
const output = path.join(root, "docs/assets/settings-information-architecture");
fs.mkdirSync(output, { recursive: true });
const baselineFiles = ["SettingsModal.tsx", "ModelSettingsModal.tsx", "AgentBackendSettings.tsx", "styles.css"];
const baseline = new Map(stage === "before"
  ? baselineFiles.map((name) => [path.join(root, "src", name).replaceAll("\\", "/"), execFileSync("git", ["show", `origin/main:src/${name}`], { cwd: root, encoding: "utf8" })])
  : []);
const baselineSource = (id) => baseline.get(String(id).split("?")[0].replaceAll("\\", "/"));
const source = (name) => JSON.stringify(path.join(root, "src", name));
fs.writeFileSync(path.join(temporary, "index.html"), '<div id="root"></div><script type="module" src="./entry.tsx"></script>');
fs.writeFileSync(path.join(temporary, "entry.tsx"), `
import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { UISettingsProvider } from ${source("i18n.tsx")};
import SettingsModal from ${source("SettingsModal.tsx")};
import { applyAppearance, normalizeAppearance } from ${source("appearance.ts")};
import { defaultJourneySettings } from ${source("journeySettings.ts")};
import { DEFAULT_PROACTIVE_SETTINGS } from ${source("proactive-types.ts")};
import { DEFAULT_WORKBENCH_PREFERENCES } from ${source("workbench-tabs.tsx")};
import { DEFAULT_SESSION_TOOL_PREFERENCES } from ${source("session-tools.ts")};
import ${source("tokens.css")}; import ${source("styles.css")}; import ${source("typography.css")};
const params = new URLSearchParams(location.search);
const theme = params.get('theme') || 'paper';
const still = document.createElement('style');
still.textContent = '*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}';
document.head.append(still);
localStorage.setItem('archimedes-language', 'en');
const appearance = normalizeAppearance({ preset: theme });
applyAppearance(document.documentElement, appearance, theme);
const profiles = {
  codex: { binary: 'codex', model: '', effort: '', permissionMode: 'read-only' },
  claude: { binary: 'claude', model: '', effort: '', permissionMode: 'ask' },
  opencode: { binary: 'opencode', model: '', effort: '', permissionMode: 'ask' },
};
const bridge = {
  getModelConfig: async () => ({ provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-5.6-sol', hasApiKey: true, inheritedFromAgent: false }),
  saveModelConfig: async (input) => ({ ...input, hasApiKey: true, inheritedFromAgent: false }),
  testModelConfig: async () => ({ latencyMs: 42, resolvedModel: 'gpt-5.6-sol' }),
  getAgentBackendConfig: async () => ({ backend: 'codex', ...profiles.codex, profiles }),
  saveAgentBackendConfig: async (input) => input,
  checkAgentBackend: async () => ({ ready: true, message: 'Connected', models: [], effectiveModelId: '' }),
  listCodexModelCatalog: async () => ({ models: [], effectiveModelId: '' }),
};
const terminalSettings = {
  platform: 'darwin', shell: 'auto', customShell: '', fontFamily: '', fontSize: 12, scrollback: 10000,
  externalTerminal: 'auto', externalTerminalLabel: 'Ghostty', detectedShell: '/bin/zsh', detectedShellName: 'zsh', onboarded: true,
};
function Fixture() {
  const [section, setSection] = useState(params.get('section') || 'general');
  const [journeySettings, setJourneySettings] = useState(defaultJourneySettings);
  const [proactiveSettings, setProactiveSettings] = useState(DEFAULT_PROACTIVE_SETTINGS);
  const [workbenchPreferences, setWorkbenchPreferences] = useState(DEFAULT_WORKBENCH_PREFERENCES);
  const [sessionTools, setSessionTools] = useState(DEFAULT_SESSION_TOOL_PREFERENCES);
  return <SettingsModal
    open section={section} onSectionChange={setSection} onClose={() => {}}
    themePreference={theme} theme={theme} systemAppearance={theme}
    onThemePreferenceChange={() => {}} appearance={appearance} onAppearanceChange={() => {}}
    bridge={bridge} onModelSaved={() => {}}
    executionPreferences={{ reasoningEffort: 'medium', contextLength: 'standard', capabilities: { thinkingEfforts: [], contextLengths: [] }, onReasoningEffort: () => {}, onContextLength: () => {} }}
    workspace="/Users/researcher/Archimedes Demo" workspaceReady agentBusy={false} onChooseWorkspace={() => {}}
    journeySettings={journeySettings} onSaveJourneySettings={async (patch) => setJourneySettings((current) => ({ ...current, ...patch }))} onResetJourneySettings={async () => setJourneySettings(defaultJourneySettings)}
    onOpenModels={() => setSection('models')}
    terminalSettings={terminalSettings} onSaveTerminalSettings={async () => {}} onOpenExternalTerminal={async () => {}}
    workbenchPreferences={workbenchPreferences} onChangeWorkbenchPreferences={setWorkbenchPreferences} onResetWorkbenchPreferences={() => setWorkbenchPreferences(DEFAULT_WORKBENCH_PREFERENCES)}
    proactiveSettings={proactiveSettings} onChangeProactiveSettings={(patch) => setProactiveSettings((current) => ({ ...current, ...patch }))}
    onResetProactiveHistory={() => {}} proactiveHistoryCount={2} onObserveProactive={() => {}}
    sessionTools={sessionTools} onSessionToolsChange={(patch) => setSessionTools((current) => ({ ...current, ...patch }))}
    identity={{ userId: 'local', displayName: 'Researcher', email: '' }} onSaveIdentity={async (name) => ({ userId: 'local', displayName: name, email: '' })}
    activeProject={{ id: 'project-1', name: 'Agent research', owner_id: 'local', created_at: new Date().toISOString() }} activeThreadId="thread-1"
    onProjectsChanged={async () => {}}
    authState={{ configured: true, user: null }} onSignIn={async () => ({})} onSignUp={async () => ({})} onSignOut={async () => ({})} onOpenAuth={() => {}}
    disabledCoreModules={[]} onCoreModuleEnabled={() => {}}
  />;
}
createRoot(document.getElementById('root')).render(<UISettingsProvider><Fixture /></UISettingsProvider>);
`);
await build({
  root: temporary,
  configFile: false,
  base: "./",
  resolve: { dedupe: ["react", "react-dom"], alias: { react: path.join(root, "node_modules/react"), "react-dom": path.join(root, "node_modules/react-dom"), "lucide-react": path.join(root, "node_modules/lucide-react") } },
  plugins: [{ name: "baseline", enforce: "pre", load(id) { return baselineSource(id); } }],
  build: { outDir: path.join(temporary, "dist"), minify: false, chunkSizeWarningLimit: 3000 },
});

function capture({ temporary, output, stage }) {
  const { app, BrowserWindow } = require("electron");
  const fs = require("node:fs");
  const path = require("node:path");
  app.commandLine.appendSwitch("disable-gpu");
  app.setPath("userData", path.join(temporary, "profile"));
  const pause = (ms = 120) => new Promise((resolve) => setTimeout(resolve, ms));
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 1180, height: 900, show: false, webPreferences: { contextIsolation: true, backgroundThrottling: false } });
    const evaluate = (fn, argument) => win.webContents.executeJavaScript("(" + fn.toString() + ")(" + JSON.stringify(argument) + ")");
    const observations = [];
    const cases = [
      { name: "general", section: "general" },
      { name: "research-path", section: stage === "before" ? "journey" : "journey" },
      { name: "proactive", section: "proactive" },
      { name: "terminal", section: "terminal" },
      { name: "comments", section: "assistant", click: "Comments" },
      { name: "snapshots", section: "assistant", click: "Snapshots" },
    ];
    for (const theme of ["paper", "charcoal"]) {
      for (const item of cases) {
        if (stage === "before" && (item.name === "comments" || item.name === "snapshots")) continue;
        await win.loadFile(path.join(temporary, "dist/index.html"), { query: { theme, section: item.section } });
        for (let attempt = 0; attempt < 40; attempt += 1) {
          if (await evaluate(() => Boolean(document.querySelector(".settings-modal .settings-header h2")))) break;
          await pause(60);
        }
        if (item.click) {
          await evaluate((label) => {
            const button = [...document.querySelectorAll(".settings-subnav button")].find((node) => node.textContent.trim() === label);
            if (!button) throw new Error(`Missing subnav ${label}`);
            button.click();
          }, item.click);
          await pause(200);
        }
        await evaluate(() => { const body = document.querySelector(".settings-body"); if (body) body.scrollTop = 0; });
        await pause(120);
        const state = await evaluate(() => {
          const body = document.querySelector(".settings-body");
          const navLabels = [...document.querySelectorAll(".settings-nav-item span")].map((node) => node.textContent.trim());
          const groupLabels = [...document.querySelectorAll(".settings-nav-group-label")].map((node) => node.textContent.trim());
          const subnav = [...document.querySelectorAll(".settings-subnav button")].map((node) => node.textContent.trim());
          const icons = [...document.querySelectorAll(".provider-icon")].slice(0, 12).map((node) => ({ text: node.parentElement?.textContent?.trim().slice(0, 24), background: getComputedStyle(node).backgroundColor, logo: Boolean(node.querySelector(".provider-brand-logo")) }));
          return {
            heading: document.querySelector(".settings-header h2")?.textContent.trim(),
            navLabels,
            groupLabels,
            subnav,
            overflow: body ? body.scrollWidth > body.clientWidth : false,
            customIcon: [...document.querySelectorAll(".provider-option")].some((button) => button.textContent.trim().startsWith("Custom") && button.querySelector(".provider-icon")),
            icons,
          };
        });
        observations.push({ theme, case: item.name, ...state });
        fs.writeFileSync(path.join(output, `${theme}-${item.name}-${stage}.png`), (await win.webContents.capturePage()).toPNG());
      }

      // Models: API provider list with Custom selected, then the harness cards.
      for (const [name, click] of [["models-custom", "Custom"], ["models-harnesses", null]]) {
        await win.loadFile(path.join(temporary, "dist/index.html"), { query: { theme, section: "models" } });
        for (let attempt = 0; attempt < 40; attempt += 1) {
          if (await evaluate(() => Boolean(document.querySelector(".provider-option")))) break;
          await pause(60);
        }
        if (click) {
          await evaluate((label) => {
            const button = [...document.querySelectorAll(".provider-option")].find((node) => node.textContent.trim().startsWith(label));
            if (!button) throw new Error(`Missing provider ${label}`);
            button.click();
          }, click);
        } else {
          await evaluate(() => document.querySelector('[data-value="agents"]')?.click());
          for (let attempt = 0; attempt < 40; attempt += 1) {
            if (await evaluate(() => Boolean(document.querySelector(".agent-backend-card")))) break;
            await pause(60);
          }
        }
        await pause(220);
        const state = await evaluate(() => ({
          heading: document.querySelector(".settings-header h2")?.textContent.trim(),
          providerIcons: [...document.querySelectorAll(".provider-option .provider-icon")].map((node) => ({ text: node.parentElement?.textContent?.trim().slice(0, 24), background: getComputedStyle(node).backgroundColor, border: getComputedStyle(node).borderTopWidth })),
          harnessIcons: [...document.querySelectorAll(".agent-backend-card .provider-icon")].map((node) => ({ text: node.parentElement?.textContent?.trim().slice(0, 24), background: getComputedStyle(node).backgroundColor, width: node.getBoundingClientRect().width })),
          customHasIcon: [...document.querySelectorAll(".provider-option")].some((button) => button.textContent.trim().startsWith("Custom") && button.querySelector(".provider-icon")),
        }));
        observations.push({ theme, case: name, ...state });
        fs.writeFileSync(path.join(output, `${theme}-${name}-${stage}.png`), (await win.webContents.capturePage()).toPNG());
      }
    }
    console.log(JSON.stringify(observations));
    fs.writeFileSync(path.join(output, `${stage}-observations.json`), JSON.stringify(observations, null, 2) + "\n");
    const passed = stage === "before" || observations.every((item) => !item.overflow && !item.customHasIcon && (item.providerIcons || []).every((icon) => icon.background === "rgba(0, 0, 0, 0)") && (item.harnessIcons || []).every((icon) => icon.background === "rgba(0, 0, 0, 0)"));
    win.destroy();
    try { fs.rmSync(temporary, { recursive: true, force: true }); } catch { /* Electron may still release profile handles. */ }
    app.exit(passed ? 0 : 1);
  }).catch((error) => {
    console.error(error);
    try { fs.rmSync(temporary, { recursive: true, force: true }); } catch { /* The temporary profile is safe to leave for cleanup. */ }
    app.exit(1);
  });
}
const runner = path.join(temporary, "capture.cjs");
fs.writeFileSync(runner, "(" + capture.toString() + ")(" + JSON.stringify({ temporary, output, stage }) + ");");
console.log(JSON.stringify({ runner }));
