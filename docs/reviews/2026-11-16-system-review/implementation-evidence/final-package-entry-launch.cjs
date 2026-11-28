const fs=require('node:fs'),{spawn}=require('node:child_process');
const binary='/Users/fei/Desktop/Archimedes/release/mac-arm64/Archimedes.app/Contents/MacOS/Archimedes',port=19443;
const log=fs.openSync('/Users/fei/Desktop/Archimedes/docs/reviews/2026-11-16-system-review/implementation-evidence/final-package-entry-smoke.log','w');
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
const child=spawn(binary,[`--inspect-brk=127.0.0.1:${port}`],{env,stdio:['ignore',log,log]});
let client,seq=0,pending=new Map();
const send=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});client.send(JSON.stringify({id,method,params}));});
(async()=>{
 let list;
 for(let i=0;i<100;i++){try{list=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();break}catch{await new Promise(r=>setTimeout(r,50))}}
 if(!list?.[0])throw new Error('Node inspector did not start');
 client=new WebSocket(list[0].webSocketDebuggerUrl);await new Promise((r,j)=>{client.onopen=r;client.onerror=j});
 let injected=false;
 client.onmessage=async({data})=>{const message=JSON.parse(data);if(message.id){const promise=pending.get(message.id);pending.delete(message.id);message.error?promise.reject(new Error(message.error.message)):promise.resolve(message.result);return}
  if(message.method==='Debugger.paused'&&!injected){injected=true;try{const answer=await send('Debugger.evaluateOnCallFrame',{callFrameId:message.params.callFrames[0].callFrameId,expression:"require('/tmp/archimedes-final-package-smoke/setup.cjs')"});if(answer.exceptionDetails)throw new Error(JSON.stringify(answer.exceptionDetails));await send('Debugger.resume');await send('Debugger.disable');client.close()}catch(error){console.error(error);child.kill('SIGTERM')}}
 };
 await send('Debugger.enable');await send('Runtime.runIfWaitingForDebugger');
})().catch(error=>{console.error(error);child.kill('SIGTERM')});
const timer=setTimeout(()=>{console.error('Actual packaged executable smoke timeout');child.kill('SIGTERM')},75000);
child.on('exit',(code,signal)=>{clearTimeout(timer);client?.close();fs.closeSync(log);console.log(JSON.stringify({code,signal}));process.exitCode=code??1});
