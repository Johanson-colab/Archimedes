const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const asar = require("@electron/asar");

// Prepare only. The desktop owner runs entry.cjs with the prepared Electron.
// An actual packaged app.asar can be supplied; original dist bytes are retained.
async function prepareAudit({ sourceArchive, out = fs.mkdtempSync(path.join(os.tmpdir(), "archimedes-wasm-audit-")) } = {}) {
  const stage = path.join(out, "stage");
  const assets = path.join(stage, "dist/assets");
  fs.mkdirSync(assets, { recursive: true });
  if (sourceArchive) {
    for (const file of asar.listPackage(sourceArchive)) {
      const name = file.replace(/^\//, "");
      if (!name.startsWith("dist/assets/")) continue;
      const entry = asar.statFile(sourceArchive, name);
      if (entry.files) continue;
      const target = path.join(stage, name);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, asar.extractFile(sourceArchive, name));
    }
    if (asar.listPackage(sourceArchive).some(file => file.startsWith("/node_modules/onnxruntime-node/"))) throw new Error("The packaged app still includes onnxruntime-node.");
  } else fs.cpSync(path.join(__dirname, "../dist/assets"), assets, { recursive: true });
  const names = fs.readdirSync(assets);
  const worker = names.find(file => /^semantic-worker-.*\.js$/.test(file));
  const wasm = names.find(file => /^ort-wasm.*\.jsep-.*\.wasm$/.test(file));
  const module = names.find(file => /^ort-wasm.*\.jsep-.*\.mjs$/.test(file));
  if (!worker || !wasm || !module) throw new Error("Build assets are missing the semantic worker, JSEP WASM or ORT module.");
  fs.writeFileSync(path.join(assets, "resource-audit.mjs"), `
    try {
      await import(${JSON.stringify("./" + worker)});
      const response = await fetch(new URL(${JSON.stringify("./" + wasm)}, import.meta.url));
      if (!response.ok) throw new Error('WASM fetch: '+response.status);
      const bytes = await response.arrayBuffer();
      await WebAssembly.compile(bytes);
      const ort = await import(new URL(${JSON.stringify("./" + module)}, import.meta.url).href);
      self.postMessage({ok:true,workerImported:true,wasmBytes:bytes.byteLength,wasmCompiled:true,ortModuleLoaded:typeof ort.default==='function'});
    } catch (error) { self.postMessage({ok:false,error:error.message}); }
  `);
  fs.writeFileSync(path.join(stage, "audit.html"), `<!doctype html><meta charset="utf-8"><script>
    window.auditResult = new Promise(resolve => {
      const worker = new Worker('./dist/assets/resource-audit.mjs',{type:'module'});
      worker.onmessage = event => {worker.terminate();resolve(event.data)};
      worker.onerror = event => {worker.terminate();resolve({ok:false,error:event.message})};
    });
  </script>`);
  const archive = path.join(out, "resource-audit.asar");
  await asar.createPackage(stage, archive);
  const entry = path.join(out, "entry.cjs");
  fs.writeFileSync(entry, `
    if (!process.versions.electron) throw new Error('Run this audit with the prepared Electron executable.');
    const {app,BrowserWindow,session}=require('electron');const fs=require('node:fs');const path=require('node:path');
    app.setPath('userData',path.join(__dirname,'profile'));
    app.whenReady().then(async()=>{
      const remoteRequests=[];
      session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(details,done)=>{remoteRequests.push(details.url);done({cancel:true})});
      const win=new BrowserWindow({show:false,webPreferences:{sandbox:true,contextIsolation:true}});
      const timeout=setTimeout(()=>{console.error('Resource audit timed out');app.exit(1)},30000);
      await win.loadFile(${JSON.stringify(path.join(archive, "audit.html"))});
      const result=await win.webContents.executeJavaScript('window.auditResult');
      clearTimeout(timeout);result.sourceArchive=${JSON.stringify(sourceArchive || null)};result.kind='ASAR browser resource loading; not CLIP inference';result.remoteRequests=remoteRequests;
      fs.writeFileSync(path.join(__dirname,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
      win.destroy();app.exit(result.ok&&result.ortModuleLoaded&&remoteRequests.length===0?0:1);
    }).catch(error=>{console.error(error);app.exit(1)});
  `);
  return { directory: out, entry, archive, sourceArchive: sourceArchive || null, worker, wasm, module };
}

if (require.main === module) {
  const args = process.argv.slice(2);
  prepareAudit({ sourceArchive: args.includes("--asar") ? path.resolve(args[args.indexOf("--asar") + 1]) : undefined, out: args.includes("--out") ? path.resolve(args[args.indexOf("--out") + 1]) : undefined }).then(result => console.log(JSON.stringify(result, null, 2))).catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { prepareAudit };
