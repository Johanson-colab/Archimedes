const {app,BrowserWindow,session,nativeTheme}=require('electron');
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const root=__dirname, archive='/Users/fei/Desktop/Archimedes/release/mac-arm64/Archimedes.app/Contents/Resources/app.asar';
const sourceProfile='/private/var/folders/y6/7f277x5n4z14sqwsw21h8ffm0000gn/T/archimedes-final-journeys-mi137r7a/profile';
if(!fs.existsSync(path.join(root,'profile')))fs.cpSync(sourceProfile,path.join(root,'profile'),{recursive:true,filter:source=>!source.includes('/latex-runtime')&&!source.includes('/Code Cache')&&!source.includes('/GPUCache')});
app.setPath('userData',path.join(root,'profile'));app.setPath('sessionData',path.join(root,'session'));nativeTheme.themeSource='dark';
require(archive+'/electron/config.cjs').loadLocalAgentEnvironment=()=>{};
const figures=[{id:'local-transformer',title:'Transformer architecture pipeline',venue:'iclr',year:2025,authors:['Fixture Author'],paper:'https://example.invalid/paper',pattern:'pipeline',tier:'main',image:'images/iclr/final/local-transformer.jpg'}];
const server=http.createServer((req,res)=>{res.setHeader('Access-Control-Allow-Origin','*');const name=new URL(req.url,'http://local').pathname;
 if(name.endsWith('/manifest.json'))return res.end(JSON.stringify({dataVersion:'local-package-smoke'}));
 if(name.endsWith('/figures.json'))return res.end(JSON.stringify(figures));
 if(name.endsWith('/ids.json'))return res.end(JSON.stringify(figures.map(f=>f.id)));
 if(name.endsWith('/bm25.json'))return res.end(JSON.stringify({docs:[['transformer','architecture','pipeline']]}));
 res.writeHead(503);res.end('Semantic/model network deliberately unavailable in local fallback smoke');
});
const requests=[],result={archive,kind:'Actual packaged Archimedes executable/main/preload/renderer; inspector sets isolated profile before main entry'};
let started=false;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(()=>new Promise(resolve=>server.listen(0,'127.0.0.1',()=>{
 session.defaultSession.webRequest.onBeforeRequest({urls:['http://*/*','https://*/*']},(details,done)=>{
  const url=new URL(details.url);requests.push(url.hostname+url.pathname);
  if(url.hostname==='127.0.0.1')return done({});
  if(url.hostname==='qwdwqfwq.github.io')return done({redirectURL:`http://127.0.0.1:${server.address().port}${url.pathname}${url.search}`});
  done({cancel:true});
 });resolve();
})));
app.on('browser-window-created',(_event,win)=>{
 win.webContents.once('did-finish-load',async()=>{
  if(started)return;started=true;
  const js=code=>win.webContents.executeJavaScript(code);
  const click=async(text)=>{await js(`(()=>{const button=[...document.querySelectorAll('button')].find(b=>b.innerText.trim().split(String.fromCharCode(10))[0]===${JSON.stringify(text)});if(!button)throw new Error('Button missing: '+${JSON.stringify(text)});button.click()})()`);await delay(350)};
  const wait=async(code)=>{for(let i=0;i<60;i++){if(await js(code))return;await delay(250)}throw new Error('UI state timed out: '+code)};
  try{
   await delay(1000);
   result.buildInfo=require(archive+'/electron/build-info.cjs').getBuildInfo({isPackaged:true,appPath:archive});
   const pty=require(archive+'/node_modules/node-pty');result.nativePty=await new Promise((resolve,reject)=>{let text='';const child=pty.spawn('/bin/sh',['-c','printf packaged-pty-ready'],{cwd:root});child.onData(data=>text+=data);child.onExit(({exitCode})=>exitCode===0&&text==='packaged-pty-ready'?resolve({exitCode,text}):reject(new Error('Packaged PTY output '+text)));});
   await js(`(()=>{const b=[...document.querySelectorAll('.project-select')].find(b=>b.innerText.startsWith('Restored Workflow'));if(b.getAttribute('aria-expanded')!=='true')b.click()})()`);await delay(250);await js(`([...document.querySelectorAll('.project-select')].find(b=>b.innerText.startsWith('Restored Workflow'))).closest('.project-node').querySelector('.project-chat-open').click()`);await delay(600);await click('Reproduce');
   await wait(`!![...document.querySelectorAll('button')].find(b=>b.innerText.includes('Local recorded experiment'))`);
   await js(`([...document.querySelectorAll('button')].find(b=>b.innerText.includes('Local recorded experiment'))).click()`);
   await wait(`!!document.querySelector('.metric-comparison-panel')`);
   await js(`document.querySelector('.metric-comparison-history button').click()`);await wait(`!!document.querySelector('.metric-comparison-result')`);result.metricStyles=await js(`(()=>{const panel=document.querySelector('.metric-comparison-panel');panel.scrollIntoView({block:'center'});const button=panel.querySelector('button'),title=panel.querySelector('h3'),s=getComputedStyle(button);return {buttonClass:button.className,buttonFont:s.fontSize,buttonBackground:s.backgroundColor,titleFont:getComputedStyle(title).fontSize,panelText:panel.innerText}})()`);
   assert.match(result.metricStyles.buttonClass,/secondary-button/);
   await delay(300);fs.writeFileSync(path.join(root,'metric-comparison-after.jpg'),(await win.webContents.capturePage()).toJPEG(90));
   await js(`window.researchDesk.setCoreModuleEnabled('image-creation',true)`);
   win.webContents.reload();await new Promise(resolve=>win.webContents.once('did-finish-load',resolve));await delay(700);
   result.buttons=await js(`[...document.querySelectorAll('button')].map(b=>b.innerText.trim()).filter(Boolean)`);
   await click('Figure generation');
   await wait(`!!document.querySelector('.forge-plan textarea')`);
   await js(`(()=>{const e=document.querySelector('.forge-plan textarea');Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype,'value').set.call(e,'transformer architecture pipeline');e.dispatchEvent(new Event('input',{bubbles:true}));})()`);await delay(200);
   await click('Search references');await wait(`document.body.innerText.includes('Semantic search unavailable; showing keyword results.')&&document.querySelectorAll('.figure-forge-results button').length>0`);
   result.keywordFallback=await js(`({status:[...document.querySelectorAll('[role="status"]')].map(e=>e.innerText).find(t=>t.includes('Semantic search unavailable')),results:[...document.querySelectorAll('.figure-forge-results button')].map(b=>b.innerText)})`);
   result.requests=requests;result.ok=true;fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({ok:true,nativePty:result.nativePty,keywordFallback:result.keywordFallback,metricStyles:result.metricStyles}));
   await new Promise(resolve=>server.close(resolve));app.quit();
  }catch(error){result.ok=false;result.error=error.stack;result.requests=requests;result.body=await js('document.body.innerText').catch(()=>null);fs.writeFileSync(path.join(root,'result.json'),JSON.stringify(result,null,2));console.error(error);server.close();app.exit(1)}
 });
});
setTimeout(()=>{console.error('Package smoke timeout');app.exit(1)},60000).unref();
