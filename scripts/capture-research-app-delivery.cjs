// Capture the real renderer component before/after with identical fixture, viewport and theme.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const output = path.resolve(root, process.argv.find(arg => arg.startsWith('--capture='))?.slice(10) || 'docs/assets/create-delivery-pipeline');
if (process.versions.electron) {
  const { app, BrowserWindow } = require('electron');
  const input = process.argv.find(arg => arg.startsWith('--input='))?.slice(8);
  app.setPath('userData', path.join(input, 'profile'));
  app.whenReady().then(async () => {
    const win = new BrowserWindow({ width: 1400, height: 900, show: false, webPreferences: { sandbox: true, contextIsolation: true, backgroundThrottling: false } });
    for (const theme of ['paper', 'charcoal']) for (const version of ['before', 'after']) {
      await win.loadFile(path.join(input, `${theme}-${version}.html`));
      fs.writeFileSync(path.join(output, `${theme}-${version}.png`), (await win.webContents.capturePage()).toPNG());
    }
    win.destroy(); app.quit();
  }).catch(error => { console.error(error); app.exit(1); });
} else {
  (async () => {
    const React = require('react'), { renderToStaticMarkup } = require('react-dom/server');
    const { transformWithOxc } = await import('vite');
    const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'app-delivery-capture-'));
    fs.mkdirSync(output, { recursive: true });
    try {
      const css = ['tokens.css', 'styles.css', 'research-app-runtime.css'].map(file => fs.readFileSync(path.join(root, 'src', file), 'utf8')).join('\n');
      for (const version of ['before', 'after']) {
        const scope = { researchAppContext: () => ({ type: "archimedes:context", theme: "paper", tokens: {} }), React, ...React, ...require('lucide-react'), useUISettings: () => ({ t: value => value }), researchAppCategories: [] };
        for (const name of ['StateView', 'ResearchAppsView']) {
          let source = version === 'before' && name === 'ResearchAppsView' ? execFileSync('git', ['show', 'b7b3a46:src/ResearchAppsView.tsx'], { cwd: root, encoding: 'utf8' }) : fs.readFileSync(path.join(root, `src/${name}.tsx`), 'utf8');
          source = source.replace(/^import .*?;\r?\n/gm, '').replace(/export default function/g, 'function').replace(/export function/g, 'function');
          const { code } = await transformWithOxc(source, `${name}.tsx`, { jsx: { runtime: 'classic' } });
          Object.assign(scope, new Function(...Object.keys(scope), `${code.replace(/^export \{\};?$/gm, '')}\nreturn {${name}};`)(...Object.values(scope)));
        }
        const markup = renderToStaticMarkup(React.createElement(scope.ResearchAppsView, { workspace: '/research', appId: 'dataset-workspace', apps: [{ id: 'dataset-workspace', name: 'Dataset workspace', category: 'discovery', status: 'stopped', url: null, error: '', logs: '', installed: false, pinned: false, delivery: { status: 'draft', canRestore: false } }], bridge: {}, onRefresh() {}, onOpen() {}, onBack() {} }));
        for (const theme of ['paper', 'charcoal']) fs.writeFileSync(path.join(temporary, `${theme}-${version}.html`), `<!doctype html><html data-theme="${theme}"><meta charset="utf-8"><style>${css}\nhtml,body{margin:0;height:100%;}main{height:100vh;background:var(--surface-ground)}</style><main class="theme-${theme}">${markup}</main>`);
      }
      const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE;
      execFileSync(require('electron'), [__filename, `--input=${temporary}`, `--capture=${output}`], { cwd: root, env, timeout: 30000, stdio: 'inherit' });
      console.log(output);
    } finally { fs.rmSync(temporary, { recursive: true, force: true }); }
  })().catch(error => { console.error(error); process.exitCode = 1; });
}
