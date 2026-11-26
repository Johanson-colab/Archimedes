const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

function scaffoldApp({ workspace, appId, name = 'Research workspace', category = 'analysis', kind = 'static' } = {}) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(appId || '') || appId.length > 80) throw new Error('Invalid Research App ID.');
  if (!['static', 'python-http'].includes(kind) || !require('../shared/research-apps.json').categories.some(c => c.id === category)) throw new Error('Unsupported App template or category.');
  if (typeof name !== 'string' || !name.trim() || name.length > 80) throw new Error('App name must contain 1–80 characters.');
  const root = fs.realpathSync(workspace), apps = path.join(root, 'research-apps');
  fs.mkdirSync(apps, { recursive: true });
  if (fs.lstatSync(apps).isSymbolicLink()) throw new Error('Linked App directories are not supported.');
  const target = path.join(apps, appId);
  if (fs.lstatSync(target, { throwIfNoEntry: false })) throw new Error('App already exists. Validate/checkpoint it before editing; scaffold never overwrites source.');
  const stage = path.join(apps, `.scaffold-${randomUUID()}`);
  fs.mkdirSync(path.join(stage, 'public'), { recursive: true });
  const htmlName = name.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  try {
    const files = {
      '.gitignore': '.venv/\n.data/\n__pycache__/\n.env*\n',
      'research-app.json': JSON.stringify({ schemaVersion: 1, id: appId, name, category, version: '0.1.0', runtime: { kind, entry: kind === 'static' ? 'public/index.html' : 'app.py' } }, null, 2),
      'public/index.html': `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${htmlName}</title><link rel="stylesheet" href="/style.css"><main><p>RESEARCH WORKSPACE · DRAFT</p><h1>${htmlName}</h1><form id="task"><label for="input">Input</label><textarea id="input" required></textarea><button>Run example</button></form><p id="error" role="alert"></p><pre id="output" aria-live="polite">Ready</pre><p>Starter example only. Replace it with the requested research workflow before delivery.</p></main><script type="module" src="/app.js"></script></html>`,
      'public/style.css': 'body{margin:0;background:#faf9f6;color:#292824;font:16px system-ui}main{max-width:880px;margin:7vh auto;padding:32px}h1{font-size:42px;font-weight:500}form{display:grid;gap:16px}textarea,button{font:inherit;padding:14px;border:1px solid #d8d5cd;border-radius:8px}textarea{min-height:140px}button{justify-self:start;cursor:pointer}pre{white-space:pre-wrap;padding:24px;background:#fff}#error{color:#a33224}',
      'public/app.js': `import { requestAgent } from './archimedes.js';\n// Call requestAgent only when the App declares a backend and the user initiates it.\nvoid requestAgent;\ndocument.querySelector('#task').addEventListener('submit', async event => {\n  event.preventDefault(); const button = event.submitter; button.disabled = true;\n  document.querySelector('#error').textContent = '';\n  try { const input = document.querySelector('#input').value.trim();\n    ${kind === 'static' ? "document.querySelector('#output').textContent = input;" : "const response = await fetch('/api/process', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ input }) }); if (!response.ok) throw new Error('Request failed: ' + response.status); const result = await response.json(); document.querySelector('#output').textContent = result.output;"}\n  } catch (error) { document.querySelector('#error').textContent = error.message; } finally { button.disabled = false; }\n});`,
      'public/archimedes.js': `export function requestAgent(backend, prompt) {\n  if (window.parent === window) return Promise.reject(new Error('Open this App inside Archimedes.'));\n  const requestId = crypto.randomUUID();\n  return new Promise((resolve, reject) => {\n    const finish = (error, value) => { clearTimeout(timer); window.removeEventListener('message', receive); error ? reject(new Error(error)) : resolve(value); };\n    const receive = event => { const data = event.data; if (event.source !== parent || data?.type !== 'archimedes:agent-result' || data.requestId !== requestId) return; finish(data.error, data.result); };\n    const timer = setTimeout(() => finish('Agent request timed out.'), 600000);\n    window.addEventListener('message', receive);\n    parent.postMessage({ type: 'archimedes:agent-request', requestId, backend, prompt }, '*');\n  });\n}`,
      'research-app.checks.json': JSON.stringify({ schemaVersion: 1, starter: true, description: 'Starter echo flow only; replace with task-specific acceptance checks.', http: [{ path: '/' }, { path: '/app.js' }, { path: '/archimedes.js' }, { path: '/style.css' }], browser: [{ action: 'fill', selector: '#input', value: 'Sample research input' }, { action: 'click', selector: '#task button' }, { action: 'expect', selector: '#output', text: 'Sample research input' }] }, null, 2),
      'README.md': `# ${name}\n\nGenerated starter, not a finished research tool. Implement the requested workflow and replace the starter acceptance checks. Put mutable data in .data/. Never embed secrets. Validate inside Archimedes before installing.\n`,
    };
    if (kind === 'python-http') {
      files['requirements.txt'] = '# Standard library only. Add exact package==version pins when needed.\n';
      files['app.py'] = `import json, os\nfrom functools import partial\nfrom http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer\nfrom pathlib import Path\n\nclass Handler(SimpleHTTPRequestHandler):\n    def end_headers(self):\n        self.send_header('X-Archimedes-App-Token', os.environ['ARCHIMEDES_APP_TOKEN'])\n        super().end_headers()\n    def do_POST(self):\n        if self.path != '/api/process':\n            self.send_error(404); return\n        try:\n            size = int(self.headers.get('Content-Length', '0'))\n            if size < 0 or size > 1000000: raise ValueError('Input too large')\n            value = json.loads(self.rfile.read(size))\n            if not isinstance(value.get('input'), str): raise ValueError('Input must be text')\n            body = json.dumps({'output': value['input'].strip()}).encode()\n            self.send_response(200); self.send_header('Content-Type', 'application/json'); self.end_headers(); self.wfile.write(body)\n        except (ValueError, TypeError, AttributeError) as error:\n            self.send_error(400, str(error))\n\nif __name__ == '__main__':\n    ThreadingHTTPServer(('127.0.0.1', int(os.environ['PORT'])), partial(Handler, directory=str(Path(__file__).parent / 'public'))).serve_forever()\n`;
    }
    for (const [file, content] of Object.entries(files)) fs.writeFileSync(path.join(stage, file), content);
    fs.renameSync(stage, target);
    return { appId, directory: target, status: 'draft', note: 'Implement the requested workflow and acceptance plan; a scaffold is not a validated App.' };
  } finally { fs.rmSync(stage, { recursive: true, force: true }); }
}
module.exports = { scaffoldApp };
