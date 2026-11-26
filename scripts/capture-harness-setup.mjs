// Credential-free Settings preview. No native CLI is started by this fixture.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { build } from 'vite';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = process.argv[2];
if (!['before', 'after'].includes(stage)) throw Error('Choose before or after.');
const temporary = fs.mkdtempSync(path.join(os.tmpdir(), 'archimedes-setup-preview-'));
const output = path.join(root, 'docs/assets/harness-onboarding'); fs.mkdirSync(output, { recursive: true });
const source = name => JSON.stringify(path.join(root, 'src', name));
const baseline = new Map(stage === 'before' ? ['AgentBackendSettings.tsx', 'styles.css'].map(name => [path.join(root, 'src', name), execFileSync('git', ['show', `398b3d9:src/${name}`], { cwd: root, encoding: 'utf8' })]) : []);
fs.writeFileSync(path.join(temporary, 'index.html'), '<div id="root"></div><script type="module" src="./entry.tsx"></script>');
fs.writeFileSync(path.join(temporary, 'entry.tsx'), `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {UISettingsProvider} from ${source('i18n.tsx')};
import Models from ${source('ModelSettingsModal.tsx')};
import ${source('tokens.css')}; import ${source('styles.css')}; import ${source('typography.css')};
document.documentElement.dataset.theme=new URLSearchParams(location.search).get('theme')||'paper';
const profiles=Object.fromEntries(['codex','claude','antigravity','opencode'].map(backend=>[backend,{binary:backend==='antigravity'?'agy':backend,model:'',effort:'',permissionMode:'ask'}]));
const bridge={getModelConfig:async()=>({provider:'custom',baseUrl:'https://example.test/v1',model:'example-model',hasApiKey:false}),getAgentBackendConfig:async()=>({backend:'api',...profiles.codex,profiles}),saveAgentBackendConfig:async x=>x,listCodexModelCatalog:async()=>({models:[]}),listOpenCodeModelCatalog:async()=>({models:[]}),detectHarnessCli:async({backend})=>({installed:false,backend,phase:'missing',docsUrl:'https://example.test'}),openExternalUrl:async()=>{}};
createRoot(document.getElementById('root')).render(<UISettingsProvider><main className={'theme-'+document.documentElement.dataset.theme} style={{display:'flex',flexDirection:'column',gap:16,padding:24,height:'100vh',boxSizing:'border-box',background:'var(--surface-ground)',color:'var(--text-primary)'}}><h2 style={{fontSize:18,margin:0}}>Models</h2><div style={{flex:1,minHeight:0}}><Models bridge={bridge} open embedded onClose={()=>{}} onSaved={()=>{}}/></div></main></UISettingsProvider>);
`);
await build({ root: temporary, configFile: false, base: './', resolve: { dedupe: ['react', 'react-dom'], alias: { react: path.join(root, 'node_modules/react'), 'react-dom': path.join(root, 'node_modules/react-dom') } }, plugins: [{ name: 'baseline', load(id) { return baseline.get(id); } }], build: { outDir: path.join(temporary, 'dist'), minify: false, chunkSizeWarningLimit: 2000 } });
function capture({temporary, output, stage}) {
  const {app,BrowserWindow}=require('electron');const fs=require('node:fs'),path=require('node:path');
  app.setPath('userData',path.join(temporary,'profile')); app.commandLine.appendSwitch('disable-gpu');
  const pause=()=>new Promise(resolve=>setTimeout(resolve,120));
  app.whenReady().then(async()=>{
    const win=new BrowserWindow({width:1100,height:1000,show:false,webPreferences:{contextIsolation:true,backgroundThrottling:false}});
    const run=(fn,arg)=>win.webContents.executeJavaScript('('+fn.toString()+')('+JSON.stringify(arg)+')');
    const results=[];
    for(const theme of ['paper','charcoal']) for(const width of [1100,680]) {
      win.setSize(width,1000); await win.loadFile(path.join(temporary,'dist/index.html'),{query:{theme}}); await pause();
      await run(()=>document.querySelector('[data-value=agents]').click());await pause();
      for(const name of ['Codex','Claude Code','Antigravity','OpenCode']) {
        await run(name=>document.querySelector('.agent-backend-card[aria-label="'+name+'"] .agent-backend-card-toggle').click(),name);await pause();
        await run(name=>document.querySelector('.agent-backend-card[aria-label="'+name+'"]').scrollIntoView({block:'start'}),name);await pause();
        const geometry=await run(name=>{
          const card=document.querySelector('.agent-backend-card[aria-label="'+name+'"]'); const panel=card.querySelector('.agent-backend-panel');
          return {width:card.getBoundingClientRect().width,overflow:panel.scrollWidth>panel.clientWidth+1,setup:!!card.querySelector('.harness-setup'),permissionSelect:!!card.querySelector('select[id$="antigravity-permissions"]')};
        },name);
        results.push({theme,viewport:width,name,...geometry});
        if(width===1100) fs.writeFileSync(path.join(output,theme+'-'+name.toLowerCase().replaceAll(' ','-')+'-'+stage+'.png'),(await win.webContents.capturePage()).toPNG());
      }
    }
    fs.writeFileSync(path.join(output,stage+'-geometry.json'),JSON.stringify(results,null,2)+'\n');console.log(JSON.stringify(results));
    win.destroy();fs.rmSync(temporary,{recursive:true,force:true});app.exit(results.some(r=>r.overflow)?1:0);
  }).catch(error=>{console.error(error);fs.rmSync(temporary,{recursive:true,force:true});app.exit(1)});
}
const runner=path.join(temporary,'capture.cjs');fs.writeFileSync(runner,'('+capture.toString()+')('+JSON.stringify({temporary,output,stage})+');');console.log(JSON.stringify({runner}));
