const { randomUUID } = require('node:crypto');

// Runs a generated page in a fresh, nonpersistent Chromium session, with no host preload.
async function checkBrowser({ url, steps, signal, runAgent, onFrame = () => {} }, { BrowserWindow, session } = require('electron')) {
  const trace = value => { if (process.env.ARCHIMEDES_DELIVERY_TRACE) console.error('[browser]', value); };
  const origin = new URL(url).origin, partition = `research-app-check-${randomUUID()}`;
  const isolated = session.fromPartition(partition);
  isolated.setPermissionRequestHandler((_contents, _permission, respond) => respond(false));
  isolated.setPermissionCheckHandler(() => false);
  const window = new BrowserWindow({ show: false, width: 1280, height: 900, webPreferences: { partition, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: false } });
  const errors = [], checks = []; let timer, bridgeTimer; const inFlight = new Set();
  const stop = () => { if (!window.isDestroyed()) window.destroy(); };
  signal?.addEventListener('abort', stop, { once: true });
  const timeout = new Promise((_, reject) => { timer = setTimeout(() => { stop(); reject(new Error('Browser acceptance exceeded 90 seconds.')); }, 90000); });
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event, target) => { if (new URL(target).origin !== origin) event.preventDefault(); });
  isolated.on('will-download', event => event.preventDefault());
  isolated.webRequest.onCompleted(details => {
    if (details.statusCode >= 400 && ['mainFrame', 'script', 'stylesheet', 'image', 'font'].includes(details.resourceType)) errors.push(`Resource failed (${details.statusCode}, ${details.resourceType}).`);
  });
  window.webContents.on('console-message', event => { if ((event.level === 'error' || event.level === 3) && !String(event.message).startsWith('Failed to load resource:')) errors.push('The page reported a console error.'); });
  try {
    const work = async () => {
      if (signal?.aborted) throw new Error('Validation cancelled.');
      const shell = '<!doctype html><html><meta charset="utf-8"><style>html,body,iframe{margin:0;width:100%;height:100%;border:0}</style><iframe sandbox="allow-scripts allow-same-origin allow-forms allow-downloads" referrerpolicy="no-referrer"></iframe></html>';
      trace('loading shell');
      await window.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(shell));
      window.webContents.debugger.attach('1.3');
      window.webContents.debugger.on('message', (_event, method) => { if (method === 'Runtime.exceptionThrown') errors.push('The page raised an uncaught JavaScript exception.'); });
      await window.webContents.debugger.sendCommand('Runtime.enable');
      await window.webContents.executeJavaScript(`{
        const frame = document.querySelector('iframe'); window.agentQueue = [];
        addEventListener('message', event => { const data = event.data;
          if (event.source === frame.contentWindow && event.origin === ${JSON.stringify(origin)} && data?.type === 'archimedes:agent-request' && typeof data.requestId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(data.requestId) && typeof data.prompt === 'string' && data.prompt.length <= 12000 && window.agentQueue.length < 10) window.agentQueue.push({ requestId: data.requestId, backend: data.backend, prompt: data.prompt });
        }); frame.src = ${JSON.stringify(url)};
      }`);
      bridgeTimer = setInterval(async () => {
        if (window.isDestroyed()) return;
        try {
          const requests = await window.webContents.executeJavaScript('window.agentQueue.splice(0)');
          for (const request of requests) {
            if (inFlight.has(request.requestId)) continue; inFlight.add(request.requestId);
            const operation = runAgent ? runAgent({ backend: request.backend, prompt: request.prompt }) : Promise.reject(new Error('This workflow requires the host Agent bridge.'));
            void Promise.resolve(operation).then(result => ({ result }), () => ({ error: 'Agent acceptance request failed or was not approved.' })).then(async payload => {
              if (!window.isDestroyed()) {
                const message = { type: 'archimedes:agent-result', requestId: request.requestId, ...payload };
                await window.webContents.executeJavaScript(`document.querySelector('iframe').contentWindow.postMessage(${JSON.stringify(message)}, ${JSON.stringify(origin)})`);
              }
            }).catch(() => {}).finally(() => inFlight.delete(request.requestId));
          }
        } catch { /* window closed */ }
      }, 100);
      let frame;
      const frameDeadline = Date.now() + 10000;
      while (!frame && Date.now() < frameDeadline) {
        frame = window.webContents.mainFrame.frames.find(candidate => candidate.url.startsWith(origin + '/'));
        if (!frame) await new Promise(resolve => setTimeout(resolve, 50));
      }
      trace('frame loaded: ' + Boolean(frame));
      if (!frame) throw new Error('The App frame did not load.');
      for (const step of steps) {
        if (signal?.aborted) throw new Error('Validation cancelled.');
        trace(step.action + ' ' + step.selector);
        const deadline = Date.now() + 15000; let result = false;
        while (!result && Date.now() < deadline) {
          if (signal?.aborted) throw new Error('Validation cancelled.');
          result = await frame.executeJavaScript(`(() => {
            if (document.readyState !== 'complete') return false;
            const step = ${JSON.stringify(step)};
            const elements = document.querySelectorAll(step.selector), element = elements[0];
            if (step.action === 'expect') return (step.count === undefined || elements.length === step.count) && (step.text === undefined || (element && element.textContent.includes(step.text))) && (step.value === undefined || (element && element.value === step.value));
            if (!element || element.disabled) return false;
            if (step.action === 'click') element.click();
            else {
              const prototype = element instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : element instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
              Object.getOwnPropertyDescriptor(prototype, 'value').set.call(element, step.value);
              element.dispatchEvent(new Event('input', { bubbles: true })); element.dispatchEvent(new Event('change', { bubbles: true }));
            }
            return true;
          })()`);
          if (!result) await new Promise(resolve => setTimeout(resolve, 100));
        }
        checks.push({ action: step.action, selector: step.selector, passed: result === true });
        if (!result) throw new Error(`Browser ${step.action} check failed for ${step.selector}.`);
      }
      // Let completion handlers and promise rejections reach Chromium before recording success.
      await new Promise(resolve => setTimeout(resolve, 100));
      trace('checking errors and layout');
      const overflow = await frame.executeJavaScript('document.documentElement.scrollWidth > innerWidth + 2');
      if (overflow) errors.push('Page overflows the 1280px acceptance viewport.');
      if (errors.length) throw new Error(errors.slice(0, 5).join(' '));
      await onFrame(await window.webContents.capturePage());
      return { passed: true, checks, viewport: { width: 1280, height: 900 } };
    };
    return await Promise.race([work(), timeout]);
  } catch (error) { return { passed: false, checks, error: String(error.message).slice(0, 2000) }; }
  finally { clearTimeout(timer); clearInterval(bridgeTimer); signal?.removeEventListener('abort', stop); stop(); await isolated.clearStorageData(); }
}
module.exports = { checkBrowser };
